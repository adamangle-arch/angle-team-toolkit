"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { BADGE_DEFINITIONS, type BadgeDefinition } from "@/lib/badges";

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
  const [selected, setSelected] = useState<{ def: BadgeDefinition; earnedAt: string } | null>(null);

  if (badges.length === 0) {
    return <p className="text-xs text-slate-400">No badges earned yet.</p>;
  }

  // Most valuable first - a badge's point value (see lib/levels.ts) is a
  // better "how impressive is this" signal than earned_at, which is what
  // the caller's query orders by.
  const sorted = [...badges].sort((a, b) => {
    const pa = BADGE_DEFINITIONS.find((d) => d.key === a.badge_key)?.points ?? 0;
    const pb = BADGE_DEFINITIONS.find((d) => d.key === b.badge_key)?.points ?? 0;
    return pb - pa;
  });
  const visible = expanded ? sorted : sorted.slice(0, INITIAL_VISIBLE);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {visible.map((b) => {
          const def = BADGE_DEFINITIONS.find((d) => d.key === b.badge_key);
          if (!def) return null;
          return (
            <button
              key={b.badge_key}
              type="button"
              className="pill"
              onClick={() => setSelected({ def, earnedAt: b.earned_at })}
            >
              {def.icon} {def.label}
            </button>
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

      {/* Portaled to document.body rather than rendered in place - this
          component is always mounted inside .page-main (overflow-y-auto),
          and a `fixed inset-0` element nested inside a scrolling ancestor
          renders relative to that ancestor's bounds instead of the true
          viewport in iOS Safari standalone mode, clipping/misplacing the
          modal instead of covering the full screen. Every other modal in
          this app sidesteps this by being a sibling of .page-main instead
          of nested inside it; a portal gets the same result from a
          component that's reused inside other pages' cards. */}
      {selected &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
            onClick={() => setSelected(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-navy-lighter p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="section-title">
                  {selected.def.icon} {selected.def.label}
                </p>
                <button
                  className="btn-icon !h-7 !w-7 shrink-0 text-sm"
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-slate-300">{selected.def.description}</p>
              <p className="mt-2 text-xs text-slate-500">
                Earned {new Date(selected.earnedAt).toLocaleDateString()}
              </p>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
