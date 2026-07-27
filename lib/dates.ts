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
export function getWeekStartOffset(weeksBack: number): string {
  const d = new Date(getWeekStart());
  d.setDate(d.getDate() - weeksBack * 7);
  return toDateOnly(d);
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
