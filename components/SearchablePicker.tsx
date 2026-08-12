"use client";

import { useState } from "react";

export type SearchablePickerOption = {
  value: string;
  label: string;
  sublabel?: string;
};

// Drop-in replacement for a native <select> whenever the option list can
// realistically run long (team members, candidates) - a native dropdown
// has no way to type-to-filter, which is fine for a handful of options
// but not for someone with hundreds of downline or candidates. Collapsed
// by default (just shows the current selection, same footprint as a
// <select>); tapping it opens a search box + scrollable list, same
// search-box-over-a-scrollable-list pattern LibraryResourcePicker already
// uses for the audio/book library.
export default function SearchablePicker({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder = "Search…",
}: {
  options: SearchablePickerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q)
      )
    : options;

  if (!open) {
    return (
      <button type="button" className="select w-full text-left" onClick={() => setOpen(true)}>
        {selected?.label ?? placeholder}
      </button>
    );
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-white/10 bg-navy p-2">
      <input
        autoFocus
        className="input"
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-1 py-1 text-xs text-slate-500">No matches.</p>
        ) : (
          filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`block w-full rounded-lg px-3 py-2 text-left transition ${
                o.value === value ? "bg-amber/15 text-amber-light" : "bg-white/5 text-white active:bg-white/10"
              }`}
              onClick={() => {
                onChange(o.value);
                setQuery("");
                setOpen(false);
              }}
            >
              <p className="truncate text-sm font-medium">{o.label}</p>
              {o.sublabel && <p className="truncate text-xs text-slate-500">{o.sublabel}</p>}
            </button>
          ))
        )}
      </div>
      <button
        type="button"
        className="text-xs text-slate-400 underline"
        onClick={() => {
          setOpen(false);
          setQuery("");
        }}
      >
        Cancel
      </button>
    </div>
  );
}
