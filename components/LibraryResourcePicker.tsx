"use client";

import { useState } from "react";
import type { OptionalResource, OptionalResourceKind } from "@/lib/types";

// The "pick from library" widget shown everywhere a resource can be
// picked from the shared Optional Resources library (Candidate
// Resources, Onboarding Resources, and both one-off "Send a Resource"
// boxes) - split into Audios/Reading tabs plus a search box (title or
// speaker/detail) instead of one long alphabetical dropdown, since the
// library's grown past a handful of hand-typed entries.
export default function LibraryResourcePicker({
  resources,
  onPick,
}: {
  resources: OptionalResource[];
  onPick: (resource: OptionalResource) => void;
}) {
  const [kind, setKind] = useState<OptionalResourceKind>("audio");
  const [query, setQuery] = useState("");

  const audioCount = resources.filter((r) => r.kind === "audio").length;
  const readingCount = resources.filter((r) => r.kind === "reading").length;

  const q = query.trim().toLowerCase();
  const filtered = resources.filter((r) => {
    if (r.kind !== kind) return false;
    if (!q) return true;
    return r.label.toLowerCase().includes(q) || r.detail.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-slate-300">Pick from library:</p>
      <div className="flex gap-2">
        <button
          type="button"
          className={kind === "audio" ? "toggle-pill-active" : "toggle-pill-inactive"}
          onClick={() => setKind("audio")}
        >
          🎧 Audios ({audioCount})
        </button>
        <button
          type="button"
          className={kind === "reading" ? "toggle-pill-active" : "toggle-pill-inactive"}
          onClick={() => setKind("reading")}
        >
          📖 Reading ({readingCount})
        </button>
      </div>
      <input
        className="input"
        placeholder="Search by title or speaker…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="px-1 text-xs text-slate-500">No matches.</p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              className="block w-full rounded-lg bg-navy px-3 py-2 text-left"
              onClick={() => onPick(r)}
            >
              <p className="truncate text-sm font-medium text-white">{r.label}</p>
              {(r.detail || r.estimate) && (
                <p className="truncate text-xs text-slate-500">
                  {r.detail}
                  {r.estimate && <span> · {r.estimate}</span>}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
      <p className="text-center text-xs text-slate-500">— or type your own —</p>
    </div>
  );
}
