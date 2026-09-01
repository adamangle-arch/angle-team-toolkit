"use client";

import { useState } from "react";
import { PartyPopper } from "lucide-react";

// Shown once, the moment a course's last lesson item gets checked off -
// see the "just crossed 100%" edge detection in the course detail page.
// The reflection box is deliberately not saved anywhere; it's a private
// moment to write something down before moving on, not a stored note
// feature (that's a bigger addition for later if it's wanted).
export default function CompletionCelebration({
  courseTitle,
  completionMessage,
  onDone,
}: {
  courseTitle: string;
  completionMessage: string | null;
  onDone: () => void;
}) {
  const [reflection, setReflection] = useState("");

  return (
    <div className="way-scope fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-8" style={{ background: "var(--way-bg)" }}>
      <div className="w-full max-w-md space-y-2 text-center">
        <PartyPopper className="mx-auto h-7 w-7" style={{ color: "var(--way-accent)" }} aria-hidden />
        <p className="way-wordmark text-2xl" style={{ color: "var(--way-text)" }}>
          You finished {courseTitle}
        </p>
        <p className="text-sm" style={{ color: "var(--way-text-dim)" }}>
          {completionMessage || "Every step forward matters. Well done."}
        </p>
      </div>

      <div className="way-card w-full max-w-md space-y-2 text-left">
        <p className="text-sm font-semibold" style={{ color: "var(--way-text)" }}>
          Before you move on
        </p>
        <p className="text-xs" style={{ color: "var(--way-text-dim)" }}>
          What stood out to you? This is just for you — it isn&apos;t saved anywhere.
        </p>
        <textarea
          className="way-input min-h-24"
          placeholder="Write a few words…"
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
        />
      </div>

      <button className="way-btn way-btn-primary w-full max-w-md" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
