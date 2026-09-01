"use client";

import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { waySupabase } from "@/lib/way/supabaseClient";
import type { Verse } from "@/lib/way/types";

const ROTATION_KEY = "the-way-verse-rotation";

function shuffled(indices: number[]): number[] {
  const result = [...indices];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Picks the next verse out of the pool without repeating one until every
// other verse has had a turn - same rotation trick as angle-team-toolkit's
// QuoteOverlay, just persisted under its own localStorage key and fed from
// a Supabase table instead of a bundled constant, since the pool can grow
// any time from the table editor.
function pickNextVerse(pool: Verse[]): Verse {
  let state: { order: number[]; position: number } | null = null;
  try {
    const raw = localStorage.getItem(ROTATION_KEY);
    if (raw) state = JSON.parse(raw);
  } catch {
    state = null;
  }

  if (!state || state.order.length !== pool.length || state.position >= state.order.length) {
    state = { order: shuffled(pool.map((_, i) => i)), position: 0 };
  }

  const index = state.order[state.position];
  try {
    localStorage.setItem(ROTATION_KEY, JSON.stringify({ order: state.order, position: state.position + 1 }));
  } catch {
    // Private browsing / storage disabled - just means no rotation memory.
  }

  return pool[index];
}

// Shown once every time the app is opened fresh (mounted alongside
// WayShell's children, once the welcome video has already been watched) -
// the discipleship-app counterpart to angle-team-toolkit's book-quote
// overlay. Real verse text is never hardcoded here; it's pulled from the
// `verses` table the church fills in themselves from Supabase, for the
// same pastoral/licensing reasons the daily devotional works the same way.
export default function VerseOverlay() {
  const [verse, setVerse] = useState<Verse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await waySupabase.from("verses").select("*");
      if (cancelled) return;
      const pool = (data as Verse[]) ?? [];
      if (pool.length === 0) return;
      setVerse(pickNextVerse(pool));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || !verse) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-6"
      style={{ background: "color-mix(in srgb, var(--way-bg) 92%, transparent)", backdropFilter: "blur(6px)" }}
    >
      <div className="way-card max-w-sm space-y-4 text-center">
        <BookOpen className="mx-auto h-7 w-7" style={{ color: "var(--way-accent)" }} aria-hidden />
        <p className="way-serif text-lg font-medium italic" style={{ color: "var(--way-text)" }}>
          &ldquo;{verse.text}&rdquo;
        </p>
        <p className="text-sm font-semibold" style={{ color: "var(--way-accent)" }}>
          {verse.reference}
        </p>
        <button className="way-btn way-btn-primary w-full" onClick={() => setDismissed(true)}>
          Let&apos;s Go
        </button>
      </div>
    </div>
  );
}
