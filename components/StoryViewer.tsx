"use client";

import { useEffect, useRef, useState } from "react";
import { X, Heart, Trash2 } from "lucide-react";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { fireNotifyEvent } from "@/lib/notifyClient";
import { isPrimaryUser } from "@/lib/constants";
import type { StoryPost } from "@/lib/types";

const PHOTO_DURATION_MS = 5000;

function personName(entry: { first_name: string | null; last_name: string | null }): string {
  return [entry.first_name, entry.last_name].filter(Boolean).join(" ") || "Unnamed";
}

function timeAgoLabel(iso: string): string {
  const hrs = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
  if (hrs < 1) return `${Math.max(1, Math.round(hrs * 60))}m ago`;
  return `${Math.round(hrs)}h ago`;
}

function storyLikeKey(storyId: string): string {
  return `story:${storyId}`;
}

// Full-screen, tap-to-advance viewer for one person's active stories, in
// posting order (oldest first, same as opening someone's Instagram/
// Snapchat story from the top). Deliberately self-contained (fetches its
// own like state, doesn't need the caller to already have Stories page
// state loaded) since it's opened from four different pages
// (Stories, Who's Active, Leaderboard, Profile) that don't share that
// state - the trade-off is comments stay list-only on the Stories page
// itself rather than duplicating that whole thread UI here too.
export default function StoryViewer({
  stories,
  startIndex = 0,
  onClose,
  onStoryRemoved,
}: {
  stories: StoryPost[];
  startIndex?: number;
  onClose: () => void;
  onStoryRemoved?: (storyId: string) => void;
}) {
  const { user } = useAuth();
  const isAdmin = isPrimaryUser(user.email);
  const [index, setIndex] = useState(Math.min(startIndex, stories.length - 1));
  const [likes, setLikes] = useState<{ count: number; likedByMe: boolean }>({ count: 0, likedByMe: false });
  const [deleting, setDeleting] = useState(false);
  const [videoProgressPct, setVideoProgressPct] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const story = stories[index];

  function goNext() {
    setVideoProgressPct(0);
    setIndex((i) => {
      if (i + 1 >= stories.length) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }

  function goPrev() {
    setVideoProgressPct(0);
    setIndex((i) => Math.max(0, i - 1));
  }

  // Auto-advance for photos on a fixed timer; videos advance themselves
  // via onEnded below instead, since their real length is what matters.
  useEffect(() => {
    if (!story || story.media_type === "video") return;
    timerRef.current = setTimeout(goNext, PHOTO_DURATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, story?.media_type]);

  useEffect(() => {
    if (!story) return;
    let cancelled = false;
    supabase.rpc("get_likers", { p_entry_keys: [storyLikeKey(story.story_id)] }).then(({ data }) => {
      if (cancelled) return;
      const rows = (data as { user_id: string }[]) ?? [];
      setLikes({ count: rows.length, likedByMe: rows.some((r) => r.user_id === user.id) });
    });
    return () => {
      cancelled = true;
    };
  }, [story, user.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!story) return null;

  async function toggleLike() {
    if (!story) return;
    const key = storyLikeKey(story.story_id);
    if (likes.likedByMe) {
      setLikes((prev) => ({ count: Math.max(0, prev.count - 1), likedByMe: false }));
      await supabase.from("leaderboard_likes").delete().eq("entry_key", key).eq("liker_id", user.id);
    } else {
      setLikes((prev) => ({ count: prev.count + 1, likedByMe: true }));
      await supabase.from("leaderboard_likes").insert({ entry_key: key, liker_id: user.id });
      if (story.user_id !== user.id) {
        fireNotifyEvent({ kind: "story_liked", targetUserId: story.user_id });
      }
    }
  }

  async function handleDelete() {
    if (!story) return;
    setDeleting(true);
    const { error } = await supabase.from("story_posts").delete().eq("id", story.story_id);
    setDeleting(false);
    if (error) return;
    onStoryRemoved?.(story.story_id);
    if (stories.length <= 1) {
      onClose();
    } else {
      goNext();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onClick={(e) => {
        const x = e.clientX;
        const third = window.innerWidth / 3;
        if (x < third) goPrev();
        else if (x > third * 2) goNext();
      }}
    >
      <div className="flex gap-1 px-3 pt-3">
        {stories.map((s, i) => (
          <div key={s.story_id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className={`h-full bg-white ${
                i === index && s.media_type === "photo" ? "animate-story-progress" : ""
              }`}
              style={{
                width:
                  i < index
                    ? "100%"
                    : i > index
                      ? "0%"
                      : s.media_type === "video"
                        ? `${videoProgressPct}%`
                        : undefined,
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 pt-3 text-white">
        <div>
          <p className="text-sm font-semibold">{personName(story)}</p>
          <p className="text-xs text-white/60">
            {story.team ? `${story.team} — ` : ""}
            {timeAgoLabel(story.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(story.user_id === user.id || isAdmin) && (
            <button
              type="button"
              className="rounded-full bg-white/10 p-2 active:scale-90"
              aria-label="Take down"
              disabled={deleting}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          )}
          <button
            type="button"
            className="rounded-full bg-white/10 p-2 active:scale-90"
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-2 py-2">
        {story.media_type === "video" ? (
          <video
            key={story.story_id}
            src={story.media_url}
            autoPlay
            playsInline
            controls
            className="max-h-full max-w-full rounded-xl"
            onEnded={goNext}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setVideoProgressPct((v.currentTime / v.duration) * 100);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={story.media_url}
            alt="Story"
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        )}
      </div>

      <div className="space-y-2 px-4 pb-6 pt-2">
        <p className="text-xs text-white/50">{story.prompt}</p>
        {story.caption && <p className="text-sm text-white">{story.caption}</p>}
        <button
          type="button"
          className={`flex items-center gap-1.5 text-sm transition active:scale-90 ${
            likes.likedByMe ? "text-amber-light" : "text-white/70"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            toggleLike();
          }}
        >
          <Heart className={`h-4 w-4 ${likes.likedByMe ? "fill-current" : ""}`} aria-hidden />
          {likes.count > 0 ? likes.count : "Like"}
        </button>
      </div>
    </div>
  );
}
