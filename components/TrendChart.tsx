"use client";

export default function TrendChart({
  data,
  valueSuffix = "",
}: {
  data: { label: string; value: number }[];
  valueSuffix?: string;
}) {
  if (data.length < 2) {
    return (
      <p className="text-sm text-slate-400">
        Not enough history yet — keep logging to build a trend.
      </p>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100;
  const h = 36;
  const step = w / (data.length - 1);

  const points = data.map((d, i) => ({
    x: i * step,
    y: h - (d.value / max) * (h - 4) - 2,
  }));

  const path = points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = points[points.length - 1];

  const first = data[0].value;
  const latest = data[data.length - 1].value;
  const delta = latest - first;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold text-white">
          {latest}
          {valueSuffix}
        </span>
        <span
          className={`text-xs font-medium ${
            delta > 0 ? "text-amber-light" : delta < 0 ? "text-red-300" : "text-slate-500"
          }`}
        >
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta)}
          {valueSuffix} since {data[0].label}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" preserveAspectRatio="none">
        <polyline
          points={path}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={last.x} cy={last.y} r="3" fill="#fbbf24" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}
