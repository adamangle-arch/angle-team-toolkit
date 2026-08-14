function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// A team of 1-2 has no meaningful "percentile" - everyone's either #1 or
// last by definition, so this stays quiet rather than showing a
// misleadingly precise-looking number off a near-empty distribution.
const MIN_TEAM_SIZE = 3;

// Compact "you vs. the team" note dropped under any average number -
// same entry shape (metric/value/percentile/team_size) whether it came
// from get_pipeline_average_percentile, get_volume_average_percentile,
// or get_streak_average_percentile, so one component covers all of them.
export default function PercentileNote({
  entry,
}: {
  entry: { percentile: number; team_size: number } | null | undefined;
}) {
  if (!entry || entry.team_size < MIN_TEAM_SIZE) return null;
  return (
    <p className="text-[10px] text-slate-500">
      📊 {ordinal(entry.percentile)} percentile <span className="text-slate-600">(of {entry.team_size})</span>
    </p>
  );
}
