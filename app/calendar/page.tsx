"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import {
  isPrimaryUser,
  CALENDAR_EVENT_TYPES,
  CALENDAR_REMINDER_OPTIONS,
  type CalendarEventType,
} from "@/lib/constants";
import { getToday, getMonthStartOffset, getDateOffset, formatMonthLabel, formatDateLabel } from "@/lib/dates";
import type { CalendarEvent, CompanyEvent, Candidate, Profile } from "@/lib/types";
import { fireNotifyEvent } from "@/lib/notifyClient";

function eventTypeColor(type: CalendarEventType): string {
  return CALENDAR_EVENT_TYPES.find((t) => t.key === type)?.color ?? "#94a3b8";
}

function EventDot({ type }: { type: CalendarEventType }) {
  return (
    <span
      className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: eventTypeColor(type) }}
      aria-hidden="true"
    />
  );
}

function formatEventLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Business-hours window for the Day view's hourly grid - covers the
// realistic range for QI1s, team calls, and meetings without needing a
// full scrollable 24-hour column on a small screen. An event outside
// this window still shows, clamped to the nearest edge, rather than
// disappearing.
const DAY_VIEW_START_HOUR = 6;
const DAY_VIEW_END_HOUR = 21;
const HOUR_HEIGHT_PX = 52;

function hourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

type ViewMode = "agenda" | "day" | "month";

function EventRow({
  event,
  candidateLabel,
  creatorLabel,
  onDelete,
  muted,
}: {
  event: CalendarEvent;
  candidateLabel: string | null;
  creatorLabel: string | null;
  onDelete: (id: string) => void;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg bg-navy p-2 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5">
          <EventDot type={event.event_type} />
          <div>
            <p className={muted ? "text-sm text-slate-300" : "font-medium text-white"}>{event.title}</p>
            <p className={muted ? "text-xs text-slate-500" : "text-xs text-amber-light"}>
              {formatEventLabel(event.event_at)}
            </p>
          </div>
        </div>
        <button
          className="btn-icon !h-6 !w-6 text-xs shrink-0"
          onClick={() => onDelete(event.id)}
          aria-label={`Remove ${event.title}`}
        >
          ✕
        </button>
      </div>
      {candidateLabel && <p className="text-xs text-slate-400">Candidate: {candidateLabel}</p>}
      {event.notes && <p className="text-xs text-slate-400">{event.notes}</p>}
      {creatorLabel && <span className="pill pill-amber">📢 From {creatorLabel}</span>}
    </div>
  );
}

export default function CalendarPage() {
  const { user, ownerId } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [downlineMembers, setDownlineMembers] = useState<{ id: string; name: string }[]>([]);
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
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(30);
  const [broadcast, setBroadcast] = useState(false);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The Add Event form (and, for admins, Team Events underneath it) now
  // lives in a bottom-sheet opened from a floating "+" button - same
  // "tap the FAB, fill the sheet, it dismisses on save" pattern as Google
  // Calendar, rather than a permanently-inline card pushing the actual
  // calendar views below the fold.
  const [showAddModal, setShowAddModal] = useState(false);

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

  // Jumping to a different month should land on a sensible selected day -
  // today if that month is the current one, otherwise the 1st - rather
  // than keeping whatever day number was selected in a totally different
  // month. Adjusted during render (React's own pattern for this) instead
  // of an effect, which would cause an extra cascading render.
  const [syncedMonthOffset, setSyncedMonthOffset] = useState(monthOffset);
  if (monthOffset !== syncedMonthOffset) {
    setSyncedMonthOffset(monthOffset);
    setSelectedGridDate(monthOffset === 0 ? today : monthStart);
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
        .select("id,first_name,last_name")
        .in("id", downlineIds);
      const list = ((profiles as Pick<Profile, "id" | "first_name" | "last_name">[]) ?? [])
        .map((p) => ({
          id: p.id,
          name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed",
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

  async function addEvent() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !eventAt) return;
    setSaving(true);
    setSaveError(null);
    const isoEventAt = new Date(eventAt).toISOString();
    const linkedCandidate = candidateId || null;

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
      reminder_minutes_before: reminderMinutes,
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

  async function deleteEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await supabase.from("calendar_events").delete().eq("id", id);
  }

  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.event_at >= now);
  const past = events.filter((e) => e.event_at < now).slice(-10).reverse();

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of events) {
      const key = eventDateKey(e.event_at);
      (map[key] ??= []).push(e);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.event_at.localeCompare(b.event_at));
    }
    return map;
  }, [events]);

  const monthGrid = useMemo(() => buildMonthGrid(monthStart), [monthStart]);
  const selectedGridEvents = eventsByDate[selectedGridDate] ?? [];
  const dayEvents = eventsByDate[dayCursor] ?? [];

  function candidateName(id: string | null): string | null {
    if (!id) return null;
    return candidates.find((c) => c.id === id)?.name ?? null;
  }

  function creatorLabel(e: CalendarEvent): string | null {
    if (e.creator_id === user.id) return null;
    return creatorNames[e.creator_id] ?? "a teammate";
  }

  return (
    <FeatureGate minSession={1}>
      <PageHeader
        title="Calendar"
        subtitle="Meetings, sessions, and reminders — yours, your spouse's, and your downline's"
      />
      <main className="page-main">
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
            className={viewMode === "month" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setViewMode("month")}
          >
            Month
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading…</div>
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
              <div className="grid grid-cols-7 gap-1">
                {monthGrid.map((cell) => {
                  const dayEventsForCell = eventsByDate[cell.date] ?? [];
                  const isToday = cell.date === today;
                  const isSelected = cell.date === selectedGridDate;
                  return (
                    <button
                      key={cell.date}
                      onClick={() => setSelectedGridDate(cell.date)}
                      className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs transition ${
                        isSelected
                          ? "bg-amber font-semibold text-navy"
                          : isToday
                            ? "bg-navy text-white ring-1 ring-amber"
                            : cell.inMonth
                              ? "text-slate-200"
                              : "text-slate-600"
                      }`}
                    >
                      <span>{Number(cell.date.slice(-2))}</span>
                      <span className="flex h-1.5 items-center gap-0.5">
                        {dayEventsForCell.slice(0, 3).map((e, i) => (
                          <span
                            key={i}
                            className="h-1 w-1 rounded-full"
                            style={{
                              backgroundColor: isSelected ? "#0f172a" : eventTypeColor(e.event_type),
                            }}
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
              <div
                className="relative overflow-hidden rounded-lg"
                style={{ height: (DAY_VIEW_END_HOUR - DAY_VIEW_START_HOUR + 1) * HOUR_HEIGHT_PX }}
              >
                {Array.from({ length: DAY_VIEW_END_HOUR - DAY_VIEW_START_HOUR + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-white/5"
                    style={{ top: i * HOUR_HEIGHT_PX }}
                  >
                    <span className="absolute -top-2 left-1 bg-navy-lighter px-1 text-[10px] text-slate-500">
                      {hourLabel(DAY_VIEW_START_HOUR + i)}
                    </span>
                  </div>
                ))}
                {dayEvents.map((e) => {
                  const d = new Date(e.event_at);
                  const hourFrac = d.getHours() + d.getMinutes() / 60;
                  const clamped = Math.min(Math.max(hourFrac, DAY_VIEW_START_HOUR), DAY_VIEW_END_HOUR);
                  const top = (clamped - DAY_VIEW_START_HOUR) * HOUR_HEIGHT_PX;
                  return (
                    <div
                      key={e.id}
                      className="absolute left-14 right-1 truncate rounded-md px-2 py-1 text-xs text-white shadow"
                      style={{ top, backgroundColor: eventTypeColor(e.event_type) }}
                    >
                      <span className="font-medium">{e.title}</span>
                      <span className="ml-1 opacity-80">{formatTimeLabel(e.event_at)}</span>
                    </div>
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
                    onDelete={deleteEvent}
                  />
                ))
              )}
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
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full text-3xl font-bold text-navy shadow-lg transition active:scale-95"
            style={{ background: "linear-gradient(135deg, var(--color-amber-light), var(--color-amber))" }}
            onClick={() => setShowAddModal(true)}
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
                <p className="section-title">Add Event</p>
                <button
                  className="btn-icon !h-7 !w-7 text-sm"
                  onClick={() => setShowAddModal(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <input
                className="input"
                placeholder="Title (e.g. QI1 with Jane)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                type="datetime-local"
                className="input"
                value={eventAt}
                onChange={(e) => setEventAt(e.target.value)}
              />
              <select
                className="select"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
              >
                <option value="">No linked candidate</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
              <textarea
                className="textarea"
                placeholder="Notes (e.g. 17, graduates this year — follow up after)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {hasDownline && (
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
                      <p className="text-xs text-slate-400">Or add for specific people:</p>
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
                onClick={addEvent}
                disabled={saving || !title.trim()}
              >
                {saving ? "Saving…" : "Add Event"}
              </button>
              {saveError && <p className="text-xs text-red-400">{saveError}</p>}
            </div>

            {isAdmin && (
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
                          ✕
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
    </FeatureGate>
  );
}
