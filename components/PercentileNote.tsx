// A team of 1-2 has no meaningful "percentile" - everyone's either #1 or
// last by definition, so this stays quiet rather than showing a
// misleadingly precise-looking number off a near-empty distribution.
const MIN_TEAM_SIZE = 3;

// Spotify Wrapped-style "Top N% of listeners" framing instead of a raw
// ordinal - "93rd percentile" takes a beat to parse (bigger = better,
// but is 93rd good?), while "Top 7%" reads instantly. percentile (from
// the get_*_average_percentile RPCs) is 0-100 where 100 = the team's
// highest average, so the "top" fraction is the mirror image of it;
// floored at 1 rather than 0, since "top 0%" reads like a typo even
// though it's the mathematically exact result for the single highest
// value in the team.
function topPercent(percentile: number): number {
  return Math.max(1, Math.round(100 - percentile));
}

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
  return <p className="text-[10px] text-slate-500">📊 Top {topPercent(entry.percentile)}%</p>;
}
