// Loading placeholders that mimic the shape of what's about to load,
// instead of a bare "Loading…" line - the same pattern used by most
// feed-style apps to make a wait feel shorter and less jarring than a
// blank screen or spinner.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/10 ${className}`} />;
}

// One placeholder "card" - a title-width bar plus a few body-width bars,
// matching the app's standard .card shape (section-title + a couple of
// text lines).
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="card space-y-2">
      <Skeleton className="h-3 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

// A run of placeholder cards, for pages whose loading state is a stack
// of .card elements (Candidate Roadmap, Core Run, Badges, etc).
export function SkeletonList({ cards = 3, lines = 2 }: { cards?: number; lines?: number }) {
  return (
    <>
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </>
  );
}

// One placeholder row, for a list that lives inside a card that's
// already rendered (e.g. "Members" or "Recent Months") rather than the
// whole page being replaced.
export function SkeletonRow() {
  return (
    <div className="flex items-center rounded-lg bg-navy px-3 py-2">
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
