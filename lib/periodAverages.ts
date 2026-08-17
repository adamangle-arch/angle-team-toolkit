import { getDateOffset, getWeekStart, getWeekStartOffset, getMonthStartOffset } from "@/lib/dates";
import type { PipelinePeriod } from "@/lib/types";

export type PeriodType = "daily" | "weekly" | "monthly";

// offset = 0 is the current day/week/month, 1 is one back, etc. - mirrors
// the same back-navigation already on the Team tab's Teams view and the
// Leaderboard's monthly nav.
export function periodStartFor(periodType: PeriodType, offset: number): string {
  if (periodType === "daily") return getDateOffset(offset);
  if (periodType === "weekly") return getWeekStartOffset(offset);
  return getMonthStartOffset(offset);
}

// The inverse of periodStartFor - given any date someone picked (e.g. from
// a native date input), works out which offset lands on that same
// day/week/month, so a manual date pick can feed straight into the same
// periodOffset state the ‹/› buttons already drive. Ms-difference is safe
// at day granularity even across a DST transition (at most a 1-hour skew,
// well under the half-day threshold Math.round needs to land correctly).
// Clamped to 0 (never negative) since periodOffset never goes into the
// future - picking a future date just snaps to the current period.
export function offsetForPeriodStart(periodType: PeriodType, dateStr: string): number {
  const now = new Date();
  const target = new Date(`${dateStr}T00:00:00`);
  if (periodType === "monthly") {
    const currentIndex = now.getFullYear() * 12 + now.getMonth();
    const targetIndex = target.getFullYear() * 12 + target.getMonth();
    return Math.max(0, currentIndex - targetIndex);
  }
  if (periodType === "weekly") {
    const currentMonday = new Date(`${getWeekStart(now)}T00:00:00`);
    const targetMonday = new Date(`${getWeekStart(target)}T00:00:00`);
    return Math.max(0, Math.round((currentMonday.getTime() - targetMonday.getTime()) / (7 * 86400000)));
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today.getTime() - target.getTime()) / 86400000));
}

// The day after this period's last day (Daily: the next day; Weekly: 7
// days later; Monthly: the 1st of the next month) - an exclusive upper
// bound, so a query can do `period_start >= X and period_start < end`
// to grab exactly the Daily rows that fall inside one Weekly/Monthly
// period, for reconciling a stored total against a fresh sum of its own
// Daily rows (see the Pipeline tally's "Daily entries this period"
// note).
export function periodEndExclusive(periodType: PeriodType, periodStart: string): string {
  const d = new Date(`${periodStart}T00:00:00`);
  if (periodType === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (periodType === "weekly") {
    d.setDate(d.getDate() + 7);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// How many periods back each average window looks - 30 days ~ a month,
// 12 weeks ~ a quarter, 6 months ~ half a year.
export const AVERAGES_WINDOW: Record<PeriodType, number> = { daily: 30, weekly: 12, monthly: 6 };

export const AVERAGE_METRICS: { key: "questions" | "yeses" | "qi1"; label: string }[] = [
  { key: "questions", label: "Questions" },
  { key: "yeses", label: "Yeses" },
  { key: "qi1", label: "QI1s" },
];

// Same fairness principle as Core Run's averages: a day/week/month with
// no row still counts as a 0 (real consistency, not just "how much on
// days you engage"), but the window is clamped to start at the earliest
// period that actually exists - someone who joined 3 weeks ago hasn't
// "missed" the 9 weeks before that. Shared by the Pipeline Tracker's
// Tally tab and the Goals page, so both show the exact same numbers.
//
// The current (still in-progress) period is never counted, on top of
// that - a day/week/month that isn't over yet will always look lower
// than a completed one purely because it hasn't finished, so including
// it would make someone's own pace look artificially worse than it is.
// Offsets run from windowSize back through 1 (never 0, which is the
// current period), so the window is windowSize *completed* periods.
export function averagesForPeriods(
  periodType: PeriodType,
  rows: PipelinePeriod[],
  windowSize: number
): { questions: number; yeses: number; qi1: number; windowCount: number } {
  const currentStart = periodStartFor(periodType, 0);
  const completedRows = rows.filter((r) => r.period_start !== currentStart);
  const byStart = new Map(completedRows.map((r) => [r.period_start, r]));
  const existingStarts = completedRows.map((r) => r.period_start).sort();
  const firstStart = existingStarts.length > 0 ? existingStarts[0] : periodStartFor(periodType, 1);
  const theoretical = Array.from({ length: windowSize }, (_, i) =>
    periodStartFor(periodType, windowSize - i)
  ).filter((s) => s >= firstStart);

  const sums = { questions: 0, yeses: 0, qi1: 0 };
  for (const start of theoretical) {
    const row = byStart.get(start);
    sums.questions += row?.questions ?? 0;
    sums.yeses += row?.yeses ?? 0;
    sums.qi1 += row?.qi1 ?? 0;
  }
  const n = theoretical.length || 1;
  return { questions: sums.questions / n, yeses: sums.yeses / n, qi1: sums.qi1 / n, windowCount: theoretical.length };
}
