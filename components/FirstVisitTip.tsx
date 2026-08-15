"use client";

import { useState } from "react";
import { X } from "lucide-react";

const STORAGE_PREFIX = "tip_dismissed_";

// Persisted per-device in localStorage, same pattern QuoteOverlay already
// uses for its own lightweight "remember this across app opens" state -
// not worth a schema column and a round-trip for a dismissible tip.
function isDismissed(id: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + id) === "1";
  } catch {
    return false;
  }
}

function markDismissed(id: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, "1");
  } catch {
    // private browsing / storage disabled - tip just won't stay dismissed
  }
}

// A brief, dismissible explainer shown the first time (and every time
// after, until dismissed) someone lands on a page that could use one -
// contextual education instead of a full onboarding walkthrough nobody
// asked for. Once dismissed on a given id, it's gone for good on this
// device.
export default function FirstVisitTip({ id, children }: { id: string; children: React.ReactNode }) {
  const [dismissed, setDismissed] = useState(() => isDismissed(id));
  if (dismissed) return null;

  return (
    <div className="card flex items-start justify-between gap-2 !border-amber bg-amber/10">
      <p className="text-sm text-slate-200">{children}</p>
      <button
        className="btn-icon !h-6 !w-6 shrink-0 text-xs"
        onClick={() => {
          markDismissed(id);
          setDismissed(true);
        }}
        aria-label="Dismiss tip"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
