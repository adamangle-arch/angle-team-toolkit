import { US_TIMEZONES, type UsTimeZone } from "./constants";

export function timeZoneLabel(tz: string | null | undefined): string {
  return US_TIMEZONES.find((z) => z.key === tz)?.label ?? tz ?? "Unknown";
}

// Best-effort default for a fresh picker: the device's own zone, snapped
// to one of our known US zones (which is what virtually every
// continental US browser resolves to already). Falls back to Eastern
// rather than leaving something not in the list selected.
export function guessTimeZone(): UsTimeZone {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (US_TIMEZONES.find((z) => z.key === detected)?.key as UsTimeZone) ?? "America/New_York";
}

// How far `timeZone` is ahead of UTC, in minutes, at the instant `date`
// falls on - not a fixed number, since it depends on whether daylight
// saving is in effect on that particular date.
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - date.getTime()) / 60000;
}

// Converts a "YYYY-MM-DDTHH:mm" wall-clock value - the same shape a
// datetime-local input produces - into the correct UTC instant for that
// wall-clock time IN `timeZone`, rather than in whatever zone the
// browser doing the typing happens to be running in. This is what lets
// someone in Eastern schedule "8:00 PM" for a candidate they've tagged
// as Central and have it land on the right hour for everyone, instead of
// the scheduler having to do the offset math themselves.
export function zonedInputToUtc(localValue: string, timeZone: string): Date {
  const [datePart, timePart] = localValue.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offsetMinutes = tzOffsetMinutes(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offsetMinutes * 60000);
}

// Inverse of the above - given a stored UTC instant and the zone it
// should be edited in, produces the same "YYYY-MM-DDTHH:mm" shape a
// datetime-local input expects, in THAT zone rather than whichever
// device happens to be reopening it. Used to re-open an event for
// editing without its wall-clock time silently shifting to the editor's
// own zone.
export function utcToZonedInputValue(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
