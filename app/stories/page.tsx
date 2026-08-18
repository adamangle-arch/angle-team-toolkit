"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Heart, MessageCircle, Video } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import AvatarWithStory from "@/components/AvatarWithStory";
import { supabase } from "@/lib/supabaseClient";
import { getTodayStoryPrompt, isPrimaryUser } from "@/lib/constants";
import { fireNotifyEvent } from "@/lib/notifyClient";
import { pointsForBadgeKeys, levelForPoints } from "@/lib/levels";
import type { StoryPost, StoryComment, Liker } from "@/lib/types";

function uniqueId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Phone camera photos routinely run 3-8MB each - resizing to a sane max
// dimension and re-encoding as JPEG before it ever leaves the device
// cuts that by 80-90% (same fix already applied to Team Events uploads,
// for the same reason). Falls back to the original file untouched if
// decoding fails or the "compressed" result would somehow be bigger.
const MAX_UPLOAD_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// Supabase Storage's raw rejection ("The object exceeded the maximum
// allowed size") doesn't say what to actually do about it - translate it
// into something actionable, same pattern as Pipeline's
// friendlyPeriodError. Story videos aren't compressed client-side the
// way photos are (compressImage above), so a longer or higher-quality
// clip is the most likely cause.
function friendlyUploadError(message: string): string {
  return message.toLowerCase().includes("exceeded the maximum allowed size")
    ? "That video is too large to upload. Try a shorter clip, or lower the camera's video quality/resolution before recording."
    : message;
}

function personName(entry: { first_name: string | null; last_name: string | null }): string {
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(" ");
  return name || "Unnamed";
}

// "Posted 4h ago" / "Expires in 6h" - both derived from the same
// created_at, so there's no separate "expires_at" to keep in sync; a
// story just stops coming back from get_active_stories() once its own
// 24h window passes. Also reused for comment timestamps - both are just
// "how long since this instant."
function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

function timeAgoLabel(iso: string): string {
  const hrs = hoursSince(iso);
  if (hrs < 1) {
    const mins = Math.max(1, Math.round(hrs * 60));
    return `${mins}m ago`;
  }
  return `${Math.round(hrs)}h ago`;
}

function expiresLabel(iso: string): string {
  const remaining = Math.max(0, 24 - hoursSince(iso));
  if (remaining < 1) return "Expires soon";
  return `Expires in ${Math.ceil(remaining)}h`;
}

function storyLikeKey(storyId: string): string {
  return `story:${storyId}`;
}

type LikeInfo = { count: number; likedByMe: boolean; names: string[] };
const NO_LIKES: LikeInfo = { count: 0, likedByMe: false, names: [] };

export default function StoriesPage() {
  const { user } = useAuth();
  const isAdmin = isPrimaryUser(user.email);
  const prompt = getTodayStoryPrompt();

  const [stories, setStories] = useState<StoryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // The photo/video uploads as soon as it's picked (so the preview below
  // has something real to show), but doesn't actually post to the feed
  // until the caption step is confirmed - previously the caption box only
  // existed before picking a file, so writing one meant guessing at it
  // sight-unseen instead of reacting to the actual photo/video.
  const [uploading, setUploading] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{
    url: string;
    path: string;
    type: "photo" | "video";
  } | null>(null);

  // Likes - reuses the existing leaderboard_likes table/get_likers RPC
  // (entry_key is already a free-form string, nothing leaderboard-
  // specific about its schema) instead of a second near-identical table.
  const [likesMap, setLikesMap] = useState<Map<string, LikeInfo>>(new Map());
  const [myName, setMyName] = useState("You");
  // Who liked - collapsed behind an on-demand "who?" tap next to the
  // heart (same pattern Leaderboard's LikeButton already uses), rather
  // than always rendering under every story.
  const [showLikeNamesFor, setShowLikeNamesFor] = useState<Set<string>>(new Set());

  // Comments - collapsed by default per story; only fetched the first
  // time a given story's thread is actually opened.
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentsByStory, setCommentsByStory] = useState<Map<string, StoryComment[]>>(new Map());
  const [commentDrafts, setCommentDrafts] = useState<Map<string, string>>(new Map());
  const [postingCommentFor, setPostingCommentFor] = useState<string | null>(null);

  // Avatar/level for the story tray below - same two bulk RPCs and
  // points->level derivation Leaderboard already uses, fetched once
  // per page visit since a person's photo/level don't change mid-visit.
  const [photoByUserId, setPhotoByUserId] = useState<Map<string, string>>(new Map());
  const [levelByUserId, setLevelByUserId] = useState<Map<string, number>>(new Map());

  async function load() {
    const { data } = await supabase.rpc("get_active_stories");
    setStories((data as StoryPost[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!cancelled) await load();
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadLevels() {
      const [{ data: photos }, { data: badgeRows }] = await Promise.all([
        supabase.rpc("get_all_public_photos"),
        supabase.rpc("get_all_earned_badge_keys"),
      ]);
      if (cancelled) return;

      const photoMap = new Map<string, string>();
      for (const row of (photos as { user_id: string; photo_url: string }[]) ?? []) {
        photoMap.set(row.user_id, row.photo_url);
      }

      const keysByUser = new Map<string, string[]>();
      for (const row of (badgeRows as { individual_id: string; badge_key: string }[]) ?? []) {
        const list = keysByUser.get(row.individual_id) ?? [];
        list.push(row.badge_key);
        keysByUser.set(row.individual_id, list);
      }
      const levelMap = new Map<string, number>();
      for (const [uid, keys] of keysByUser) {
        levelMap.set(uid, levelForPoints(pointsForBadgeKeys(keys)));
      }

      setPhotoByUserId(photoMap);
      setLevelByUserId(levelMap);
    }
    loadLevels();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("profiles")
      .select("first_name,last_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const n = [data.first_name, data.last_name].filter(Boolean).join(" ");
        if (n) setMyName(n);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Refetches whenever the visible story list changes (a new post, a
  // take-down) - low enough volume that a full refetch over a plain diff
  // is simpler and not worth optimizing.
  useEffect(() => {
    let cancelled = false;
    async function loadLikes() {
      const keys = stories.map((s) => storyLikeKey(s.story_id));
      if (keys.length === 0) {
        setLikesMap(new Map());
        return;
      }
      const { data } = await supabase.rpc("get_likers", { p_entry_keys: keys });
      const map = new Map<string, LikeInfo>();
      for (const l of (data as Liker[]) ?? []) {
        const existing = map.get(l.entry_key) ?? { count: 0, likedByMe: false, names: [] };
        existing.count += 1;
        if (l.user_id === user.id) existing.likedByMe = true;
        existing.names.push([l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed");
        map.set(l.entry_key, existing);
      }
      if (!cancelled) setLikesMap(map);
    }
    loadLikes();
    return () => {
      cancelled = true;
    };
  }, [stories, user.id]);

  async function handleSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPostError(null);
    setUploading(true);
    try {
      const isVideo = file.type.startsWith("video/");
      const toUpload = isVideo ? file : await compressImage(file);
      const ext = isVideo ? file.name.split(".").pop() || "mp4" : "jpg";
      const path = `${user.id}/${uniqueId()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("story-photos").upload(path, toUpload);
      if (uploadError) {
        setPostError(friendlyUploadError(uploadError.message));
        return;
      }
      const { data } = supabase.storage.from("story-photos").getPublicUrl(path);
      setPendingMedia({ url: data.publicUrl, path, type: isVideo ? "video" : "photo" });
    } finally {
      setUploading(false);
    }
  }

  async function confirmPost() {
    if (!pendingMedia) return;
    setPostError(null);
    setPosting(true);
    try {
      const { error: insertError } = await supabase.from("story_posts").insert({
        user_id: user.id,
        prompt,
        media_url: pendingMedia.url,
        media_type: pendingMedia.type,
        caption: caption.trim(),
      });
      if (insertError) {
        setPostError(insertError.message);
        return;
      }
      fireNotifyEvent({ kind: "story_posted" });
      setCaption("");
      setPendingMedia(null);
      await load();
    } finally {
      setPosting(false);
    }
  }

  async function discardPending() {
    if (pendingMedia) {
      await supabase.storage.from("story-photos").remove([pendingMedia.path]);
    }
    setPendingMedia(null);
    setCaption("");
    setPostError(null);
  }

  async function handleDelete(storyId: string) {
    setDeletingId(storyId);
    const { error } = await supabase.from("story_posts").delete().eq("id", storyId);
    if (!error) {
      setStories((prev) => prev.filter((s) => s.story_id !== storyId));
    }
    setDeletingId(null);
  }

  async function toggleLike(story: StoryPost) {
    const key = storyLikeKey(story.story_id);
    const current = likesMap.get(key) ?? NO_LIKES;
    const optimistic = new Map(likesMap);
    if (current.likedByMe) {
      optimistic.set(key, {
        count: Math.max(0, current.count - 1),
        likedByMe: false,
        names: current.names.filter((n) => n !== myName),
      });
      setLikesMap(optimistic);
      await supabase.from("leaderboard_likes").delete().eq("entry_key", key).eq("liker_id", user.id);
    } else {
      optimistic.set(key, { count: current.count + 1, likedByMe: true, names: [...current.names, myName] });
      setLikesMap(optimistic);
      await supabase.from("leaderboard_likes").insert({ entry_key: key, liker_id: user.id });
      if (story.user_id !== user.id) {
        fireNotifyEvent({ kind: "story_liked", targetUserId: story.user_id });
      }
    }
  }

  async function toggleComments(storyId: string) {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(storyId)) {
        next.delete(storyId);
      } else {
        next.add(storyId);
      }
      return next;
    });
    if (!commentsByStory.has(storyId)) {
      const { data } = await supabase.rpc("get_story_comments", { p_story_id: storyId });
      setCommentsByStory((prev) => new Map(prev).set(storyId, (data as StoryComment[]) ?? []));
    }
  }

  async function postComment(story: StoryPost) {
    const body = (commentDrafts.get(story.story_id) ?? "").trim();
    if (!body) return;
    setPostingCommentFor(story.story_id);
    const { data, error } = await supabase
      .from("story_comments")
      .insert({ story_id: story.story_id, user_id: user.id, body })
      .select("*")
      .single();
    setPostingCommentFor(null);
    if (error || !data) return;
    // first_name alone carries the whole display name (last_name left
    // null) - personName() joins the two and drops nulls, so this renders
    // identically to a real {first_name, last_name} row without having to
    // split myName apart to guess at the two fields.
    const newComment: StoryComment = {
      id: data.id,
      user_id: user.id,
      first_name: myName,
      last_name: null,
      team: null,
      body,
      created_at: data.created_at,
    };
    setCommentsByStory((prev) => {
      const next = new Map(prev);
      next.set(story.story_id, [...(next.get(story.story_id) ?? []), newComment]);
      return next;
    });
    setCommentDrafts((prev) => new Map(prev).set(story.story_id, ""));
    if (story.user_id !== user.id) {
      fireNotifyEvent({
        kind: "story_commented",
        targetUserId: story.user_id,
        commentPreview: body.length > 80 ? `${body.slice(0, 80)}…` : body,
      });
    }
  }

  // The tap-a-face tray at the top, Instagram/Snapchat-style: one bubble
  // per person who currently has an active story (chronological within
  // each person, oldest first, matching StoryViewer's own playback
  // order), most-recently-posted person first left to right - grouped
  // straight from the same flat `stories` list the list below already
  // has, no second fetch needed.
  const trayByUser = new Map<string, StoryPost[]>();
  for (const s of stories) {
    const list = trayByUser.get(s.user_id) ?? [];
    list.push(s);
    trayByUser.set(s.user_id, list);
  }
  const tray = Array.from(trayByUser.entries())
    .map(([userId, userStories]) => ({
      userId,
      stories: userStories.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }))
    .sort((a, b) => {
      const aLatest = a.stories[a.stories.length - 1].created_at;
      const bLatest = b.stories[b.stories.length - 1].created_at;
      return bLatest.localeCompare(aLatest);
    });

  return (
    <>
      <PageHeader title="Stories" subtitle="Today's prompt - posts disappear after 24h" />
      <main className="page-main">
        {tray.length > 0 && (
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-0.5">
            {tray.map((entry) => {
              const first = entry.stories[0];
              return (
                <AvatarWithStory
                  key={entry.userId}
                  userId={entry.userId}
                  photoUrl={photoByUserId.get(entry.userId) ?? null}
                  level={levelByUserId.get(entry.userId) ?? 1}
                  size="sm"
                  showLevelChip={false}
                  name={personName(first)}
                  stories={entry.stories}
                  className="flex w-14 shrink-0 flex-col items-center gap-1 text-center"
                >
                  <span className="w-full truncate text-[10px] text-slate-300">
                    {entry.userId === user.id ? "You" : first.first_name || "Unnamed"}
                  </span>
                </AvatarWithStory>
              );
            })}
          </div>
        )}
        <div className="card space-y-3">
          <p className="section-title flex items-center gap-1.5">
            <Camera className="h-4 w-4" aria-hidden />
            Today&apos;s Prompt
          </p>
              <p className="text-sm text-slate-200">{prompt}</p>

              {pendingMedia ? (
                <>
                  {pendingMedia.type === "video" ? (
                    <video
                      src={pendingMedia.url}
                      controls
                      className="w-full rounded-xl"
                      style={{ maxHeight: "50vh" }}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pendingMedia.url}
                      alt="Selected story preview"
                      className="w-full rounded-xl object-cover"
                      style={{ maxHeight: "50vh" }}
                    />
                  )}
                  <input
                    autoFocus
                    className="input"
                    placeholder="Add a caption (optional)"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    disabled={posting}
                  />
                  <div className="flex gap-2">
                    <button className="btn-secondary flex-1" onClick={discardPending} disabled={posting}>
                      Discard
                    </button>
                    <button className="btn-primary flex-1" onClick={confirmPost} disabled={posting}>
                      {posting ? "Posting…" : "Post"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Separate photo/video pickers, neither with a `capture`
                      attribute - that's what forces straight to the camera
                      instead of showing the normal picker (Photo Library/Take
                      Photo/Choose File), which is the whole point here: picking
                      an existing photo or video, not just shooting a new one. */}
                  <div className="flex gap-2">
                    <label className="btn-primary flex-1 cursor-pointer text-center">
                      {uploading ? (
                        "Uploading…"
                      ) : (
                        <>
                          <Camera className="h-3.5 w-3.5" aria-hidden />
                          Post a Photo
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleSelectFile}
                        disabled={uploading}
                      />
                    </label>
                    <label className="btn-secondary flex-1 cursor-pointer text-center">
                      {uploading ? (
                        "Uploading…"
                      ) : (
                        <>
                          <Video className="h-3.5 w-3.5" aria-hidden />
                          Post a Video
                        </>
                      )}
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleSelectFile}
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </>
              )}
              {postError && <p className="text-xs text-red-400">{postError}</p>}
            </div>

            {loading ? (
              <SkeletonList cards={3} lines={4} />
            ) : stories.length === 0 ? (
              <div className="empty-state">No stories yet today — be the first to post!</div>
            ) : (
              stories.map((story) => {
                const likeKey = storyLikeKey(story.story_id);
                const likes = likesMap.get(likeKey) ?? NO_LIKES;
                const commentsOpen = expandedComments.has(story.story_id);
                const comments = commentsByStory.get(story.story_id) ?? [];
                return (
                  <div key={story.story_id} className="card space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-200">
                        <Link
                          href={`/profile/${story.user_id}`}
                          className="font-semibold text-white underline decoration-dotted underline-offset-2"
                        >
                          {personName(story)}
                        </Link>{" "}
                        <span className="text-xs text-slate-500">
                          ({story.team}) — {timeAgoLabel(story.created_at)}
                        </span>
                      </span>
                      {(story.user_id === user.id || isAdmin) && (
                        <button
                          className="chip-btn shrink-0 text-xs"
                          onClick={() => handleDelete(story.story_id)}
                          disabled={deletingId === story.story_id}
                        >
                          {deletingId === story.story_id ? "Removing…" : "Take Down"}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{story.prompt}</p>
                    {story.media_type === "video" ? (
                      <video
                        src={story.media_url}
                        controls
                        className="w-full rounded-xl"
                        style={{ maxHeight: "70vh" }}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={story.media_url}
                        alt="Story post"
                        className="w-full rounded-xl object-cover"
                        style={{ maxHeight: "70vh" }}
                      />
                    )}
                    {story.caption && <p className="text-sm text-slate-300">{story.caption}</p>}

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => toggleLike(story)}
                        className={`flex items-center gap-1 text-sm transition active:scale-90 ${
                          likes.likedByMe ? "text-amber-light" : "text-slate-400"
                        }`}
                        aria-label={likes.likedByMe ? "Unlike" : "Like"}
                      >
                        <Heart className={`h-3.5 w-3.5 ${likes.likedByMe ? "fill-current" : ""}`} aria-hidden />
                        {likes.count > 0 && <span>{likes.count}</span>}
                      </button>
                      {likes.names.length > 0 && (
                        <button
                          onClick={() =>
                            setShowLikeNamesFor((prev) => {
                              const next = new Set(prev);
                              if (next.has(story.story_id)) next.delete(story.story_id);
                              else next.add(story.story_id);
                              return next;
                            })
                          }
                          className="text-xs text-slate-500 underline"
                          aria-label={
                            showLikeNamesFor.has(story.story_id) ? "Hide who liked this" : "Show who liked this"
                          }
                        >
                          who?
                        </button>
                      )}
                      <button
                        onClick={() => toggleComments(story.story_id)}
                        className="flex items-center gap-1 text-sm text-slate-400"
                      >
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                        {comments.length > 0 ? comments.length : "Comment"}
                      </button>
                    </div>

                    {showLikeNamesFor.has(story.story_id) && likes.names.length > 0 && (
                      <p className="text-xs text-slate-400">Liked by {likes.names.join(", ")}</p>
                    )}

                    {commentsOpen && (
                      <div className="space-y-2 border-t border-white/5 pt-2">
                        {comments.map((c) => (
                          <div key={c.id} className="text-xs">
                            <span className="font-medium text-slate-200">{personName(c)}</span>{" "}
                            <span className="text-slate-400">{c.body}</span>{" "}
                            <span className="text-slate-600">· {timeAgoLabel(c.created_at)}</span>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <input
                            className="input flex-1 !py-1.5 text-xs"
                            placeholder="Add a comment…"
                            value={commentDrafts.get(story.story_id) ?? ""}
                            onChange={(e) =>
                              setCommentDrafts((prev) => new Map(prev).set(story.story_id, e.target.value))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") postComment(story);
                            }}
                            disabled={postingCommentFor === story.story_id}
                          />
                          <button
                            className="chip-btn shrink-0 text-xs"
                            onClick={() => postComment(story)}
                            disabled={
                              postingCommentFor === story.story_id || !(commentDrafts.get(story.story_id) ?? "").trim()
                            }
                          >
                            {postingCommentFor === story.story_id ? "…" : "Send"}
                          </button>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-slate-500">{expiresLabel(story.created_at)}</p>
                  </div>
                );
              })
            )}
      </main>
    </>
  );
}
