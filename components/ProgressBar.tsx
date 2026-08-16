"use client";

// Shared by Classroom's overview page and each session's own homework
// page (progress meters in both places), plus anywhere else that just
// needs a plain amber fill bar over a track.
export default function ProgressBar({ pct, size = "sm" }: { pct: number; size?: "sm" | "lg" }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-white/10 ${size === "lg" ? "h-3.5" : "h-2"}`}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: "linear-gradient(135deg, var(--color-amber-light), var(--color-amber))",
        }}
      />
    </div>
  );
}
