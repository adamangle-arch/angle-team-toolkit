"use client";

import { useEffect, useRef, useState } from "react";
import { Hand } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// Unlisted YouTube video, not self-hosted - Supabase's free-tier Storage
// caps uploads at 50MB, well under an 11-minute video's real size, and
// upgrading to Pro just to host one file isn't worth a recurring cost.
// "Unlisted" means it's playable by link/embed but not searchable and
// doesn't show on the channel. Swap this id any time the video changes;
// nothing else needs to.
const WELCOME_VIDEO_YOUTUBE_ID = "XzUC8yCMJt0";

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
// before Onboarding Session 1 - not gated behind AuthGate's usual
// profile-completeness checks, but Session 1 itself IS gated behind it
// (see app/onboarding/page.tsx and app/onboarding/[session].tsx). Whether
// this renders at all is entirely up to the caller now - AuthGate mounts
// it automatically the first time (profile.welcome_video_watched_at and
// welcome_video_skipped_at both null), and Classroom's reminder card
// mounts a second, independent instance on demand for anyone who skipped
// it before finishing. A video with sound can't autoplay in a mobile
// browser without a tap anyway, so "Skip for now" exists rather than
// trapping someone behind a hard block - it just doesn't count as having
// watched it, unlike before.
export default function WelcomeVideoOverlay({
  userId,
  onWatched,
  onSkip,
}: {
  userId: string;
  onWatched: () => void;
  onSkip: () => void;
}) {
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ended, setEnded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

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

  async function skip() {
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ welcome_video_skipped_at: new Date().toISOString() })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      setError(`Couldn't save that: ${error.message}`);
      return;
    }
    onSkip();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-navy px-4 py-8">
      <div className="w-full max-w-md space-y-1 text-center">
        <Hand className="mx-auto h-6 w-6 text-white" aria-hidden />
        <p className="text-lg font-bold text-white">Welcome to the Angle Team</p>
        <p className="text-sm text-slate-400">
          A quick message from Adam and Laura Angle before you get started.
        </p>
      </div>
      <div className="aspect-video w-full max-w-md overflow-hidden rounded-xl bg-black">
        <div ref={playerHostRef} className="h-full w-full" />
      </div>
      {error && <p className="max-w-md text-center text-xs text-red-400">{error}</p>}
      {ended ? (
        <button className="btn-primary w-full max-w-md" onClick={markWatched} disabled={saving}>
          {saving ? "…" : "Continue"}
        </button>
      ) : (
        <button className="btn-secondary w-full max-w-md" onClick={skip} disabled={saving}>
          {saving ? "…" : "Skip for now"}
        </button>
      )}
    </div>
  );
}
