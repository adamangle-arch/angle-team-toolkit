"use client";

import { useState } from "react";
import { BOOK_QUOTES } from "@/lib/quotes";

export default function QuoteOverlay() {
  const [quote] = useState(() => BOOK_QUOTES[Math.floor(Math.random() * BOOK_QUOTES.length)]);
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
