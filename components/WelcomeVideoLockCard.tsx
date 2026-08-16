"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import WelcomeVideoOverlay from "./WelcomeVideoOverlay";

// The most prominent thing on both Home and Classroom until someone
// actually finishes the welcome video - rendered first, above
// everything else, on both pages (see app/home/page.tsx and
// app/onboarding/page.tsx) and on Onboarding Session 1's own
// locked-session card (app/onboarding/[session]/page.tsx) for anyone who
// lands there directly. Disappears from all three the moment
// welcome_video_watched_at is set - no separate "rewatch" path anywhere
// (see WELCOME VIDEO in supabase/schema.sql and My Profile's earlier,
// now-removed card).
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition active:scale-[0.98]"
        style={{
          background: "rgb(var(--amber-rgb) / 0.14)",
          borderColor: "rgb(var(--amber-rgb) / 0.4)",
          boxShadow: "0 0 32px -8px rgb(var(--amber-rgb) / 0.5)",
        }}
      >
        <PlayCircle className="h-12 w-12 shrink-0 text-amber-light" strokeWidth={1.5} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold text-white">Watch the Welcome Video</p>
          <p className="text-sm text-slate-300">
            A quick message from Alex and Laura Angle before you get started.
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
