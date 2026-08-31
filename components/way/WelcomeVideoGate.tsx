"use client";

import { useEffect, useRef, useState } from "react";
import { Hand, X } from "lucide-react";
import { waySupabase } from "@/lib/way/supabaseClient";

// Accepts either a bare video id or a full YouTube URL (youtu.be/<id>,
// youtube.com/watch?v=<id>, youtube.com/embed/<id>) - pasting the full
// share link instead of just the id is an easy mistake to make when
// setting the env var, and the YouTube Player API silently fails to load
// anything useful if handed a full URL as a videoId.
function extractYouTubeId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return url.pathname.slice(1);
    const vParam = url.searchParams.get("v");
    if (vParam) return vParam;
    const embedMatch = url.pathname.match(/\/embed\/([^/?]+)/);
    if (embedMatch) return embedMatch[1];
  } catch {
    // Fall through to returning the raw value below.
  }
  return trimmed;
}

// Unlisted/public YouTube video id for the welcome message shown before a
// member's first course. Set NEXT_PUBLIC_WAY_WELCOME_VIDEO_YOUTUBE_ID —
// until then this renders a plain "Continue" screen instead of blocking
// signup on a video that doesn't exist yet.
const WELCOME_VIDEO_YOUTUBE_ID = extractYouTubeId(process.env.NEXT_PUBLIC_WAY_WELCOME_VIDEO_YOUTUBE_ID || "");

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

// The first-watch case (replay=false, from WayShell) requires finishing
// the video before continuing, and marks profiles.welcome_video_watched_at
// via onWatched — there's no "skip for now" here, unlike angle-team-toolkit's
// own overlay, since the product brief calls for "marked watched once and
// never shown again." Unlike that app though, anyone can rewatch it anytime
// after that (the "Watch welcome video" button in WayHeader) — that's the
// replay=true case, which can be closed at any point via onClose and never
// touches welcome_video_watched_at again (it's already set).
export default function WelcomeVideoGate({
  replay = false,
  onWatched,
  onClose,
}: {
  replay?: boolean;
  onWatched?: () => void;
  onClose?: () => void;
}) {
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ended, setEnded] = useState(replay || !WELCOME_VIDEO_YOUTUBE_ID);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!WELCOME_VIDEO_YOUTUBE_ID) return;
    let cancelled = false;
    loadYouTubeApi(() => {
      if (cancelled || !playerHostRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(playerHostRef.current, {
        videoId: WELCOME_VIDEO_YOUTUBE_ID,
        // Unmuted autoplay, by request - mobile browsers can still block
        // autoplay-with-sound on someone's very first visit before they've
        // tapped anything on the page, in which case it'll load paused
        // instead of erroring; there's no way to guarantee sound-on
        // autoplay past that browser-level policy.
        playerVars: { rel: 0, playsinline: 1, autoplay: 1 },
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
    const { error } = await waySupabase.rpc("mark_welcome_video_watched");
    setSaving(false);
    if (error) {
      setError(`Couldn't save that: ${error.message}`);
      return;
    }
    onWatched?.();
  }

  return (
    <div
      className="way-scope fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-8"
      style={{ background: "var(--way-bg)" }}
    >
      {replay && (
        <button
          type="button"
          aria-label="Close"
          className="way-btn-icon absolute right-4 top-4"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
      <div className="w-full max-w-md space-y-1 text-center">
        <Hand className="mx-auto h-6 w-6" style={{ color: "var(--way-accent)" }} aria-hidden />
        <p className="way-wordmark text-2xl" style={{ color: "var(--way-text)" }}>
          Welcome to The Way
        </p>
        <p className="text-sm" style={{ color: "var(--way-text-dim)" }}>
          {replay ? "The welcome message." : "A quick message before you start your first course."}
        </p>
      </div>
      {WELCOME_VIDEO_YOUTUBE_ID && (
        <div className="aspect-video w-full max-w-md overflow-hidden rounded-[14px] bg-black">
          <div ref={playerHostRef} className="h-full w-full" />
        </div>
      )}
      {error && (
        <p className="max-w-md text-center text-xs" style={{ color: "var(--way-danger)" }}>
          {error}
        </p>
      )}
      {!replay && (
        <button className="way-btn way-btn-primary w-full max-w-md" onClick={markWatched} disabled={saving || !ended}>
          {saving ? "…" : "Continue"}
        </button>
      )}
    </div>
  );
}
