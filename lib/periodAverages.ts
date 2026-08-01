import { getDateOffset, getWeekStartOffset, getMonthStartOffset } from "@/lib/dates";
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
