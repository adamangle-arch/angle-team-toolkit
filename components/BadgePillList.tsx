"use client";

import { useState } from "react";
import { BADGE_DEFINITIONS } from "@/lib/badges";

const INITIAL_VISIBLE = 12;

// Shared between My Profile's own badges card and the public /profile/[id]
// view - expand/collapse instead of a static "+N more" so every earned
// badge is actually reachable, not just the first page of them.
export default function BadgePillList({
  badges,
}: {
  badges: { badge_key: string; earned_at: string }[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (badges.length === 0) {
    return <p className="text-xs text-slate-400">No badges earned yet.</p>;
  }

  const visible = expanded ? badges : badges.slice(0, INITIAL_VISIBLE);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {visible.map((b) => {
          const def = BADGE_DEFINITIONS.find((d) => d.key === b.badge_key);
          if (!def) return null;
          return (
            <span key={b.badge_key} className="pill" title={def.label}>
              {def.icon} {def.label}
            </span>
          );
        })}
      </div>
      {badges.length > INITIAL_VISIBLE && (
        <button
          type="button"
          className="text-xs font-medium text-amber-light"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less ▲" : `Show all ${badges.length} ▾`}
        </button>
      )}
    </div>
  );
}
