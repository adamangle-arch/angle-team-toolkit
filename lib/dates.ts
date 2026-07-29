function toDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday ... 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return toDateOnly(d);
}

// weeksBack = 0 is the current week (Monday start), 1 is last week, etc.
//
// This used to round-trip through getWeekStart()'s returned "YYYY-MM-DD"
// string via `new Date(thatString)` - but a bare date-only string is
// parsed as UTC midnight, not local midnight. In any timezone behind UTC
// (all of the US), converting that UTC instant back to local time lands
// on the *previous* calendar day, so this returned Monday's date one day
// early - every single time, for anyone west of UTC, not intermittently.
// Confirmed live: a rep in US Eastern saw "current week" labeled Sun-Sat
// instead of Mon-Sun. Building the shifted date directly (never through
// a string) and asking getWeekStart() for its Monday sidesteps the UTC
// round-trip entirely.
export function getWeekStartOffset(weeksBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - weeksBack * 7);
  return getWeekStart(d);
}

// "Jul 20 - 26, 2026" for a Monday week-start date.
export function formatWeekRangeLabel(weekStartStr: string): string {
  const start = new Date(`${weekStartStr}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const year = end.getFullYear();
  // year + day with no month is an invalid combination for
  // Intl.DateTimeFormat - some engines (Node/V8 among them) fall back to
  // a bizarre literal "2026 (day: 25)" rendering instead of erroring.
  // Building the same-month case by hand instead of asking Intl for it
  // avoids that entirely.
  if (sameMonth) {
    return `${startLabel} - ${end.getDate()}, ${year}`;
  }
  const endLabel = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startLabel} - ${endLabel}, ${year}`;
}

export function getMonthStart(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return toDateOnly(d);
}

// monthsBack = 0 is the current month, 1 is last month, etc.
export function getMonthStartOffset(monthsBack: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  return toDateOnly(d);
}

export function formatMonthLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function getToday(): string {
  return toDateOnly(new Date());
}

// daysBack = 1 is yesterday, 0 is today.
export function getDateOffset(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return toDateOnly(d);
}

export function daysBetween(startDateStr: string, endDateStr: string): number {
  const start = new Date(`${startDateStr}T00:00:00`);
  const end = new Date(`${endDateStr}T00:00:00`);
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Compact labels for trend chart axes, where "Jul 20, 2026" is too wide
// to repeat across several points.
export function formatShortDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatShortMonthLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short" });
}

// Virtual Info Session webinar slots (see VIRTUAL_WEBINAR_SLOTS in
// lib/constants.ts) repeat weekly at a fixed Eastern-time day/hour,
// regardless of the candidate's own device timezone. Everything below
// exists to answer "when does this slot next occur" without a timezone
// database library - Intl.DateTimeFormat already knows the EST/EDT
// offset for any date, so a guess-and-correct loop against it is enough.
const EASTERN_TZ = "America/New_York";
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getEasternParts(date: Date) {
  const map: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date)) {
    map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    weekday: WEEKDAY_INDEX[map.weekday],
  };
}

// Converts an Eastern-time wall-clock moment to the correct UTC instant.
// A naive Date.UTC guess treats those numbers as UTC, which is off by
// whatever the EST/EDT offset happens to be that day - re-checking what
// the guess actually renders as in Eastern time and nudging by the
// difference converges in at most two passes.
function easternWallClockToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let i = 0; i < 3; i++) {
    const observed = getEasternParts(guess);
    const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute);
    const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
    const diff = targetUtc - observedUtc;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

// Next time (from `from`) a recurring weekly Eastern-time slot occurs -
// today if it hasn't happened yet, otherwise next week.
export function nextWebinarOccurrence(
  slot: { dayOfWeek: number; hour: number; minute: number },
  from: Date = new Date()
): Date {
  const now = getEasternParts(from);
  const dayDiff = (slot.dayOfWeek - now.weekday + 7) % 7;
  let candidate = easternWallClockToUtc(now.year, now.month, now.day + dayDiff, slot.hour, slot.minute);
  if (candidate.getTime() <= from.getTime()) {
    candidate = easternWallClockToUtc(now.year, now.month, now.day + dayDiff + 7, slot.hour, slot.minute);
  }
  return candidate;
}

export function formatWebinarTime(date: Date): string {
  return (
    date.toLocaleString("en-US", {
      timeZone: EASTERN_TZ,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}
