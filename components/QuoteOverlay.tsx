"use client";

import { useState } from "react";
import { BOOK_QUOTES, type BookQuote } from "@/lib/quotes";

const ROTATION_KEY = "angle-team-quote-rotation";

function shuffled(indices: number[]): number[] {
  const copy = [...indices];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Cycles through every quote in shuffled order before any repeat, instead
// of picking independently at random each time (which repeats constantly
// with a pool this small). Order + position persist in localStorage so
// the rotation continues across app opens on this device.
function pickNextQuote(): BookQuote {
  let order: number[] = [];
  let position = 0;

  try {
    const raw = localStorage.getItem(ROTATION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.order) && typeof parsed.position === "number") {
        order = parsed.order;
        position = parsed.position;
      }
    }
  } catch {
    // malformed/unavailable storage — fall through and reshuffle below
  }

  if (order.length !== BOOK_QUOTES.length || position >= order.length) {
    order = shuffled(BOOK_QUOTES.map((_, i) => i));
    position = 0;
  }

  const index = order[position];

  try {
    localStorage.setItem(ROTATION_KEY, JSON.stringify({ order, position: position + 1 }));
  } catch {
    // private browsing / storage disabled — rotation just won't persist
  }

  return BOOK_QUOTES[index];
}

export default function QuoteOverlay() {
  const [quote] = useState(() => pickNextQuote());
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/85 px-6 backdrop-blur-sm">
      <div className="card max-w-sm space-y-4 text-center">
        <p className="text-3xl">📖</p>
        <p className="text-lg font-medium italic text-white">&ldquo;{quote.text}&rdquo;</p>
        <p className="text-sm">
          <span className="font-semibold text-amber-light">{quote.author}</span>
          <span className="text-slate-400"> — {quote.book}</span>
        </p>
        <button className="btn-primary w-full" onClick={() => setDismissed(true)}>
          Let&apos;s Go
        </button>
      </div>
    </div>
  );
}
