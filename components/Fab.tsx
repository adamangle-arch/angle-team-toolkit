"use client";

// Gmail-style floating action button for pages with one dominant action
// (Volume's "log a sale", Candidate Roadmap's "add candidate") that
// otherwise sits buried below a scroll. Scrolls its target into view and
// focuses the first input in it, rather than navigating anywhere - the
// form is already on the page, it's just out of the initial viewport.
export default function Fab({ targetId, label }: { targetId: string; label: string }) {
  function handleClick() {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = target.querySelector<HTMLElement>("input, textarea, select");
    // Wait for the scroll to actually land before focusing - focusing
    // mid-scroll on iOS Safari can yank the viewport back to the input's
    // pre-scroll position instead of where scrollIntoView was taking it.
    window.setTimeout(() => focusable?.focus(), 400);
  }

  return (
    // .app-shell is centered with a max-w-md cap, but `relative` on it
    // doesn't make it the containing block for a `fixed` descendant - a
    // plain `fixed right-4` button sticks to the real viewport edge,
    // which drifts away from the app's own right edge on anything wider
    // than a phone. Same fix BottomNav already uses: an outer fixed
    // element spans and centers to the same max-w-md, then the button is
    // positioned absolutely within that.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md">
      <button
        onClick={handleClick}
        aria-label={label}
        className="pointer-events-auto absolute right-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber text-2xl font-bold text-navy shadow-lg shadow-black/30 transition active:scale-95"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.5rem)" }}
      >
        +
      </button>
    </div>
  );
}
