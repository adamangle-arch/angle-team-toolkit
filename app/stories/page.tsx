"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { getTodayStoryPrompt, isPrimaryUser } from "@/lib/constants";
import { fireNotifyEvent } from "@/lib/notifyClient";
import type { StoryPost, TeamMemberBasic } from "@/lib/types";

type PageTab = "prompt" | "pulse";

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

function personName(entry: { first_name: string | null; last_name: string | null }): string {
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(" ");
  return name || "Unnamed";
}

// "Posted 4h ago" / "Expires in 6h" - both derived from the same
// created_at, so there's no separate "expires_at" to keep in sync; a
// story just stops coming back from get_active_stories() once its own
// 24h window passes.
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

export default function StoriesPage() {
  const { user, activeUserIds } = useAuth();
  const isAdmin = isPrimaryUser(user.email);
  const prompt = getTodayStoryPrompt();

  const [pageTab, setPageTab] = useState<PageTab>("prompt");
  const [teamMembers, setTeamMembers] = useState<TeamMemberBasic[] | null>(null);

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

  // Lazy - only fetched the first time someone taps Pulse, reusing the
  // same team-wide roster RPC Leaderboard's Spotlight tab already added
  // (get_all_team_members). Which of them are actually online comes from
  // AuthGate's Realtime Presence channel (activeUserIds), not from this.
  useEffect(() => {
    if (pageTab !== "pulse" || teamMembers !== null) return;
    let cancelled = false;
    supabase.rpc("get_all_team_members").then(({ data }) => {
      if (!cancelled) setTeamMembers((data as TeamMemberBasic[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [pageTab, teamMembers]);

  const activeMembers = (teamMembers ?? []).filter((m) => activeUserIds.includes(m.user_id));

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
        setPostError(uploadError.message);
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

  return (
    <>
      <PageHeader title="Stories" subtitle="Today's prompt - posts disappear after 24h" />
      <main className="page-main">
        <div className="card flex p-1">
          <button
            className={pageTab === "prompt" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setPageTab("prompt")}
          >
            Today&apos;s Prompt
          </button>
          <button
            className={pageTab === "pulse" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setPageTab("pulse")}
          >
            Pulse
          </button>
        </div>

        {pageTab === "pulse" ? (
          <div className="card space-y-2">
            <p className="section-title">🟢 Active Now</p>
            {teamMembers === null ? (
              <SkeletonList cards={1} lines={3} />
            ) : activeMembers.length === 0 ? (
              <p className="empty-state">No one else has the app open right now.</p>
            ) : (
              <div className="space-y-1.5">
                {activeMembers.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                    <Link
                      href={`/profile/${m.user_id}`}
                      className="text-slate-200 underline decoration-dotted underline-offset-2"
                    >
                      {[m.first_name, m.last_name].filter(Boolean).join(" ") || "Unnamed"}
                    </Link>
                    {m.user_id === user.id && <span className="text-xs text-slate-500">(you)</span>}
                    <span className="text-xs text-slate-500">{m.team}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
        <div className="card space-y-3">
          <p className="section-title">📸 Today&apos;s Prompt</p>
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
                <button
                  className="btn-secondary flex-1"
                  onClick={discardPending}
                  disabled={posting}
                >
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
                  {uploading ? "Uploading…" : "📷 Post a Photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleSelectFile}
                    disabled={uploading}
                  />
                </label>
                <label className="btn-secondary flex-1 cursor-pointer text-center">
                  {uploading ? "Uploading…" : "🎥 Post a Video"}
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
          stories.map((story) => (
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
              <p className="text-xs text-slate-500">{expiresLabel(story.created_at)}</p>
            </div>
          ))
        )}
          </>
        )}
      </main>
    </>
  );
}
