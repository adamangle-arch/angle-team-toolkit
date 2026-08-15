"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/lib/types";

// Unlisted YouTube video, not self-hosted - Supabase's free-tier Storage
// caps uploads at 50MB, well under an 11-minute video's real size, and
// upgrading to Pro just to host one file isn't worth a recurring cost.
// "Unlisted" means it's playable by link/embed but not searchable and
// doesn't show on the channel. Swap this id any time the video changes;
// nothing else needs to.
const WELCOME_VIDEO_YOUTUBE_ID = "REPLACE_WITH_YOUTUBE_ID";

type YTPlayer = { destroy: () => void };
type YTPlayerStateEvent = { data: number };

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: { onStateChange?: (e: YTPlayerStateEvent) => void };
        }
      ) => YTPlayer;
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Loads the YouTube IFrame Player API script at most once per page,
// regardless of how many times this component mounts - a second
// injected <script> tag would just re-fire onYouTubeIframeAPIReady and
// clobber whichever callback got there first.
function loadYouTubeApi(onReady: () => void) {
  if (window.YT?.Player) {
    onReady();
    return;
  }
  const existingCallback = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    existingCallback?.();
    onReady();
  };
  if (!document.getElementById("youtube-iframe-api")) {
    const script = document.createElement("script");
    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  }
}

// The very first thing a new team member sees after finishing signup,
// before Onboarding Session 1 - not gated behind it. Shows exactly once
// per account (profiles.welcome_video_watched_at), then never again.
// Skippable rather than a hard block - a video with sound can't
// autoplay in a mobile browser without a tap anyway, so trapping
// someone behind "must finish watching" would just be a dead end on the
// devices where autoplay silently fails.
export default function WelcomeVideoOverlay({
  profile,
  userId,
  onWatched,
}: {
  profile: Profile;
  userId: string;
  onWatched: () => void;
}) {
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ended, setEnded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsVideo = !profile.welcome_video_watched_at;

  useEffect(() => {
    if (!needsVideo) return;
    let cancelled = false;
    loadYouTubeApi(() => {
      if (cancelled || !playerHostRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(playerHostRef.current, {
        videoId: WELCOME_VIDEO_YOUTUBE_ID,
        playerVars: { rel: 0, playsinline: 1 },
        events: {
          onStateChange: (e) => {
            if (window.YT && e.data === window.YT.PlayerState.ENDED) setEnded(true);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [needsVideo]);

  if (!needsVideo) return null;

  async function markWatched() {
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ welcome_video_watched_at: new Date().toISOString() })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      setError(`Couldn't save that: ${error.message}`);
      return;
    }
    onWatched();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-navy px-4 py-8">
      <div className="w-full max-w-md space-y-1 text-center">
        <p className="text-2xl">👋</p>
        <p className="text-lg font-bold text-white">Welcome to the Angle Team</p>
        <p className="text-sm text-slate-400">A quick message before you get started.</p>
      </div>
      <div className="aspect-video w-full max-w-md overflow-hidden rounded-xl bg-black">
        <div ref={playerHostRef} className="h-full w-full" />
      </div>
      {error && <p className="max-w-md text-center text-xs text-red-400">{error}</p>}
      <button className="btn-primary w-full max-w-md" onClick={markWatched} disabled={saving}>
        {saving ? "…" : ended ? "Continue" : "Skip for now"}
      </button>
    </div>
  );
}
