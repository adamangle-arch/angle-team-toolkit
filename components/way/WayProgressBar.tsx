// Sage-green fill instead of Angle Team Toolkit's amber gradient — growth
// along the path, not a dashboard KPI.
export default function WayProgressBar({ pct }: { pct: number }) {
  return (
    <div className="way-progress-track">
      <div className="way-progress-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}
