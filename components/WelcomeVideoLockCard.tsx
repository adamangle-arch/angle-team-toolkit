"use client";

import { useState } from "react";
import { ChevronRight, Hand } from "lucide-react";
import WelcomeVideoOverlay from "./WelcomeVideoOverlay";

// Styled as its own colorful module tile, matching the Classroom session
// cards it sits above (app/onboarding/page.tsx) rather than a plain
// bordered box - same "gradient rounded-xl box with a big faded icon +
// title, description below, chevron row at the bottom" shape as
// SESSION_STYLE's tiles (lib/onboarding-style.ts), just with its own
// gradient/icon since it isn't one of the five numbered sessions. Also
// used as-is for Session 1's own locked-session card
// (app/onboarding/[session]/page.tsx) and Home's top-of-page banner
// (app/home/page.tsx). Disappears from all three the moment
// welcome_video_watched_at is set - no rewatch path anywhere.
export default function WelcomeVideoLockCard({
  userId,
  onWatched,
}: {
  userId: string;
  onWatched: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left transition active:scale-[0.98]">
        <div className="card space-y-3">
          <div
            className="relative flex min-h-[110px] flex-col justify-end overflow-hidden rounded-xl p-4"
            style={{
              background: "linear-gradient(135deg, #a5b4fc, #4338ca)",
              boxShadow: "0 10px 24px -12px rgba(0,0,0,0.55)",
            }}
          >
            <Hand
              className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 text-paper opacity-25"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="relative z-10 text-lg font-extrabold leading-tight text-paper drop-shadow-sm">
              Watch the Welcome Video
            </p>
          </div>
          <p className="text-sm text-slate-400">
            A quick message from Alex and Laura Angle before you get started.
          </p>
          <p className="flex items-center justify-end gap-0.5 text-xs font-semibold text-amber-light">
            Watch Now
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </p>
        </div>
      </button>
      {open && (
        <WelcomeVideoOverlay
          userId={userId}
          onWatched={() => {
            setOpen(false);
            onWatched();
          }}
          onSkip={() => setOpen(false)}
        />
      )}
    </>
  );
}
