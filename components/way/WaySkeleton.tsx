export function WaySkeleton({ className = "" }: { className?: string }) {
  return <div className={`way-skeleton ${className}`} />;
}

export function WaySkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="way-card space-y-2">
      <WaySkeleton className="h-3 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <WaySkeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function WaySkeletonList({ cards = 3, lines = 2 }: { cards?: number; lines?: number }) {
  return (
    <>
      {Array.from({ length: cards }, (_, i) => (
        <WaySkeletonCard key={i} lines={lines} />
      ))}
    </>
  );
}
