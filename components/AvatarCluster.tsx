// iMessage-style overlapping circles for "who's in this" at a glance -
// Leaderboard already does side-by-side avatars for a couple's shared
// stat (CoupleLink in app/leaderboard/page.tsx), this is the same idea
// generalized to any list of people: a recipient picker's current
// selection, a group view, anywhere more than two names would otherwise
// only be readable by reading every one of them.
const SIZE_CLASSES: Record<"xs" | "sm", string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function AvatarCluster({
  people,
  size = "sm",
  max = 4,
}: {
  people: { id: string; name: string; photoUrl?: string | null }[];
  size?: "xs" | "sm";
  max?: number;
}) {
  if (people.length === 0) return null;
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div className="flex items-center">
      {visible.map((p, i) => (
        <div
          key={p.id}
          className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-navy font-bold text-slate-200 ring-2 ring-navy-lighter`}
          style={{ marginLeft: i === 0 ? 0 : "-0.5rem", zIndex: visible.length - i }}
          title={p.name}
        >
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt={p.name} className="h-full w-full rounded-full object-cover" />
          ) : (
            initials(p.name)
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-white/10 font-bold text-slate-300 ring-2 ring-navy-lighter`}
          style={{ marginLeft: "-0.5rem" }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
