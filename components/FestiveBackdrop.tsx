"use client";

import type { CSSProperties } from "react";
import { FESTIVE_THEME_EMOJI } from "@/lib/constants";

// Fixed, hand-placed scatter (not Math.random() at render time, which
// would reshuffle - and risk a hydration mismatch - on every mount)
// shared by every holiday theme; only which emoji fill it changes. 14
// slots keeps it dense enough to read as "a themed background," not a
// couple of stray icons.
const SLOTS: { top: string; left: string; size: string; rotate: number; duration: number; delay: number }[] = [
  { top: "4%", left: "10%", size: "2rem", rotate: -12, duration: 7, delay: 0 },
  { top: "9%", left: "78%", size: "2.6rem", rotate: 10, duration: 8.5, delay: 0.6 },
  { top: "16%", left: "42%", size: "1.6rem", rotate: 6, duration: 6, delay: 1.4 },
  { top: "24%", left: "88%", size: "2.2rem", rotate: -8, duration: 9, delay: 0.2 },
  { top: "27%", left: "6%", size: "1.8rem", rotate: 14, duration: 7.5, delay: 2.1 },
  { top: "36%", left: "60%", size: "2.4rem", rotate: -6, duration: 8, delay: 1 },
  { top: "44%", left: "24%", size: "1.5rem", rotate: 9, duration: 6.5, delay: 2.6 },
  { top: "52%", left: "84%", size: "2rem", rotate: -14, duration: 7.2, delay: 0.9 },
  { top: "58%", left: "12%", size: "2.2rem", rotate: 5, duration: 8.8, delay: 1.8 },
  { top: "66%", left: "48%", size: "1.7rem", rotate: -10, duration: 6.8, delay: 0.4 },
  { top: "74%", left: "76%", size: "2.5rem", rotate: 12, duration: 9.4, delay: 2.3 },
  { top: "81%", left: "20%", size: "1.9rem", rotate: -5, duration: 7.8, delay: 1.2 },
  { top: "88%", left: "64%", size: "2.1rem", rotate: 8, duration: 6.2, delay: 0.7 },
  { top: "93%", left: "36%", size: "1.6rem", rotate: -9, duration: 8.2, delay: 1.6 },
];

// Real decorative flair for the 9 calendar-holiday colorways (see
// FESTIVE_THEME_EMOJI in lib/constants.ts), on top of the single
// accent-color swap every colorway already gets from data-theme (see
// lib/applyTheme.ts) - a recolored button doesn't read as "Christmas"
// the way a scatter of themed emoji drifting behind the app does.
// Mounted once in AuthGate alongside QuoteOverlay, fixed behind all page
// content (z-index: -1 in the .festive-backdrop rule in globals.css, so
// it paints above the body's own background gradient but below every
// card/header - see the stacking-order note there) so it shows through
// naturally in the gaps between cards on every page, not just one.
// Plain colorways (Amber, Rose, gems, nature, etc.) render nothing here.
export default function FestiveBackdrop({ themeColor }: { themeColor: string }) {
  const emoji = FESTIVE_THEME_EMOJI[themeColor as keyof typeof FESTIVE_THEME_EMOJI];
  if (!emoji || emoji.length === 0) return null;

  return (
    <div className="festive-backdrop" aria-hidden>
      {SLOTS.map((slot, i) => (
        <span
          key={i}
          className="festive-backdrop-item"
          style={{
            top: slot.top,
            left: slot.left,
            fontSize: slot.size,
            // The festive-drift keyframes (globals.css) animate
            // `transform` directly, which would clobber a plain inline
            // `transform: rotate(...)` every frame - going through a
            // custom property instead lets the keyframes read it back
            // via var(--festive-rotate) and layer their own translateY
            // bob on top of it without losing the per-slot tilt.
            ["--festive-rotate" as string]: `${slot.rotate}deg`,
            animationDuration: `${slot.duration}s`,
            animationDelay: `${slot.delay}s`,
          } as CSSProperties}
        >
          {emoji[i % emoji.length]}
        </span>
      ))}
    </div>
  );
}
