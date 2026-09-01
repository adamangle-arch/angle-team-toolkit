"use client";

import { Sparkles } from "lucide-react";

// A small banner when someone crosses 25/50/75% through a course - purely
// presentational; the course detail page owns the timer that clears it
// after a few seconds.
export default function MilestoneToast({ pct }: { pct: number }) {
  return (
    <div
      className="way-scope fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center gap-2 rounded-[14px] px-4 py-3"
      style={{
        background: "var(--way-surface)",
        border: "1px solid var(--way-border)",
        boxShadow: "0 10px 24px -12px var(--way-shadow)",
      }}
    >
      <Sparkles className="h-4 w-4 shrink-0" style={{ color: "var(--way-accent)" }} aria-hidden />
      <p className="text-sm font-medium" style={{ color: "var(--way-text)" }}>
        {pct}% through — keep going.
      </p>
    </div>
  );
}
