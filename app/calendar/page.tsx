"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { Repeat, Pencil, X, Megaphone } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import AvatarCluster from "@/components/AvatarCluster";
import SearchablePicker from "@/components/SearchablePicker";
import { supabase } from "@/lib/supabaseClient";
import {
  isPrimaryUser,
  CALENDAR_EVENT_TYPES,
  CALENDAR_REMINDER_OPTIONS,
  CALENDAR_DURATION_OPTIONS,
  CALENDAR_RECURRENCE_OPTIONS,
  US_TIMEZONES,
  DOWNLINE_CANDIDATE_MEETING_COLOR,
  type CalendarEventType,
} from "@/lib/constants";
import {
  getToday,
  getMonthStartOffset,
  getDateOffset,
  formatMonthLabel,
  formatDateLabel,
  getWeekStartOffset,
  formatWeekRangeLabel,
} from "@/lib/dates";
import { guessTimeZone, zonedInputToUtc, utcToZonedInputValue } from "@/lib/timezones";
import type { CalendarEvent, CompanyEvent, Candidate, Profile } from "@/lib/types";
import { fireNotifyEvent } from "@/lib/notifyClient";

// A "Candidate Meeting" splits into two colors depending on whose
// candidate it actually is - every other event type only ever has the
// one color, since is_downline_candidate is meaningless for a team
// event/reminder/other.
function eventColor(event: { event_type: CalendarEventType; is_downline_candidate: boolean }): string {
  if (event.event_type === "meeting" && event.is_downline_candidate) {
    return DOWNLINE_CANDIDATE_MEETING_COLOR;
  }
  return CALENDAR_EVENT_TYPES.find((t) => t.key === event.event_type)?.color ?? "#94a3b8";
}

function EventDot({ event }: { event: { event_type: CalendarEventType; is_downline_candidate: boolean } }) {
  return (
    <span
      className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: eventColor(event) }}
      aria-hidden="true"
    />
  );
}

// Each device renders this in its own local time zone automatically
// (toLocaleString/toLocaleTimeString with no explicit timeZone option
// use whatever zone the device itself is set to) - that part was always
// correct. What wasn't was the underlying instant: see zonedInputToUtc
// in lib/timezones.ts for how the Add/Edit Event form now computes it.
function formatEventLabel(iso: string, durationMinutes = 30): string {
  const start = new Date(iso);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const datePart = start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endTime = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart} at ${startTime} – ${endTime}`;
}

function formatTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// datetime-local inputs want "YYYY-MM-DDTHH:mm" in local time, with no
// timezone suffix - toISOString gives UTC, so build it from local parts.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Same "local calendar date, not UTC" concern as everywhere else in this
// app - an event's own local date (for grouping into grid cells) has
// nothing to do with what day it'd fall on in UTC.
function toDateOnlyLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function eventDateKey(iso: string): string {
  return toDateOnlyLocal(new Date(iso));
}

// A concrete calendar entry as actually rendered - either a real
// one-time calendar_events row, or one virtual occurrence of a
// recurring one (see expandRecurrence below). _masterId is only set on
// a virtual occurrence and points back at the real DB row every edit/
// delete on it actually has to act on, since only the series template
// (not each occurrence) is ever stored.
type DisplayEvent = CalendarEvent & { _masterId?: string };

// Same "clamp to the last real day of the target month" behavior every
// other calendar app uses for monthly recurrence - native Date month
// arithmetic instead rolls overflow into the following month (Jan 31 + 1
// month becomes Mar 3, not Feb 28), which would silently drift a
// "monthly on the 31st" event forward every time it crosses a shorter
// month.
function addMonthsClamped(base: Date, n: number): Date {
  const targetMonthIndex = base.getMonth() + n;
  const targetYear = base.getFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const result = new Date(base);
  result.setFullYear(targetYear, targetMonth, Math.min(base.getDate(), daysInTargetMonth));
  return result;
}

// How far past/future of "now" recurring events actually get expanded
// into virtual occurrences for display - not a real limit on the
// recurrence itself (recurrence_until, if set, is the real end), just a
// bound so an indefinitely-repeating event can't generate occurrences
// forever. Wide enough to cover any realistic amount of calendar
// browsing back/forward from today.
const RECURRENCE_WINDOW_PAST_DAYS = 180;
const RECURRENCE_WINDOW_FUTURE_DAYS = 365;
const MAX_OCCURRENCES_PER_EVENT = 500;

// Every occurrence of `event` (its own event_at counts as occurrence 0)
// that falls within [windowStart, windowEnd], as ISO instants. Editing
// or deleting a recurring event always acts on the stored row - there's
// no per-occurrence override/exception concept here - so this is purely
// for what gets drawn on screen.
function expandRecurrence(event: CalendarEvent, windowStart: Date, windowEnd: Date): string[] {
  if (event.recurrence_freq === "none") return [event.event_at];
  const base = new Date(event.event_at);
  const until = event.recurrence_until ? new Date(event.recurrence_until) : null;
  const effectiveEnd = until && until < windowEnd ? until : windowEnd;
  const occurrences: string[] = [];
  for (let n = 0; n < MAX_OCCURRENCES_PER_EVENT; n++) {
    const occDate =
      event.recurrence_freq === "weekly"
        ? new Date(base.getTime() + n * 7 * 86_400_000)
        : event.recurrence_freq === "biweekly"
          ? new Date(base.getTime() + n * 14 * 86_400_000)
          : addMonthsClamped(base, n);
    if (occDate > effectiveEnd) break;
    if (occDate >= windowStart) occurrences.push(occDate.toISOString());
  }
  return occurrences;
}

// Swipe-left/right on a touch device, Google Calendar-style, alongside
// the existing ‹ › arrow buttons rather than replacing them - a fixed
// horizontal distance threshold (not velocity-based) so a normal
// vertical scroll gesture inside the same element never gets mistaken
// for a swipe.
const SWIPE_THRESHOLD_PX = 50;
function useSwipeNav(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const startX = useRef(0);
  const startY = useRef(0);
  return {
    onTouchStart: (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    },
    onTouchEnd: (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
  };
}

type MonthCell = { date: string; inMonth: boolean };

// 6 rows x 7 columns (or however many full weeks the month actually
// spans), Sunday-first, with leading/trailing days from the adjacent
// months filled in so every row is a complete week - same shape as a
// normal Month grid in any calendar app.
function buildMonthGrid(monthStart: string): MonthCell[] {
  const start = new Date(`${monthStart}T00:00:00`);
  const year = start.getFullYear();
  const month = start.getMonth();
  const firstWeekday = start.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: MonthCell[] = [];
  for (let i = firstWeekday; i > 0; i--) {
    cells.push({ date: toDateOnlyLocal(new Date(year, month, 1 - i)), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: toDateOnlyLocal(new Date(year, month, day)), inMonth: true });
  }
  let trailing = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: toDateOnlyLocal(new Date(year, month + 1, trailing)), inMonth: false });
    trailing++;
  }
  return cells;
}

// Sunday-first - matches buildMonthGrid's grid (native getDay(), Sunday=0),
// so only the Month view's header/cells use this.
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Monday-first - matches weekStart/weekDates below, which are built from
// getWeekStartOffset() (deliberately Monday-anchored, since it also backs
// Pipeline/Goals/Streak's weekly period_start, constrained in the DB to a
// Monday). Using the Sunday-first WEEKDAY_LABELS here previously mislabeled
// every date in the Week view by one weekday letter (e.g. Aug 13, a real
// Thursday, showed under "W") - the dates themselves were always correct,
// only this label lookup was wrong.
const WEEKDAY_LABELS_WEEK_VIEW = ["M", "T", "W", "T", "F", "S", "S"];

// Default business-hours window for the Day view's hourly grid - covers
// the realistic range for QI1s, team calls, and meetings without needing
// a full scrollable 24-hour column on a small screen for a typical day.
// Late QI2s and night meet-and-greets are common enough that this can't
// be a hard clamp, though - the actual per-day range (see dayViewBounds
// below) stretches to cover every event that day, so nothing after 9 PM
// (or before 6 AM) gets pinned on top of the last visible row.
const DAY_VIEW_START_HOUR = 6;
const DAY_VIEW_END_HOUR = 21;
const HOUR_HEIGHT_PX = 52;

function hourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

type ViewMode = "agenda" | "day" | "week" | "month";

// Small always-visible key for the event dot colors - "Candidate
// Meeting" alone would no longer explain itself now that it splits into
// two colors depending on whose candidate it is.
const LEGEND_ITEMS: { label: string; color: string }[] = [
  { label: "My Candidate", color: CALENDAR_EVENT_TYPES[0].color },
  { label: "Downline's Candidate", color: DOWNLINE_CANDIDATE_MEETING_COLOR },
  { label: "Team Event", color: CALENDAR_EVENT_TYPES[1].color },
  { label: "Reminder", color: CALENDAR_EVENT_TYPES[2].color },
  { label: "Other", color: CALENDAR_EVENT_TYPES[3].color },
];

function EventRow({
  event,
  candidateLabel,
  creatorLabel,
  onEdit,
  onDelete,
  muted,
}: {
  event: DisplayEvent;
  candidateLabel: string | null;
  creatorLabel: string | null;
  onEdit: (event: DisplayEvent) => void;
  onDelete: (event: DisplayEvent) => void;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg bg-navy p-2 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5">
          <EventDot event={event} />
          <div>
            <p className={muted ? "text-sm text-slate-300" : "font-medium text-white"}>
              {event.title}
              {event.recurrence_freq !== "none" && (
                <span
                  className="ml-1 inline-flex items-center text-slate-400"
                  title="Repeats"
                  aria-label="Repeats"
                >
                  <Repeat className="h-3 w-3" aria-hidden />
                </span>
              )}
            </p>
            <p className={muted ? "text-xs text-slate-500" : "text-xs text-amber-light"}>
              {formatEventLabel(event.event_at, event.duration_minutes)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            className="btn-icon !h-6 !w-6 text-xs"
            onClick={() => onEdit(event)}
            aria-label={`Edit ${event.title}`}
          >
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
          <button
            className="btn-icon !h-6 !w-6 text-xs"
            onClick={() => onDelete(event)}
            aria-label={`Remove ${event.title}`}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </div>
      {candidateLabel && <p className="text-xs text-slate-400">Candidate: {candidateLabel}</p>}
      {event.notes && <p className="text-xs text-slate-400">{event.notes}</p>}
      {creatorLabel && (
        <span className="pill pill-amber gap-1">
          <Megaphone className="h-3 w-3" aria-hidden />
          From {creatorLabel}
        </span>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const { user, ownerId } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [downlineMembers, setDownlineMembers] = useState<
    { id: string; name: string; photoUrl: string | null }[]
  >([]);
  const hasDownline = downlineMembers.length > 0;
  // Resolves a linked spouse's id in either direction (household_id is
  // only ever stored on one side) - needed on top of `ownerId` because a
  // legacy calendar event created before Calendar became household-
  // shareable is filed under whichever spouse originally added it, not
  // necessarily the canonical owner id.
  const [partnerId, setPartnerId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [eventAt, setEventAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalInputValue(d);
  });
  const [candidateId, setCandidateId] = useState("");
  const [eventType, setEventType] = useState<CalendarEventType>("other");
  // Only meaningful when eventType is "meeting" - the candidate picker
  // right above this only ever lists the viewer's own candidates, so
  // there's no automatic way to tell "my candidate" from "a downline's"
  // for an event added through this form the way book_candidate_meeting()
  // can (it already knows who actually owns the candidate). This is the
  // manual equivalent for the plain Add/Edit Event path.
  const [isDownlineCandidate, setIsDownlineCandidate] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(30);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [recurrenceFreq, setRecurrenceFreq] = useState<CalendarEvent["recurrence_freq"]>("none");
  // Date-only input (no time) - the recurring occurrences themselves keep
  // the original start time, this just caps how far out they go. Empty
  // string means "repeats indefinitely" (recurrence_until stays null).
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  // Which zone the eventAt wall-clock time above is actually in - lets
  // "8:00 PM" mean 8 PM Central for a candidate tagged as Central even
  // though the person scheduling it is sitting in Eastern, instead of
  // always being interpreted in whatever zone the scheduler's own device
  // happens to be in. Defaults to the scheduler's own saved zone (see
  // myTimezone below), same fallback chain as candidates.timezone.
  const [timezone, setTimezone] = useState<string>(() => guessTimeZone());
  const [myTimezone, setMyTimezone] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The Add Event form (and, for admins, Team Events underneath it) now
  // lives in a bottom-sheet opened from a floating "+" button - same
  // "tap the FAB, fill the sheet, it dismisses on save" pattern as Google
  // Calendar, rather than a permanently-inline card pushing the actual
  // calendar views below the fold.
  const [showAddModal, setShowAddModal] = useState(false);
  // Set while editing an existing event instead of adding a new one - the
  // same sheet/form doubles as both, so someone can nudge a time or fix a
  // typo in place rather than deleting the whole event and re-adding it.
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const isAdmin = isPrimaryUser(user.email);
  const [companyEvents, setCompanyEvents] = useState<CompanyEvent[]>([]);
  const [ceTitle, setCeTitle] = useState("");
  const [ceNotes, setCeNotes] = useState("");
  const [ceEventAt, setCeEventAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalInputValue(d);
  });
  const [ceSaving, setCeSaving] = useState(false);
  const [ceSaveError, setCeSaveError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("agenda");
  const today = getToday();
  const [monthOffset, setMonthOffset] = useState(0);
  const monthStart = getMonthStartOffset(monthOffset);
  const [selectedGridDate, setSelectedGridDate] = useState(today);
  const [dayOffset, setDayOffset] = useState(0);
  const dayCursor = getDateOffset(dayOffset);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = getWeekStartOffset(weekOffset);
  const weekDates = useMemo(() => {
    const start = new Date(`${weekStart}T00:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return toDateOnlyLocal(d);
    });
  }, [weekStart]);
  const [selectedWeekDate, setSelectedWeekDate] = useState(today);

  // Jumping to a different month/week should land on a sensible selected
  // day - today if that period is the current one, otherwise its first
  // day - rather than keeping whatever day number was selected in a
  // totally different month/week. Adjusted during render (React's own
  // pattern for this) instead of an effect, which would cause an extra
  // cascading render.
  const [syncedMonthOffset, setSyncedMonthOffset] = useState(monthOffset);
  if (monthOffset !== syncedMonthOffset) {
    setSyncedMonthOffset(monthOffset);
    setSelectedGridDate(monthOffset === 0 ? today : monthStart);
  }
  const [syncedWeekOffset, setSyncedWeekOffset] = useState(weekOffset);
  if (weekOffset !== syncedWeekOffset) {
    setSyncedWeekOffset(weekOffset);
    setSelectedWeekDate(weekOffset === 0 ? today : weekStart);
  }

  async function loadCompanyEvents() {
    const { data } = await supabase
      .from("company_events")
      .select("*")
      .order("event_at", { ascending: true });
    setCompanyEvents((data as CompanyEvent[]) ?? []);
  }

  // Shared calendar for linked spouses: fetches every row that belongs to
  // either side of the household (the shared ownerId new events write
  // under, AND each spouse's own raw id, since rows created before this
  // became household-shareable are still filed under whichever spouse
  // originally added them). Deduped below by (title, event_at, notes) -
  // a company event or downline broadcast inserts one row per profile,
  // so once a household's two calendars merge, both spouses' own copies
  // of the same standing event would otherwise show up twice.
  async function loadEvents() {
    const idsToQuery = Array.from(
      new Set([user.id, ownerId, partnerId].filter((id): id is string => Boolean(id)))
    );
    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .in("user_id", idsToQuery)
      .order("event_at", { ascending: true });
    const rows = (data as CalendarEvent[]) ?? [];

    const seen = new Set<string>();
    const deduped = rows.filter((e) => {
      const key = `${e.title}|${e.event_at}|${e.notes}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setEvents(deduped);

    const creatorIds = Array.from(
      new Set(deduped.filter((e) => e.creator_id !== user.id).map((e) => e.creator_id))
    );
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,first_name,last_name")
        .in("id", creatorIds);
      const map: Record<string, string> = {};
      for (const p of (profiles as Pick<Profile, "id" | "first_name" | "last_name">[]) ?? []) {
        map[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed";
      }
      setCreatorNames(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc("get_household_partner_id");
      setPartnerId((data as string | null) ?? null);
    }
    load();
  }, [user.id]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
      const tz = (data as Pick<Profile, "timezone"> | null)?.timezone ?? null;
      setMyTimezone(tz);
      if (tz) setTimezone(tz);
    }
    load();
  }, [user.id]);

  useEffect(() => {
    async function load() {
      await loadEvents();
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, ownerId, partnerId]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("user_id", ownerId)
        .order("name", { ascending: true });
      setCandidates((data as Candidate[]) ?? []);
    }
    load();
  }, [ownerId]);

  // get_downline_user_ids is the authoritative "who's actually below me"
  // source (already excludes a linked spouse, whose data resolves to
  // this same account's ownerId, same as the Daily Update summary's
  // downline totals). A plain `profiles` query scoped only by RLS would
  // also include anyone in this account's *upline* chain now that upline
  // visibility exists, which would make this true even for someone with
  // zero real downline. Also doubles as the name list for the "specific
  // people" recipient picker on the Add Event form.
  useEffect(() => {
    async function load() {
      const { data: ids } = await supabase.rpc("get_downline_user_ids", { p_user_id: user.id });
      const downlineIds = ((ids as { user_id: string }[]) ?? []).map((r) => r.user_id);
      if (downlineIds.length === 0) {
        setDownlineMembers([]);
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,photo_url")
        .in("id", downlineIds);
      const list = ((profiles as Pick<Profile, "id" | "first_name" | "last_name" | "photo_url">[]) ?? [])
        .map((p) => ({
          id: p.id,
          name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed",
          photoUrl: p.photo_url,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setDownlineMembers(list);
    }
    load();
  }, [user.id]);

  useEffect(() => {
    if (!isAdmin) return;
    async function load() {
      await loadCompanyEvents();
    }
    load();
  }, [isAdmin]);

  async function addCompanyEvent() {
    const trimmedTitle = ceTitle.trim();
    if (!trimmedTitle || !ceEventAt) return;
    setCeSaving(true);
    setCeSaveError(null);
    const { error } = await supabase.rpc("add_company_event", {
      p_title: trimmedTitle,
      p_notes: ceNotes,
      p_event_at: new Date(ceEventAt).toISOString(),
    });
    if (error) {
      setCeSaveError(error.message);
    } else {
      fireNotifyEvent({
        kind: "calendar_event_added",
        title: trimmedTitle,
        eventAt: new Date(ceEventAt).toISOString(),
        scope: "all",
      });
      setCeTitle("");
      setCeNotes("");
      await loadCompanyEvents();
      await loadEvents();
    }
    setCeSaving(false);
  }

  async function removeCompanyEvent(id: string) {
    setCompanyEvents((prev) => prev.filter((e) => e.id !== id));
    await supabase.rpc("remove_company_event", { p_id: id });
  }

  function toggleRecipient(id: string, checked: boolean) {
    setSelectedRecipientIds((prev) => (checked ? [...prev, id] : prev.filter((r) => r !== id)));
  }

  // Resets the form to blank defaults and opens the sheet for a brand
  // new event - separated out from the "+" button's old inline
  // setShowAddModal(true) so it can also clear any in-progress edit
  // (editingEventId) left over from last time the sheet was open.
  // Optional `at` is the Day view grid tap handler below, prefilling the
  // tapped time instead of "now + 1 hour" - same Google Calendar-style
  // "tap a slot to start booking there" shortcut, on top of the FAB
  // (which still calls this with no argument).
  function openAddModal(at?: Date) {
    setEditingEventId(null);
    setTitle("");
    setNotes("");
    let d = at;
    if (!d) {
      d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
    }
    setEventAt(toLocalInputValue(d));
    setCandidateId("");
    setEventType("other");
    setIsDownlineCandidate(false);
    setReminderMinutes(30);
    setDurationMinutes(30);
    setRecurrenceFreq("none");
    setRecurrenceUntil("");
    setTimezone(myTimezone ?? guessTimeZone());
    setBroadcast(false);
    setSelectedRecipientIds([]);
    setSaveError(null);
    setShowAddModal(true);
  }

  // Opens the same sheet pre-filled from an existing event instead of a
  // blank form - saveEvent() below then updates that row in place rather
  // than inserting a new one. The wall-clock time is re-derived in the
  // event's OWN saved zone (falling back to this device's zone for an
  // event scheduled before event_timezone existed), not whatever zone
  // the person doing the editing happens to be sitting in - otherwise
  // reopening an unrelated event could silently shift its displayed time.
  // Always takes the real master row, never a virtual recurring
  // occurrence - see resolveMaster below, which every call site actually
  // routes through.
  function openEditModal(event: CalendarEvent) {
    const zone = event.event_timezone ?? guessTimeZone();
    setEditingEventId(event.id);
    setTitle(event.title);
    setNotes(event.notes);
    setEventAt(utcToZonedInputValue(event.event_at, zone));
    setCandidateId(event.candidate_id ?? "");
    setEventType(event.event_type);
    setIsDownlineCandidate(event.is_downline_candidate);
    setReminderMinutes(event.reminder_minutes_before);
    setDurationMinutes(event.duration_minutes);
    setRecurrenceFreq(event.recurrence_freq);
    setRecurrenceUntil(event.recurrence_until ? toDateOnlyLocal(new Date(event.recurrence_until)) : "");
    setTimezone(zone);
    setBroadcast(false);
    setSelectedRecipientIds([]);
    setSaveError(null);
    setShowAddModal(true);
  }

  // Every EventRow onEdit/onDelete actually receives a DisplayEvent,
  // which for a recurring occurrence is a synthetic clone (see
  // expandRecurrence/allInstances below) - _masterId, when present,
  // points back at the one real row every edit/delete has to act on
  // instead of the occurrence itself.
  function resolveMaster(event: DisplayEvent): CalendarEvent {
    if (!event._masterId) return event;
    return events.find((e) => e.id === event._masterId) ?? event;
  }

  function handleEditRow(event: DisplayEvent) {
    openEditModal(resolveMaster(event));
  }

  async function saveEvent() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !eventAt) return;
    setSaving(true);
    setSaveError(null);
    const isoEventAt = zonedInputToUtc(eventAt, timezone).toISOString();
    const linkedCandidate = candidateId || null;
    const isoRecurrenceUntil = recurrenceUntil
      ? zonedInputToUtc(`${recurrenceUntil}T23:59`, timezone).toISOString()
      : null;

    if (editingEventId) {
      // Editing only ever touches this one row - if the event was
      // originally broadcast/sent to others, each recipient has their
      // own independent copy already, same as the rest of this table's
      // design, so there's no separate "re-broadcast the edit" step. For
      // a recurring event this also means every virtual occurrence shown
      // on screen shifts together, since they're all derived from this
      // same row - there's no per-occurrence edit.
      const { error } = await supabase
        .from("calendar_events")
        .update({
          title: trimmedTitle,
          notes,
          event_at: isoEventAt,
          candidate_id: linkedCandidate,
          event_type: eventType,
          is_downline_candidate: eventType === "meeting" && isDownlineCandidate,
          reminder_minutes_before: reminderMinutes,
          duration_minutes: durationMinutes,
          event_timezone: timezone,
          recurrence_freq: recurrenceFreq,
          recurrence_until: isoRecurrenceUntil,
        })
        .eq("id", editingEventId);
      setSaving(false);
      if (error) {
        setSaveError(error.message);
        return;
      }
      setShowAddModal(false);
      loadEvents();
      return;
    }

    // Shared calendar for linked spouses: a personal event now files
    // under the household's canonical ownerId (same convention as
    // candidates/contacts/pipeline_periods) rather than the creator's own
    // raw id, so it shows on both spouses' calendars automatically.
    const { error: insertError } = await supabase.from("calendar_events").insert({
      user_id: ownerId,
      creator_id: user.id,
      title: trimmedTitle,
      notes,
      event_at: isoEventAt,
      candidate_id: linkedCandidate,
      scope: "private",
      event_type: eventType,
      is_downline_candidate: eventType === "meeting" && isDownlineCandidate,
      reminder_minutes_before: reminderMinutes,
      duration_minutes: durationMinutes,
      event_timezone: timezone,
      recurrence_freq: recurrenceFreq,
      recurrence_until: isoRecurrenceUntil,
    });

    if (insertError) {
      setSaveError(insertError.message);
      setSaving(false);
      return;
    }

    let secondaryError: string | null = null;

    if (broadcast) {
      const { error: broadcastError } = await supabase.rpc("broadcast_event_to_downline", {
        p_title: trimmedTitle,
        p_notes: notes,
        p_event_at: isoEventAt,
        p_candidate_id: linkedCandidate,
        p_event_type: eventType,
        p_reminder_minutes_before: reminderMinutes,
        p_duration_minutes: durationMinutes,
        p_event_timezone: timezone,
        p_is_downline_candidate: eventType === "meeting" && isDownlineCandidate,
        p_recurrence_freq: recurrenceFreq,
        p_recurrence_until: isoRecurrenceUntil,
      });
      if (broadcastError) {
        secondaryError = `Saved, but couldn't send it to your downline: ${broadcastError.message}`;
      } else {
        fireNotifyEvent({
          kind: "calendar_event_added",
          title: trimmedTitle,
          eventAt: isoEventAt,
          scope: "downline",
        });
      }
    } else if (selectedRecipientIds.length > 0) {
      const { error: sendError } = await supabase.rpc("send_event_to_recipients", {
        p_title: trimmedTitle,
        p_notes: notes,
        p_event_at: isoEventAt,
        p_recipient_ids: selectedRecipientIds,
        p_candidate_id: linkedCandidate,
        p_event_type: eventType,
        p_reminder_minutes_before: reminderMinutes,
        p_duration_minutes: durationMinutes,
        p_event_timezone: timezone,
        p_is_downline_candidate: eventType === "meeting" && isDownlineCandidate,
        p_recurrence_freq: recurrenceFreq,
        p_recurrence_until: isoRecurrenceUntil,
      });
      if (sendError) {
        secondaryError = `Saved, but couldn't send it to the people you picked: ${sendError.message}`;
      } else {
        fireNotifyEvent({
          kind: "calendar_event_added",
          title: trimmedTitle,
          eventAt: isoEventAt,
          scope: "specific",
          recipientIds: selectedRecipientIds,
        });
      }
    }

    setTitle("");
    setNotes("");
    setCandidateId("");
    setEventType("other");
    setReminderMinutes(30);
    setDurationMinutes(30);
    setRecurrenceFreq("none");
    setRecurrenceUntil("");
    setBroadcast(false);
    setSelectedRecipientIds([]);
    setSaving(false);
    loadEvents();

    // Only dismiss the sheet on a clean save - if the broadcast/send-to-
    // recipients step failed, the event itself still saved but the error
    // needs to stay on screen instead of vanishing with the sheet.
    if (secondaryError) {
      setSaveError(secondaryError);
    } else {
      setShowAddModal(false);
    }
  }

  // Deleting a recurring occurrence deletes the whole series (the one
  // real row it's derived from) - there's no per-occurrence delete, same
  // as edits. The confirmation text says so explicitly rather than
  // silently wiping every future occurrence with no warning.
  async function deleteEvent(display: DisplayEvent) {
    const master = resolveMaster(display);
    const warning =
      master.recurrence_freq !== "none"
        ? `Delete "${master.title}"? This removes the entire repeating series, not just this occurrence. Can't be undone.`
        : `Delete "${master.title}"? This can't be undone.`;
    if (!window.confirm(warning)) return;
    const previous = events;
    setEvents((prev) => prev.filter((e) => e.id !== master.id));
    const { error } = await supabase.from("calendar_events").delete().eq("id", master.id);
    if (error) {
      // Revert - otherwise a failed delete still looks like it worked.
      setEvents(previous);
      setDeleteError(error.message);
    } else {
      setDeleteError(null);
    }
  }

  // Every one-time event as-is, plus every recurring master expanded into
  // its own virtual occurrences within a bounded window (see
  // expandRecurrence's own comment for why this is a display bound, not
  // the real end of the recurrence) - everything downstream (agenda,
  // month grid, day/week grids) reads from this instead of `events`
  // directly, so no other view-specific expansion logic is needed
  // anywhere else. Deliberately not wrapped in useMemo, same as
  // upcoming/past below - it reads the current instant (for the
  // expansion window), which a memo is supposed to be a pure function of
  // its dependency array and isn't; event counts here are small enough
  // that recomputing this every render costs nothing worth guarding.
  const windowNow = new Date();
  const windowStart = new Date(windowNow.getTime() - RECURRENCE_WINDOW_PAST_DAYS * 86_400_000);
  const windowEnd = new Date(windowNow.getTime() + RECURRENCE_WINDOW_FUTURE_DAYS * 86_400_000);
  const allInstances: DisplayEvent[] = [];
  for (const e of events) {
    if (e.recurrence_freq === "none") {
      allInstances.push(e);
      continue;
    }
    for (const occAt of expandRecurrence(e, windowStart, windowEnd)) {
      allInstances.push({ ...e, id: `${e.id}::${occAt}`, event_at: occAt, _masterId: e.id });
    }
  }

  const now = new Date().toISOString();
  const upcoming = allInstances.filter((e) => e.event_at >= now).sort((a, b) => a.event_at.localeCompare(b.event_at));
  // Recurring occurrences are deliberately excluded here - a weekly
  // event's past would otherwise flood this list with dozens of old
  // instances nobody's looking for; only genuinely one-time past events
  // are useful to glance back at.
  const past = events
    .filter((e) => e.recurrence_freq === "none" && e.event_at < now)
    .slice(-10)
    .reverse();

  const eventsByDate: Record<string, DisplayEvent[]> = {};
  for (const e of allInstances) {
    const key = eventDateKey(e.event_at);
    (eventsByDate[key] ??= []).push(e);
  }
  for (const key of Object.keys(eventsByDate)) {
    eventsByDate[key].sort((a, b) => a.event_at.localeCompare(b.event_at));
  }

  const monthGrid = useMemo(() => buildMonthGrid(monthStart), [monthStart]);
  const selectedGridEvents = eventsByDate[selectedGridDate] ?? [];
  const dayEvents = eventsByDate[dayCursor] ?? [];
  const weekSelectedEvents = eventsByDate[selectedWeekDate] ?? [];

  // Widened past the default business-hours window whenever the day
  // actually has something earlier/later than that - so a 10 PM QI2 gets
  // its own row instead of being clamped on top of whatever's already at
  // 9 PM. Shared by both the Day view's grid and the Week view's
  // (per-selected-day) grid.
  function computeDayViewBounds(dayEvts: DisplayEvent[]): { start: number; end: number } {
    let start = DAY_VIEW_START_HOUR;
    let end = DAY_VIEW_END_HOUR;
    for (const e of dayEvts) {
      const d = new Date(e.event_at);
      const startHourFrac = d.getHours() + d.getMinutes() / 60;
      const endHourFrac = startHourFrac + e.duration_minutes / 60;
      start = Math.min(start, Math.floor(startHourFrac));
      end = Math.max(end, Math.ceil(endHourFrac));
    }
    return { start, end };
  }
  const dayViewBounds = computeDayViewBounds(dayEvents);
  const weekViewBounds = computeDayViewBounds(weekSelectedEvents);

  // Google Calendar-style "tap a time slot to start booking there" -
  // reads the tap's vertical position on the grid back into an hour,
  // snapped to the nearest 15 minutes since a raw pixel offset almost
  // never lands on an exact quarter-hour. Ignored when the tap actually
  // landed on an existing event block (that block's own onClick stops
  // propagation before this ever fires), so tapping an event still opens
  // it for editing rather than also queuing a new one underneath it.
  // Shared by Day and Week view's grids - each passes its own date and
  // bounds rather than assuming dayCursor/dayViewBounds.
  function handleGridClick(dateStr: string, bounds: { start: number; end: number }, e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawHour = bounds.start + y / HOUR_HEIGHT_PX;
    const totalMinutes = Math.min(
      Math.max(Math.round((rawHour * 60) / 15) * 15, bounds.start * 60),
      bounds.end * 60
    );
    const [year, month, day] = dateStr.split("-").map(Number);
    const target = new Date(year, month - 1, day, 0, 0, 0, 0);
    target.setMinutes(totalMinutes);
    openAddModal(target);
  }

  function candidateName(id: string | null): string | null {
    if (!id) return null;
    return candidates.find((c) => c.id === id)?.name ?? null;
  }

  function creatorLabel(e: CalendarEvent): string | null {
    if (e.creator_id === user.id) return null;
    return creatorNames[e.creator_id] ?? "a teammate";
  }

  // Swipe left moves forward in time (next month/week/day), right moves
  // back - same direction convention as flipping to the next page.
  // Offsets count backward from "now", so forward = decrement.
  const monthSwipe = useSwipeNav(
    () => setMonthOffset((o) => o - 1),
    () => setMonthOffset((o) => o + 1)
  );
  const weekSwipe = useSwipeNav(
    () => setWeekOffset((o) => o - 1),
    () => setWeekOffset((o) => o + 1)
  );
  const daySwipe = useSwipeNav(
    () => setDayOffset((o) => o - 1),
    () => setDayOffset((o) => o + 1)
  );

  // Top offset (px) for the current-time indicator line on an hourly
  // grid using these bounds - null when "now" falls outside the visible
  // range, so the line simply isn't drawn rather than clamped to an edge
  // where it wouldn't actually mean anything.
  function nowLineTop(bounds: { start: number; end: number }): number | null {
    const n = new Date();
    const frac = n.getHours() + n.getMinutes() / 60;
    if (frac < bounds.start || frac > bounds.end) return null;
    return (frac - bounds.start) * HOUR_HEIGHT_PX;
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Meetings, sessions, and reminders — yours, your spouse's, and your downline's"
      />
      <main className="page-main">
        {deleteError && (
          <div className="card">
            <p className="text-xs text-red-400">Couldn&apos;t delete that: {deleteError}</p>
          </div>
        )}

        <div className="card flex p-1">
          <button
            className={viewMode === "agenda" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setViewMode("agenda")}
          >
            Agenda
          </button>
          <button
            className={viewMode === "day" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setViewMode("day")}
          >
            Day
          </button>
          <button
            className={viewMode === "week" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setViewMode("week")}
          >
            Week
          </button>
          <button
            className={viewMode === "month" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setViewMode("month")}
          >
            Month
          </button>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-slate-400">
          {LEGEND_ITEMS.map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              {item.label}
            </span>
          ))}
        </div>

        {loading ? (
          <SkeletonList cards={3} />
        ) : viewMode === "agenda" ? (
          <>
            <div className="card space-y-2">
              <p className="section-title">Upcoming ({upcoming.length})</p>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-400">No upcoming events.</p>
              ) : (
                upcoming.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    candidateLabel={candidateName(e.candidate_id)}
                    creatorLabel={creatorLabel(e)}
                    onEdit={handleEditRow}
                    onDelete={deleteEvent}
                  />
                ))
              )}
            </div>

            {past.length > 0 && (
              <div className="card space-y-2">
                <p className="section-title">Recently Passed</p>
                {past.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    candidateLabel={candidateName(e.candidate_id)}
                    creatorLabel={creatorLabel(e)}
                    onEdit={handleEditRow}
                    onDelete={deleteEvent}
                    muted
                  />
                ))}
              </div>
            )}
          </>
        ) : viewMode === "month" ? (
          <>
            <div className="card space-y-2">
              <div className="flex items-center justify-between">
                <button
                  className="btn-icon"
                  onClick={() => setMonthOffset((o) => o + 1)}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span className="text-sm font-medium text-white">
                  {formatMonthLabel(monthStart)}
                  {monthOffset === 0 && <span className="ml-1 text-xs text-slate-500">(current)</span>}
                </span>
                <button
                  className="btn-icon"
                  onClick={() => setMonthOffset((o) => o - 1)}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-slate-500">
                {WEEKDAY_LABELS.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1" {...monthSwipe}>
                {monthGrid.map((cell) => {
                  const dayEventsForCell = eventsByDate[cell.date] ?? [];
                  const isToday = cell.date === today;
                  const isSelected = cell.date === selectedGridDate;
                  const overflowCount = dayEventsForCell.length - 2;
                  return (
                    <button
                      key={cell.date}
                      onClick={() => setSelectedGridDate(cell.date)}
                      className={`flex min-h-[3.25rem] flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 text-xs transition ${
                        isSelected
                          ? "bg-amber font-semibold text-ink"
                          : isToday
                            ? "bg-navy text-white ring-1 ring-amber"
                            : cell.inMonth
                              ? "text-slate-200"
                              : "text-slate-600"
                      }`}
                    >
                      <span>{Number(cell.date.slice(-2))}</span>
                      <span className="flex w-full flex-col items-stretch gap-0.5">
                        {dayEventsForCell.slice(0, 2).map((e, i) => (
                          <span
                            key={i}
                            className="w-full truncate rounded-sm px-0.5 text-[8px] font-normal leading-tight text-white"
                            style={{ backgroundColor: isSelected ? "#0f172a" : eventColor(e) }}
                          >
                            {e.title}
                          </span>
                        ))}
                        {overflowCount > 0 && (
                          <span
                            className={`text-[8px] font-normal leading-tight ${
                              isSelected ? "text-ink/70" : "text-slate-500"
                            }`}
                          >
                            +{overflowCount} more
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="card space-y-2">
              <p className="section-title">
                {formatDateLabel(selectedGridDate)}
                {selectedGridDate === today && <span className="ml-1 text-xs text-slate-500">(today)</span>}
              </p>
              {selectedGridEvents.length === 0 ? (
                <p className="text-sm text-slate-400">No events this day.</p>
              ) : (
                selectedGridEvents.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    candidateLabel={candidateName(e.candidate_id)}
                    creatorLabel={creatorLabel(e)}
                    onEdit={handleEditRow}
                    onDelete={deleteEvent}
                  />
                ))
              )}
            </div>
          </>
        ) : viewMode === "day" ? (
          <>
            <div className="card space-y-2">
              <div className="flex items-center justify-between">
                <button
                  className="btn-icon"
                  onClick={() => setDayOffset((o) => o + 1)}
                  aria-label="Previous day"
                >
                  ‹
                </button>
                <span className="text-sm font-medium text-white">
                  {formatDateLabel(dayCursor)}
                  {dayOffset === 0 && <span className="ml-1 text-xs text-slate-500">(today)</span>}
                </span>
                <button
                  className="btn-icon"
                  onClick={() => setDayOffset((o) => o - 1)}
                  aria-label="Next day"
                >
                  ›
                </button>
              </div>
              <p className="text-center text-[11px] text-slate-500">
                Tap a time slot below to add an event there
              </p>
              <div
                className="relative overflow-hidden rounded-lg"
                style={{ height: (dayViewBounds.end - dayViewBounds.start + 1) * HOUR_HEIGHT_PX }}
                onClick={(e) => handleGridClick(dayCursor, dayViewBounds, e)}
                {...daySwipe}
              >
                {Array.from({ length: dayViewBounds.end - dayViewBounds.start + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-white/5"
                    style={{ top: i * HOUR_HEIGHT_PX }}
                  >
                    <span className="absolute -top-2 left-1 bg-navy-lighter px-1 text-[10px] text-slate-500">
                      {hourLabel(dayViewBounds.start + i)}
                    </span>
                  </div>
                ))}
                {dayOffset === 0 &&
                  nowLineTop(dayViewBounds) !== null && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-400"
                      style={{ top: nowLineTop(dayViewBounds)! }}
                    >
                      <span className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-red-400" />
                    </div>
                  )}
                {dayEvents.map((e) => {
                  const d = new Date(e.event_at);
                  const hourFrac = d.getHours() + d.getMinutes() / 60;
                  const top = (hourFrac - dayViewBounds.start) * HOUR_HEIGHT_PX;
                  // Proportional to how long the event actually runs, so
                  // a 2-hour meeting reads as visibly longer than a
                  // 15-minute one instead of every event being the same
                  // fixed-size chip regardless of length. Floored at a
                  // minimum so a short event still has room for its text.
                  const height = Math.max((e.duration_minutes / 60) * HOUR_HEIGHT_PX, 22);
                  return (
                    <button
                      key={e.id}
                      className="absolute left-14 right-1 overflow-hidden rounded-md px-2 py-1 text-left text-xs text-white shadow"
                      style={{ top, height, backgroundColor: eventColor(e) }}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        handleEditRow(e);
                      }}
                    >
                      <span className="font-medium">
                        {e.title}
                        {e.recurrence_freq !== "none" && (
                          <Repeat className="ml-0.5 inline h-3 w-3 opacity-80" aria-hidden />
                        )}
                      </span>
                      <span className="ml-1 opacity-80">{formatTimeLabel(e.event_at)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="card space-y-2">
              <p className="section-title">
                {dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}
              </p>
              {dayEvents.length === 0 ? (
                <p className="text-sm text-slate-400">No events this day.</p>
              ) : (
                dayEvents.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    candidateLabel={candidateName(e.candidate_id)}
                    creatorLabel={creatorLabel(e)}
                    onEdit={handleEditRow}
                    onDelete={deleteEvent}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div className="card space-y-2">
              <div className="flex items-center justify-between">
                <button
                  className="btn-icon"
                  onClick={() => setWeekOffset((o) => o + 1)}
                  aria-label="Previous week"
                >
                  ‹
                </button>
                <span className="text-sm font-medium text-white">
                  {formatWeekRangeLabel(weekStart)}
                  {weekOffset === 0 && <span className="ml-1 text-xs text-slate-500">(this week)</span>}
                </span>
                <button
                  className="btn-icon"
                  onClick={() => setWeekOffset((o) => o - 1)}
                  aria-label="Next week"
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1" {...weekSwipe}>
                {weekDates.map((date, i) => {
                  const dayEventsForCell = eventsByDate[date] ?? [];
                  const isToday = date === today;
                  const isSelected = date === selectedWeekDate;
                  return (
                    <button
                      key={date}
                      onClick={() => setSelectedWeekDate(date)}
                      className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs transition ${
                        isSelected
                          ? "bg-amber font-semibold text-ink"
                          : isToday
                            ? "bg-navy text-white ring-1 ring-amber"
                            : "text-slate-200"
                      }`}
                    >
                      <span className="text-[10px] font-medium opacity-80">{WEEKDAY_LABELS_WEEK_VIEW[i]}</span>
                      <span>{Number(date.slice(-2))}</span>
                      <span className="flex h-1.5 items-center gap-0.5">
                        {dayEventsForCell.slice(0, 3).map((e, j) => (
                          <span
                            key={j}
                            className="h-1 w-1 rounded-full"
                            style={{ backgroundColor: isSelected ? "#0f172a" : eventColor(e) }}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="card space-y-2">
              <p className="section-title">
                {formatDateLabel(selectedWeekDate)}
                {selectedWeekDate === today && <span className="ml-1 text-xs text-slate-500">(today)</span>}
              </p>
              <p className="text-center text-[11px] text-slate-500">
                Tap a time slot below to add an event there
              </p>
              <div
                className="relative overflow-hidden rounded-lg"
                style={{ height: (weekViewBounds.end - weekViewBounds.start + 1) * HOUR_HEIGHT_PX }}
                onClick={(e) => handleGridClick(selectedWeekDate, weekViewBounds, e)}
              >
                {Array.from({ length: weekViewBounds.end - weekViewBounds.start + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-white/5"
                    style={{ top: i * HOUR_HEIGHT_PX }}
                  >
                    <span className="absolute -top-2 left-1 bg-navy-lighter px-1 text-[10px] text-slate-500">
                      {hourLabel(weekViewBounds.start + i)}
                    </span>
                  </div>
                ))}
                {selectedWeekDate === today &&
                  nowLineTop(weekViewBounds) !== null && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-400"
                      style={{ top: nowLineTop(weekViewBounds)! }}
                    >
                      <span className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-red-400" />
                    </div>
                  )}
                {weekSelectedEvents.map((e) => {
                  const d = new Date(e.event_at);
                  const hourFrac = d.getHours() + d.getMinutes() / 60;
                  const top = (hourFrac - weekViewBounds.start) * HOUR_HEIGHT_PX;
                  const height = Math.max((e.duration_minutes / 60) * HOUR_HEIGHT_PX, 22);
                  return (
                    <button
                      key={e.id}
                      className="absolute left-14 right-1 overflow-hidden rounded-md px-2 py-1 text-left text-xs text-white shadow"
                      style={{ top, height, backgroundColor: eventColor(e) }}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        handleEditRow(e);
                      }}
                    >
                      <span className="font-medium">
                        {e.title}
                        {e.recurrence_freq !== "none" && (
                          <Repeat className="ml-0.5 inline h-3 w-3 opacity-80" aria-hidden />
                        )}
                      </span>
                      <span className="ml-1 opacity-80">{formatTimeLabel(e.event_at)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Floating "+" button, Google Calendar-style - opens the Add Event
          sheet instead of a permanently-inline form pushing the actual
          calendar views below the fold. Wrapped in a full-width, pointer-
          events-none strip capped at the app's own max-w-md column (same
          trick BottomNav uses) so the button lands at the right edge of
          the app itself, not the raw viewport edge on a wider screen. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom)+1rem)] z-40 mx-auto w-full max-w-md px-4">
        <div className="flex justify-end">
          <button
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full text-3xl font-bold text-ink shadow-lg transition active:scale-95"
            style={{ background: "linear-gradient(135deg, var(--color-amber-light), var(--color-amber))" }}
            onClick={() => openAddModal()}
            aria-label="Add event"
          >
            +
          </button>
        </div>
      </div>

      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-navy-lighter p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="section-title">{editingEventId ? "Edit Event" : "Add Event"}</p>
                <button
                  className="btn-icon !h-7 !w-7 text-sm"
                  onClick={() => setShowAddModal(false)}
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <input
                className="input"
                placeholder="Title (e.g. QI1 with Jane)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  className="input flex-1"
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                />
                <select
                  className="select w-28 shrink-0"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  aria-label="Duration"
                >
                  {CALENDAR_DURATION_OPTIONS.map((opt) => (
                    <option key={opt.minutes} value={opt.minutes}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <span className="shrink-0 font-medium text-slate-300">Time entered above is in:</span>
                <select
                  className="select flex-1"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {US_TIMEZONES.map((tz) => (
                    <option key={tz.key} value={tz.key}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </label>
              <SearchablePicker
                value={candidateId}
                onChange={(id) => {
                  setCandidateId(id);
                  // Auto-fill the candidate's own saved zone, if they
                  // have one - the whole point of tagging a candidate's
                  // zone is not having to remember/convert it by hand
                  // every time you schedule something for them. Still
                  // just a default: the picker above stays fully
                  // editable if this particular event needs something
                  // different.
                  const cand = candidates.find((c) => c.id === id);
                  if (cand?.timezone) setTimezone(cand.timezone);
                }}
                placeholder="No linked candidate"
                searchPlaceholder="Search candidates…"
                options={[
                  { value: "", label: "No linked candidate" },
                  // Connected date + notes shown as a sublabel - two
                  // candidates can share a first name, and this is the
                  // fastest way to tell them apart while picking rather
                  // than guessing from the name alone.
                  ...candidates.map((c) => ({
                    value: c.id,
                    label: c.name,
                    sublabel: `Connected ${formatDateLabel(c.connected_date)}${c.notes ? ` · ${c.notes}` : ""}`,
                  })),
                ]}
              />
              <div className="flex gap-2">
                <select
                  className="select flex-1"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as CalendarEventType)}
                >
                  {CALENDAR_EVENT_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <select
                  className="select flex-1"
                  value={reminderMinutes === null ? "none" : String(reminderMinutes)}
                  onChange={(e) =>
                    setReminderMinutes(e.target.value === "none" ? null : Number(e.target.value))
                  }
                >
                  {CALENDAR_REMINDER_OPTIONS.map((opt) => (
                    <option key={opt.label} value={opt.minutes === null ? "none" : opt.minutes}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {eventType === "meeting" && (
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={isDownlineCandidate}
                    onChange={(e) => setIsDownlineCandidate(e.target.checked)}
                  />
                  This is for a downline&apos;s candidate, not your own
                </label>
              )}
              <div className="flex gap-2">
                <select
                  className="select flex-1"
                  value={recurrenceFreq}
                  onChange={(e) => setRecurrenceFreq(e.target.value as CalendarEvent["recurrence_freq"])}
                  aria-label="Repeat"
                >
                  {CALENDAR_RECURRENCE_OPTIONS.map((opt) => (
                    <option key={opt.freq} value={opt.freq}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {recurrenceFreq !== "none" && (
                  <input
                    type="date"
                    className="input flex-1"
                    placeholder="Ends (optional)"
                    value={recurrenceUntil}
                    onChange={(e) => setRecurrenceUntil(e.target.value)}
                    aria-label="Repeat ends on"
                  />
                )}
              </div>
              {recurrenceFreq !== "none" && (
                <p className="text-xs text-slate-500">
                  {recurrenceUntil ? "Repeats until the date above. " : "Repeats with no end date. "}
                  Editing or deleting this event later applies to the whole series, not just one
                  occurrence. Reminder notifications only go out for the first occurrence.
                </p>
              )}
              <textarea
                className="textarea"
                placeholder="Notes (e.g. 17, graduates this year — follow up after)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {!editingEventId && hasDownline && (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={broadcast}
                      onChange={(e) => {
                        setBroadcast(e.target.checked);
                        if (e.target.checked) setSelectedRecipientIds([]);
                      }}
                    />
                    Add to all downline (team meeting, info session, master class, conference…)
                  </label>
                  {!broadcast && (
                    <div className="rounded-lg bg-navy p-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-400">Or add for specific people:</p>
                        {selectedRecipientIds.length > 0 && (
                          <AvatarCluster
                            size="xs"
                            people={downlineMembers.filter((m) => selectedRecipientIds.includes(m.id))}
                          />
                        )}
                      </div>
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {downlineMembers.map((m) => (
                          <label key={m.id} className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                              type="checkbox"
                              checked={selectedRecipientIds.includes(m.id)}
                              onChange={(e) => toggleRecipient(m.id, e.target.checked)}
                            />
                            {m.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <button
                className="btn-primary w-full"
                onClick={saveEvent}
                disabled={saving || !title.trim()}
              >
                {saving ? "Saving…" : editingEventId ? "Save Changes" : "Add Event"}
              </button>
              {saveError && <p className="text-xs text-red-400">{saveError}</p>}
            </div>

            {isAdmin && !editingEventId && (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="section-title">Team Events (recurring)</p>
                <p className="text-xs text-slate-400">
                  Goes out to every current member right away, and automatically to anyone who
                  signs up later too — a standing rule, not a one-time send.
                </p>
                <input
                  className="input"
                  placeholder="Title (e.g. Masterclass)"
                  value={ceTitle}
                  onChange={(e) => setCeTitle(e.target.value)}
                />
                <input
                  type="datetime-local"
                  className="input"
                  value={ceEventAt}
                  onChange={(e) => setCeEventAt(e.target.value)}
                />
                <textarea
                  className="textarea"
                  placeholder="Notes (e.g. 4 PM – 7 PM)"
                  value={ceNotes}
                  onChange={(e) => setCeNotes(e.target.value)}
                />
                <button
                  className="btn-primary w-full"
                  onClick={addCompanyEvent}
                  disabled={ceSaving || !ceTitle.trim()}
                >
                  {ceSaving ? "Saving…" : "Add Recurring Event"}
                </button>
                {ceSaveError && <p className="text-xs text-red-400">{ceSaveError}</p>}

                {companyEvents.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {companyEvents.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy p-2">
                        <div>
                          <p className="text-sm text-slate-200">{e.title}</p>
                          <p className="text-xs text-slate-500">{formatEventLabel(e.event_at)}</p>
                        </div>
                        <button
                          className="btn-icon !h-6 !w-6 text-xs shrink-0"
                          onClick={() => removeCompanyEvent(e.id)}
                          aria-label={`Remove recurring event ${e.title}`}
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
