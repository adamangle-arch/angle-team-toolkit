"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import WelcomeVideoOverlay from "./WelcomeVideoOverlay";

// Shared by Classroom's standing top-of-page reminder and Onboarding
// Session 1's own locked-session card (app/onboarding/page.tsx and
// app/onboarding/[session]/page.tsx) - both are just "someone hasn't
// finished the welcome video yet" rendered in a different spot, so they
// share one card + on-demand overlay instead of drifting into two
// slightly different copies of the same flow.
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
      <div className="card space-y-2 !border-amber bg-amber/10">
        <p className="section-title flex items-center gap-1.5">
          <PlayCircle className="h-4 w-4" aria-hidden />
          Watch the Welcome Video First
        </p>
        <p className="text-sm text-slate-300">
          A quick message from the team before Session 1 unlocks.
        </p>
        <button className="btn-primary w-full" onClick={() => setOpen(true)}>
          Watch Now
        </button>
      </div>
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
