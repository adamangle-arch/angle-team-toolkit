"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import FirstVisitTip from "@/components/FirstVisitTip";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import AverageLeaders from "@/components/AverageLeaders";
import { supabase } from "@/lib/supabaseClient";
import { getToday, getWeekStart, getMonthStart, formatDateLabel } from "@/lib/dates";
import {
  PIPELINE_STAGES,
  CANDIDATE_STEP_SHORT_LABELS,
  ACTIVE_PIPELINE_MIN_STEP,
  READING_UNITS,
  type PipelineStageKey,
  type ReadingUnit,
} from "@/lib/constants";
import { fireNotifyEvent } from "@/lib/notifyClient";
import { checkAndAwardBadges } from "@/lib/badgeEngine";
import type {
  StreakDay,
  PipelinePeriod,
  MonthlyPv,
  Candidate,
  Profile,
  CalendarEvent,
  AverageLeaderEntry,
} from "@/lib/types";

// LTD Messaging's App Store listing. There's no public custom URL scheme
// or universal link documented for this app (it's a private team app,
// not a public SDK), so this can't jump straight into it - it opens the
// App Store page, which shows "Open" instead of "Get" if it's already
// installed.
const LTD_MESSAGING_APP_URL = "https://apps.apple.com/app/id1633405330";

type StageTotals = Record<PipelineStageKey, number>;

function emptyStageTotals(): StageTotals {
  return Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, 0])) as StageTotals;
}

function sumStages(rows: PipelinePeriod[]): StageTotals {
  const totals = emptyStageTotals();
  for (const row of rows) {
    for (const s of PIPELINE_STAGES) {
      totals[s.key] += row[s.key] ?? 0;
    }
  }
  return totals;
}

function fullName(p: { first_name: string | null; last_name: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed";
}

function qualifies(day: StreakDay): boolean {
  return day.read && day.listen && day.daily_update && day.story_share;
}

// read_amount is free text ("20 pages", "30 min", "a couple chapters") -
// pulling out the leading number is the only way to get something
// averageable out of it. Text with no leading number (can't tell how
// much) contributes 0, same as a day with nothing logged - there's no
// reliable way to guess an amount from "a couple chapters."
function leadingNumber(text: string): number {
  const match = text.trim().match(/^(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Consecutive qualifying days counting back from `day` (or the day
// before, if `day` itself doesn't qualify yet) - same walk used for the
// live "Current Streak" card, parameterized so the Daily Update summary
// can report the streak as of whichever day it's being filed for.
function computeStreakAsOf(history: Record<string, StreakDay>, day: string): number {
  let count = 0;
  let cursor = day;
  if (!(history[cursor] && qualifies(history[cursor]))) {
    cursor = addDays(cursor, -1);
  }
  while (history[cursor] && qualifies(history[cursor])) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

// Rows fetched straight from Supabase can be missing listen_items/
// meeting_items if the SQL migration adding those columns hasn't been
// run yet on this database - accessing .length/.join on `undefined`
// then crashes the render (this is what broke tapping a previous day
// before the migration had been applied). Normalize on every read so
// the app degrades to an empty list instead of throwing.
function normalizeRow(row: StreakDay): StreakDay {
  return {
    ...row,
    read_items: row.read_items ?? [],
    listen_items: row.listen_items ?? [],
    meeting_items: row.meeting_items ?? [],
    read_minutes: row.read_minutes ?? 0,
    depth_texts: row.depth_texts ?? 0,
  };
}

function emptyDay(userId: string, day: string): StreakDay {
  return {
    id: "",
    user_id: userId,
    day,
    read: false,
    listen: false,
    daily_update: false,
    story_share: false,
    read_what: "",
    read_amount: "",
    read_items: [],
    listen_what: "",
    listen_count: 0,
    listen_items: [],
    story_shares: 0,
    questions: 0,
    yeses: 0,
    meetings: 0,
    meeting_items: [],
    read_minutes: 0,
    depth_texts: 0,
  };
}

function withDerived(row: StreakDay): StreakDay {
  return {
    ...row,
    read: row.read_amount.trim() !== "",
    listen: row.listen_count > 0,
    // Some people log a conversation under Questions instead of Story
    // Shares even though it was really the same "shared your story"
    // moment - counting either one satisfies the qualifying check, not
    // just Story Shares specifically.
    story_share: row.story_shares > 0 || row.questions > 0,
  };
}

function Counter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  function commit() {
    const parsed = Math.max(0, parseInt(editValue, 10) || 0);
    setEditing(false);
    if (parsed !== value) onChange(parsed);
  }

  return (
    <div className="flex items-center justify-between rounded-lg bg-navy px-2 py-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <button
          className="btn-icon !h-6 !w-6 text-xs"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        {editing ? (
          <input
            type="number"
            min={0}
            inputMode="numeric"
            autoFocus
            className="w-10 rounded bg-white/10 text-center text-sm font-bold text-white outline-none"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          // Tapping the number opens direct entry - catching up after a
          // live event (e.g. 15 Yeses at once) used to mean 15 separate
          // taps on "+".
          <button
            type="button"
            className="w-5 text-center text-sm font-bold text-white"
            onClick={() => {
              setEditValue(String(value));
              setEditing(true);
            }}
            aria-label={`Edit ${label} directly`}
          >
            {value}
          </button>
        )}
        <button
          className="btn-icon !h-6 !w-6 text-xs"
          onClick={() => onChange(value + 1)}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function StreakPage() {
  const { user, ownerId } = useAuth();
  const [history, setHistory] = useState<Record<string, StreakDay>>({});
  const [loading, setLoading] = useState(true);
  // Company-wide top 3 for audios/reading per day
  // (get_streak_average_leaders in supabase/schema.sql) - fetched once
  // on mount, same as the other pages' team-leaders lists.
  const [streakLeaders, setStreakLeaders] = useState<AverageLeaderEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.rpc("get_streak_average_leaders");
      if (!cancelled) setStreakLeaders((data as AverageLeaderEntry[]) ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirrors `history`, but updated synchronously (not on the next render)
  // so back-to-back saveToday() calls each build their patch on top of the
  // other's latest change instead of a stale render's snapshot. Also holds
  // the per-day promise chain each save is queued onto, so two saves fired
  // close together (e.g. blurring the amount field, then tapping Add on a
  // reading title) always finish - and apply their server response - in
  // the order they were fired, instead of whichever network response
  // happens to land first clobbering the other with older data.
  const historyRef = useRef<Record<string, StreakDay>>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const today = getToday();
  const since = addDays(today, -120);

  // Which day the edit fields below (Read/Listen/Daily Update/Meetings)
  // and the Daily Update summary both target - defaults to today, but
  // can be switched to any previously-logged day (via the date picker or
  // tapping a day in the Last 30 Days grid) so someone can back-fill
  // something they missed, or file after midnight for the day that just
  // ended, without disturbing any other day's entries.
  const [selectedDay, setSelectedDay] = useState(today);

  const [readAmount, setReadAmount] = useState("");
  const [newRead, setNewRead] = useState("");
  const [newAudio, setNewAudio] = useState("");
  const [newMeeting, setNewMeeting] = useState("");

  // Which unit reading is tracked in - shared with the Reading goal on
  // Goals via profiles.reading_unit, so switching it here keeps that page
  // in sync too. Purely a label/entry preference: read_amount stays free
  // text either way.
  const [readingUnit, setReadingUnit] = useState<ReadingUnit>("minutes");
  const [readingUnitError, setReadingUnitError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("reading_unit")
        .eq("id", user.id)
        .single();
      if (data) setReadingUnit((data as Pick<Profile, "reading_unit">).reading_unit);
    }
    load();
  }, [user.id]);

  async function saveReadingUnit(unit: ReadingUnit) {
    const previous = readingUnit;
    setReadingUnit(unit);
    const { error } = await supabase.from("profiles").update({ reading_unit: unit }).eq("id", user.id);
    if (error) {
      setReadingUnit(previous);
      setReadingUnitError(error.message);
    } else {
      setReadingUnitError(null);
    }
  }

  const [weekly, setWeekly] = useState<PipelinePeriod | null>(null);
  const [monthly, setMonthly] = useState<PipelinePeriod | null>(null);
  const [pv, setPv] = useState<MonthlyPv | null>(null);
  const [activeCandidates, setActiveCandidates] = useState<Candidate[]>([]);
  const [newCandidatesForDay, setNewCandidatesForDay] = useState<Candidate[]>([]);
  const [copied, setCopied] = useState(false);
  const [showGamesUnlocked, setShowGamesUnlocked] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [downlineMemberCount, setDownlineMemberCount] = useState(0);
  const [downlineWeekly, setDownlineWeekly] = useState<StageTotals>(emptyStageTotals());
  const [downlineMonthly, setDownlineMonthly] = useState<StageTotals>(emptyStageTotals());
  const [downlineActive, setDownlineActive] = useState<
    { candidate: Candidate; ownerName: string }[]
  >([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("streak_days")
        .select("*")
        .eq("user_id", user.id)
        .gte("day", since)
        .order("day", { ascending: false });
      const map: Record<string, StreakDay> = {};
      for (const row of (data as StreakDay[]) ?? []) {
        map[row.day] = normalizeRow(row);
      }
      historyRef.current = map;
      setHistory(map);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Downline totals/pipeline, kept separate from the personal numbers
  // above. RLS on `profiles` already scopes this select to "me + my
  // downline" (see is_upline_of in supabase/schema.sql), so excluding my
  // own row here is enough to get exactly my downline. A linked spouse's
  // real pipeline/candidate rows live under their partner's id
  // (household_id), same resolution the Team tab uses, so downline
  // members are deduped to their household owner before summing to
  // avoid double-counting a linked pair.
  //
  // get_downline_user_ids is the authoritative "who's actually below me"
  // source (and already excludes a linked spouse - their business data
  // resolves to this account's own ownerId, so counting them here would
  // double-count your own numbers under their name). A plain `profiles`
  // query scoped only by RLS would also include anyone in this account's
  // *upline* chain now that upline visibility exists, which isn't what
  // this card means by "downline."
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: ids } = await supabase.rpc("get_downline_user_ids", { p_user_id: user.id });
      const downlineIds = ((ids as { user_id: string }[]) ?? []).map((r) => r.user_id);
      if (cancelled) return;

      if (downlineIds.length === 0) {
        setDownlineMemberCount(0);
        setDownlineWeekly(emptyStageTotals());
        setDownlineMonthly(emptyStageTotals());
        setDownlineActive([]);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,household_id")
        .in("id", downlineIds);
      if (cancelled) return;
      const downlineProfiles =
        (data as Pick<Profile, "id" | "first_name" | "last_name" | "household_id">[]) ?? [];
      setDownlineMemberCount(downlineProfiles.length);

      const ownerIds = Array.from(
        new Set(downlineProfiles.map((p) => p.household_id ?? p.id))
      );
      const ownerNameMap = new Map<string, string>();
      for (const p of downlineProfiles) {
        const ownerId = p.household_id ?? p.id;
        if (p.id === ownerId) ownerNameMap.set(ownerId, fullName(p));
      }
      for (const p of downlineProfiles) {
        const ownerId = p.household_id ?? p.id;
        if (!ownerNameMap.has(ownerId)) ownerNameMap.set(ownerId, fullName(p));
      }

      const weekStart = getWeekStart();
      const monthStart = getMonthStart();
      const [{ data: w }, { data: m }, { data: c }] = await Promise.all([
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("period_type", "weekly")
          .eq("period_start", weekStart)
          .in("user_id", ownerIds),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("period_type", "monthly")
          .eq("period_start", monthStart)
          .in("user_id", ownerIds),
        supabase
          .from("candidates")
          .select("*")
          .eq("launched", false)
          .eq("filtered_out", false)
          .gte("current_step", ACTIVE_PIPELINE_MIN_STEP)
          .in("user_id", ownerIds),
      ]);
      if (cancelled) return;
      setDownlineWeekly(sumStages((w as PipelinePeriod[]) ?? []));
      setDownlineMonthly(sumStages((m as PipelinePeriod[]) ?? []));
      setDownlineActive(
        ((c as Candidate[]) ?? []).map((candidate) => ({
          candidate,
          ownerName: ownerNameMap.get(candidate.user_id) ?? "Unnamed",
        }))
      );
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user.id, ownerId]);

  // Resolves a linked spouse's id in either direction (household_id is
  // only ever stored on one side) - same reason the Calendar page and
  // Today dashboard need this on top of ownerId: a calendar event is
  // filed under whichever spouse's ownerId was canonical at insert time.
  const [partnerId, setPartnerId] = useState<string | null>(null);
  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc("get_household_partner_id");
      setPartnerId((data as string | null) ?? null);
    }
    load();
  }, [user.id]);

  // What's on the calendar the day after whichever day this Daily Update
  // is for - lets someone prep for tomorrow (who they're meeting, what
  // time) right from the same summary they copy/paste out, instead of
  // needing to separately flip over to the Calendar tab.
  const [nextDayEvents, setNextDayEvents] = useState<CalendarEvent[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const nextDay = addDays(selectedDay, 1);
      const dayStart = new Date(`${nextDay}T00:00:00`);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const calendarIds = Array.from(
        new Set([user.id, ownerId, partnerId].filter((id): id is string => Boolean(id)))
      );
      const { data } = await supabase
        .from("calendar_events")
        .select("*")
        .in("user_id", calendarIds)
        .gte("event_at", dayStart.toISOString())
        .lt("event_at", dayEnd.toISOString())
        .order("event_at", { ascending: true });
      if (cancelled) return;
      const seen = new Set<string>();
      const deduped = ((data as CalendarEvent[]) ?? []).filter((e) => {
        const key = `${e.title}|${e.event_at}|${e.notes}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setNextDayEvents(deduped);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user.id, ownerId, partnerId, selectedDay]);

  const selectedRow: StreakDay = history[selectedDay] ?? emptyDay(user.id, selectedDay);

  // Adjust local input state during render (React's recommended pattern)
  // instead of in an effect, so it stays in sync whenever a fresh row
  // loads without triggering an extra render pass. Keyed on selectedDay
  // alone, gated on loading having finished - NOT on selectedRow.id, which
  // used to also be part of this key. That caused a real bug: today's row
  // starts out with id "" (no row saved yet) and only gets a real id once
  // *anything* is saved for the first time - so if someone typed into the
  // pages/minutes field but hadn't blurred it yet (nothing saved) and then
  // tapped Add on a reading title, that Add's save round-trip assigned
  // today's row a real id, which re-triggered this reset and wiped the
  // still-unsaved amount straight out of the input, even though nothing
  // about which day was selected had changed. Gating on `loading` instead
  // still correctly primes these fields the moment history finishes its
  // initial fetch, without re-firing on every subsequent save.
  const [syncedDay, setSyncedDay] = useState<string | null>(null);
  if (!loading && syncedDay !== selectedDay) {
    setSyncedDay(selectedDay);
    setReadAmount(selectedRow.read_amount);
    setNewRead("");
    setNewAudio("");
    setNewMeeting("");
  }

  // Pipeline totals for whichever day the Daily Update summary is being
  // filed for - the week/month boundaries are derived from selectedDay
  // rather than hardcoded to today, so picking a previous day always
  // shows the numbers for the period that day actually fell in (matters
  // right at a week/month boundary).
  useEffect(() => {
    async function load() {
      const selectedDate = new Date(`${selectedDay}T00:00:00`);
      const weekStart = getWeekStart(selectedDate);
      const monthStart = getMonthStart(selectedDate);
      const [{ data: w }, { data: m }, { data: p }] = await Promise.all([
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "weekly")
          .eq("period_start", weekStart)
          .maybeSingle(),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "monthly")
          .eq("period_start", monthStart)
          .maybeSingle(),
        supabase
          .from("monthly_pv")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_start", monthStart)
          .maybeSingle(),
      ]);
      setWeekly((w as PipelinePeriod) ?? null);
      setMonthly((m as PipelinePeriod) ?? null);
      setPv((p as MonthlyPv) ?? null);
    }
    load();
  }, [ownerId, selectedDay]);

  // Who's currently active in the Candidate Roadmap - always "right
  // now" regardless of which day the summary is for, since there's no
  // historical snapshot of pipeline state to go back to. Same
  // ACTIVE_PIPELINE_MIN_STEP threshold as the Roadmap tab and
  // get_my_active_candidates() - "active in the pipeline" means a QI1 is
  // actually booked (current_step >= 1), not just a "Yes" with nothing
  // scheduled yet.
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("user_id", ownerId)
        .eq("launched", false)
        .eq("filtered_out", false)
        .gte("current_step", ACTIVE_PIPELINE_MIN_STEP)
        .order("current_step", { ascending: false });
      setActiveCandidates((data as Candidate[]) ?? []);
    }
    load();
  }, [ownerId]);

  // New candidates connected on the selected day, straight from the
  // Candidate Roadmap (connected_date) rather than the separate A/B
  // Contact List - includes their notes so the summary shows the same
  // "met at X, works at Y" detail visible on their roadmap card.
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("user_id", ownerId)
        .eq("connected_date", selectedDay)
        .order("created_at", { ascending: true });
      setNewCandidatesForDay((data as Candidate[]) ?? []);
    }
    load();
  }, [ownerId, selectedDay]);

  // Saves to whichever day is currently selected - defaults to today, but
  // picking a previous day (date picker or the Last 30 Days grid) lets
  // you fill in something you missed without disturbing any other day.
  // Queued onto saveQueueRef (see historyRef above) so overlapping calls -
  // one per changed field, fired independently from onBlur/onClick
  // handlers - never race each other. Each queued turn re-reads the base
  // row from historyRef.current *at the time it actually runs*, not from
  // the selectedRow closure captured when it was fired, so the second of
  // two quick saves always patches on top of the first's change rather
  // than overwriting it.
  function saveToday(patch: Partial<StreakDay>) {
    const day = selectedDay;
    const run = async () => {
      const base = historyRef.current[day] ?? emptyDay(user.id, day);
      const merged = withDerived({ ...base, ...patch });
      const isToday = day === today;
      const justUnlockedGames = isToday && !qualifies(base) && qualifies(merged);
      historyRef.current = { ...historyRef.current, [day]: merged };
      setHistory((prev) => ({ ...prev, [day]: merged }));
      if (justUnlockedGames) {
        setShowGamesUnlocked(true);
        fireNotifyEvent({ kind: "core_run_completed" });
        fireNotifyEvent({ kind: "games_unlocked" });
      }
      const { data, error } = await supabase
        .from("streak_days")
        .upsert(
          {
            user_id: user.id,
            day,
            read: merged.read,
            listen: merged.listen,
            daily_update: merged.daily_update,
            story_share: merged.story_share,
            read_what: merged.read_what,
            read_amount: merged.read_amount,
            read_items: merged.read_items,
            read_minutes: merged.read_minutes,
            listen_what: merged.listen_what,
            listen_count: merged.listen_count,
            listen_items: merged.listen_items,
            story_shares: merged.story_shares,
            questions: merged.questions,
            yeses: merged.yeses,
            meetings: merged.meetings,
            meeting_items: merged.meeting_items,
            depth_texts: merged.depth_texts,
          },
          { onConflict: "user_id,day" }
        )
        .select("*")
        .single();
      if (error) {
        // The checkbox/field above already flipped optimistically - without
        // surfacing this, a failed save looks identical to a successful one
        // and silently doesn't count toward the streak.
        setSaveError(`Couldn't save that: ${error.message}`);
      } else if (data) {
        setSaveError(null);
        const normalized = normalizeRow(data as StreakDay);
        historyRef.current = { ...historyRef.current, [day]: normalized };
        setHistory((prev) => ({ ...prev, [day]: normalized }));
        // Evaluate right away instead of waiting for the next Dashboard/Badges
        // mount - otherwise a badge earned here (e.g. 5 Audios in a Day) sits
        // un-awarded until something else happens to trigger a re-check.
        checkAndAwardBadges(ownerId);
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(run, run);
    return saveQueueRef.current;
  }

  // Questions/Yeses are shared with the Pipeline Tracker's Daily Tally -
  // logging one here also bumps that same day's Daily/Weekly/Monthly
  // pipeline totals (bump_pipeline_stage), and since asking the question
  // (or getting a yes) is itself a story-sharing moment, Story Shares
  // goes up by the same amount too - on top of the existing story_share
  // qualifying check already being satisfied by either count.
  function logActivityCount(key: "questions" | "yeses", next: number) {
    const delta = next - (selectedRow[key] as number);
    const nextStoryShares = Math.max(0, selectedRow.story_shares + delta);
    saveToday({ [key]: next, story_shares: nextStoryShares });
    if (delta !== 0) {
      supabase.rpc("bump_pipeline_stage", {
        p_owner_id: ownerId,
        p_period_start: selectedDay,
        p_stage: key,
        p_delta: delta,
      });
    }
  }

  // Recently logged titles, most-recent-first, one per distinct title,
  // excluding whatever's already on today's list - so re-listening to the
  // same audio series or continuing the same book is a tap on a chip
  // instead of retyping the exact same title. Yesterday's book naturally
  // surfaces first here (nothing to special-case for "repeat yesterday"),
  // since it's simply the most recent entry.
  const recentTitles = useMemo(() => {
    const days = Object.keys(history).sort((a, b) => b.localeCompare(a));
    const audio: string[] = [];
    const read: string[] = [];
    const seenAudio = new Set(selectedRow.listen_items);
    const seenRead = new Set(selectedRow.read_items);
    for (const day of days) {
      const row = history[day];
      for (const item of row.listen_items) {
        if (!seenAudio.has(item)) {
          seenAudio.add(item);
          audio.push(item);
        }
      }
      for (const item of row.read_items) {
        if (!seenRead.has(item)) {
          seenRead.add(item);
          read.push(item);
        }
      }
      if (audio.length >= 5 && read.length >= 5) break;
    }
    return { audio: audio.slice(0, 5), read: read.slice(0, 5) };
  }, [history, selectedRow.listen_items, selectedRow.read_items]);

  function saveReads(items: string[]) {
    saveToday({
      read_items: items,
      read_what: items.join(", "),
    });
  }

  function addRead() {
    const trimmed = newRead.trim();
    if (!trimmed) return;
    saveReads([...selectedRow.read_items, trimmed]);
    setNewRead("");
  }

  function removeRead(index: number) {
    saveReads(selectedRow.read_items.filter((_, i) => i !== index));
  }

  // Tapping a "recently" chip - same effect as typing the exact same
  // title into the input and hitting Add, just one tap instead of retyping.
  function quickAddRead(title: string) {
    if (selectedRow.read_items.includes(title)) return;
    saveReads([...selectedRow.read_items, title]);
  }

  function saveAudios(items: string[]) {
    saveToday({
      listen_items: items,
      listen_what: items.join(", "),
      listen_count: items.length,
    });
  }

  function addAudio() {
    const trimmed = newAudio.trim();
    if (!trimmed) return;
    saveAudios([...selectedRow.listen_items, trimmed]);
    setNewAudio("");
  }

  function removeAudio(index: number) {
    saveAudios(selectedRow.listen_items.filter((_, i) => i !== index));
  }

  function quickAddAudio(title: string) {
    if (selectedRow.listen_items.includes(title)) return;
    saveAudios([...selectedRow.listen_items, title]);
  }

  function saveMeetings(items: string[]) {
    saveToday({ meeting_items: items, meetings: items.length });
  }

  function addMeeting() {
    const trimmed = newMeeting.trim();
    if (!trimmed) return;
    saveMeetings([...selectedRow.meeting_items, trimmed]);
    setNewMeeting("");
  }

  function removeMeeting(index: number) {
    saveMeetings(selectedRow.meeting_items.filter((_, i) => i !== index));
  }

  const streak = useMemo(() => computeStreakAsOf(history, today), [history, today]);

  // How much someone typically reads/listens on an average day, not just
  // whether they hit the qualifying minimum - audios counted the same way
  // the Audios badges are (listen_count), reading counted as whatever
  // number they wrote in read_amount (pages, minutes, whatever unit
  // someone actually uses - see leadingNumber above), over the Last 30
  // Days window already shown below, so a day with nothing logged still
  // counts as a 0 rather than being excluded and inflating the average.
  //
  // Clamped to start no earlier than their first-ever logged day, though -
  // someone who joined 8 days ago hasn't "missed" the 22 days before that,
  // so counting those as zeros against a brand-new user isn't a fair
  // reflection of their consistency since they actually started.
  //
  // Today itself is never included, on top of that - a day that isn't
  // over yet will always look emptier than a finished one purely because
  // there's still time left to log something, so counting it would make
  // today's average look artificially worse than a fair comparison.
  const last30Averages = useMemo(() => {
    const windowDays = Array.from({ length: 30 }, (_, i) => addDays(today, -30 + i));
    const loggedDays = Object.keys(history).filter((d) => d !== today).sort();
    const firstActivityDay = loggedDays.length > 0 ? loggedDays[0] : addDays(today, -1);
    const days = windowDays.filter((day) => day >= firstActivityDay);
    let audioTotal = 0;
    let readAmountTotal = 0;
    for (const day of days) {
      const row = history[day];
      audioTotal += row?.listen_count ?? 0;
      readAmountTotal += row ? leadingNumber(row.read_amount) : 0;
    }
    return {
      audiosPerDay: audioTotal / days.length,
      readAmountPerDay: readAmountTotal / days.length,
      windowDays: days.length,
    };
  }, [history, today]);

  const streakAsOfSelectedDay = useMemo(
    () => computeStreakAsOf(history, selectedDay),
    [history, selectedDay]
  );

  const readingUnitLabel = READING_UNITS.find((u) => u.key === readingUnit)?.label ?? "Minutes";

  const selectedQualifies = qualifies(selectedRow);
  const selectedDoneCount = [
    selectedRow.read,
    selectedRow.listen,
    selectedRow.daily_update,
    selectedRow.story_share,
  ].filter(Boolean).length;

  const summaryText = useMemo(() => {
    // A plain single blank line between sections read as jumbled once
    // there were this many of them stacked - a real divider between each
    // one (blank line, dashes, blank line) gives each section a clear
    // boundary instead of just a run of similar-looking lines.
    const DIVIDER = "───────────────";
    const lines: string[] = [];
    function section(...sectionLines: string[]) {
      lines.push("");
      lines.push(DIVIDER);
      lines.push("");
      lines.push(...sectionLines);
    }

    lines.push(`📋 Daily Update — ${formatDateLabel(selectedDay)}`);

    section(
      "Today:",
      `📖 Read: ${selectedRow.read_what || "—"}${selectedRow.read_amount ? ` — ${selectedRow.read_amount}` : ""}`,
      `🎧 Listened: ${selectedRow.listen_what || "—"}${selectedRow.listen_count ? ` — ${selectedRow.listen_count} audio(s)` : ""}`,
      "",
      `💬 Story Shares: ${selectedRow.story_shares} | Questions: ${selectedRow.questions} | Yeses: ${selectedRow.yeses}`
    );

    section(
      `🤝 Meetings Today (${selectedRow.meeting_items.length}):`,
      selectedRow.meeting_items.length > 0 ? selectedRow.meeting_items.join("\n") : "None today."
    );

    section(
      `👋 New Contacts Today (${newCandidatesForDay.length}):`,
      newCandidatesForDay.length > 0
        ? newCandidatesForDay.map((c) => `${c.name}${c.notes ? ` — ${c.notes}` : ""}`).join("\n")
        : "None today."
    );

    section(`🔥 Current Streak: ${streakAsOfSelectedDay} day(s)`);

    section(
      "My Pipeline — This Week:",
      weekly
        ? PIPELINE_STAGES.map((s) => `${s.label}: ${weekly[s.key]}`).join(" | ")
        : "No pipeline activity logged yet.",
      "",
      "My Pipeline — This Month:",
      monthly
        ? PIPELINE_STAGES.map((s) => `${s.label}: ${monthly[s.key]}`).join(" | ")
        : "No pipeline activity logged yet."
    );

    section(`💰 Current PV: ${pv?.pv ?? 0}`);

    section(
      `My Active Pipeline (${activeCandidates.length}):`,
      activeCandidates.length > 0
        ? activeCandidates
            .map((c) => `${c.name} — ${CANDIDATE_STEP_SHORT_LABELS[c.current_step] ?? "QI1"}`)
            .join("\n")
        : "No active candidates right now."
    );

    section(
      `📅 Tomorrow's Calendar (${nextDayEvents.length}):`,
      nextDayEvents.length > 0
        ? nextDayEvents
            .map(
              (e) =>
                `${new Date(e.event_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} — ${e.title}`
            )
            .join("\n")
        : "Nothing on the calendar yet."
    );

    if (downlineMemberCount === 0) {
      section(`— Downline (0 member(s)) —`, "No downline yet.");
    } else {
      section(
        `— Downline (${downlineMemberCount} member(s)) —`,
        "",
        "Downline — This Week:",
        PIPELINE_STAGES.map((s) => `${s.label}: ${downlineWeekly[s.key]}`).join(" | "),
        "",
        "Downline — This Month:",
        PIPELINE_STAGES.map((s) => `${s.label}: ${downlineMonthly[s.key]}`).join(" | "),
        "",
        `Downline Active in Pipeline (${downlineActive.length}):`,
        downlineActive.length > 0
          ? downlineActive
              .map(
                ({ candidate, ownerName }) =>
                  `${candidate.name} — ${CANDIDATE_STEP_SHORT_LABELS[candidate.current_step] ?? "QI1"} (${ownerName})`
              )
              .join("\n")
          : "No active downline candidates right now."
      );
    }

    return lines.join("\n");
  }, [
    selectedDay,
    selectedRow,
    streakAsOfSelectedDay,
    weekly,
    monthly,
    pv,
    activeCandidates,
    newCandidatesForDay,
    nextDayEvents,
    downlineMemberCount,
    downlineWeekly,
    downlineMonthly,
    downlineActive,
  ]);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <FeatureGate minSession={5}>
      <PageHeader
        title="Core Run Streak"
        subtitle="Read • Listen • Daily Update • Story Share"
      />
      <main className="page-main">
        {showGamesUnlocked && (
          <div className="card flex items-center justify-between gap-2 !border-amber bg-amber/10">
            <div>
              <p className="section-title">🎉 Games Unlocked!</p>
              <p className="text-xs text-slate-300">
                Today&apos;s Core Run is done — Diamond Run, Diamond Chase, and Trivia are all
                unlocked for today.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/games" className="btn-primary">
                Play
              </Link>
              <button
                className="btn-icon"
                onClick={() => setShowGamesUnlocked(false)}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <FirstVisitTip id="core-run-streak">
          💡 Complete all four — Read, Listen, Daily Update, Story Share — to count today toward
          your streak. Miss a day and it resets, so a quick partial log still beats skipping it
          entirely.
        </FirstVisitTip>

        <div className="card flex items-center justify-between">
          <div>
            <p className="section-title">Current Streak</p>
            <p className="text-xs text-slate-400">All 4 done counts as a streak day</p>
          </div>
          <p className="text-3xl font-bold text-amber">🔥 {streak}</p>
        </div>

        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <p className="section-title">
              {selectedDay === today ? "Today" : formatDateLabel(selectedDay)}
            </p>
            <span className={selectedQualifies ? "pill-amber" : "pill"}>
              {selectedDoneCount}/4 done
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              className="input flex-1"
              value={selectedDay}
              min={since}
              max={today}
              onChange={(e) => setSelectedDay(e.target.value || today)}
            />
            {selectedDay !== today && (
              <button
                className="btn-icon shrink-0 px-3 text-xs"
                onClick={() => setSelectedDay(today)}
              >
                Today
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Missed logging a day, or filing after midnight? Pick that date — the
            fields below and the Daily Update Summary will edit/show that day
            instead, without touching any other day&apos;s entries.
          </p>
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
        </div>

        <div className="card space-y-2">
          <p className="section-title">Last 30 Days</p>
          <p className="text-xs text-slate-400">Tap a day to view or edit it.</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 30 }, (_, i) => addDays(today, -29 + i)).map((day) => {
              const row = history[day];
              const done = row ? qualifies(row) : false;
              return (
                <button
                  key={day}
                  title={day}
                  onClick={() => setSelectedDay(day)}
                  className={`h-7 w-7 rounded-md text-center text-[10px] leading-7 transition ${
                    done ? "bg-amber text-navy font-bold" : "bg-white/10 text-slate-500"
                  } ${selectedDay === day ? "ring-2 ring-white" : ""}`}
                >
                  {Number(day.slice(8, 10))}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card space-y-2">
          <p className="section-title">
            Your Averages (Last {last30Averages.windowDays}{" "}
            Day{last30Averages.windowDays === 1 ? "" : "s"})
          </p>
          <div className="space-y-1 rounded-lg bg-navy px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-200">🎧 Audios per day</span>
              <span className="text-lg font-bold text-amber">
                {last30Averages.audiosPerDay.toFixed(1)}
              </span>
            </div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              🏆 Team Leaders
            </p>
            <AverageLeaders leaders={streakLeaders} metric="audios" />
          </div>
          <div className="space-y-1 rounded-lg bg-navy px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-200">📖 {readingUnitLabel} per day</span>
              <span className="text-lg font-bold text-amber">
                {last30Averages.readAmountPerDay.toFixed(1)}
              </span>
            </div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              🏆 Team Leaders
            </p>
            <AverageLeaders leaders={streakLeaders} metric="read_amount" />
          </div>
          <p className="text-xs text-slate-400">
            Audios counts each one you&apos;ve added. {readingUnitLabel} pulls the number straight
            out of &quot;How many {readingUnit} today?&quot; below — so make sure it starts with a
            number. Switching Track In changes what the app labels and averages here, but doesn&apos;t
            convert anything you&apos;ve already logged. Both are averaged across the completed
            days since you started logging Core Run (up to the last 30) — including days with
            nothing logged, so this reflects real day-to-day consistency since you started, not
            just how much you do on days you actually engage. Today itself isn&apos;t counted yet —
            it isn&apos;t over, so it can&apos;t be compared fairly to a finished day.
          </p>
        </div>

        {selectedDay !== today && (
          <div className="card flex items-center justify-between gap-2 !border-amber bg-amber/10">
            <p className="text-sm text-amber-light">
              ✏️ Editing {formatDateLabel(selectedDay)}
            </p>
            <button className="btn-primary shrink-0" onClick={() => setSelectedDay(today)}>
              Back to Today
            </button>
          </div>
        )}

        {loading ? (
          <SkeletonList cards={3} />
        ) : (
          <>
            <div className="card space-y-2">
              <p className="section-title">📖 Read</p>
              {selectedRow.read_items.length > 0 && (
                <div className="space-y-1.5">
                  {selectedRow.read_items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-navy px-2 py-1.5"
                    >
                      <span className="text-sm text-white">{item}</span>
                      <button
                        className="btn-icon !h-6 !w-6 text-xs"
                        onClick={() => removeRead(i)}
                        aria-label={`Remove ${item}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {recentTitles.read.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {recentTitles.read.map((title) => (
                    <button
                      key={title}
                      type="button"
                      className="pill"
                      onClick={() => quickAddRead(title)}
                    >
                      + {title}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="What are you reading?"
                  value={newRead}
                  onChange={(e) => setNewRead(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRead();
                    }
                  }}
                />
                <button className="btn-primary shrink-0 px-4" onClick={addRead}>
                  Add
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-xs text-slate-400">Track in:</span>
                <div className="flex flex-1 gap-1.5">
                  {READING_UNITS.map((u) => (
                    <button
                      key={u.key}
                      type="button"
                      className={readingUnit === u.key ? "toggle-pill-active" : "toggle-pill-inactive"}
                      onClick={() => saveReadingUnit(u.key)}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>
              {readingUnitError && <p className="text-xs text-red-400">{readingUnitError}</p>}
              <input
                type="number"
                min={0}
                className="input"
                placeholder={`How many ${readingUnit} today?`}
                value={readAmount}
                onChange={(e) => setReadAmount(e.target.value)}
                onBlur={() => {
                  if (readAmount !== selectedRow.read_amount) saveToday({ read_amount: readAmount });
                }}
              />
            </div>

            <div className="card space-y-2">
              <p className="section-title">🎧 Listen</p>
              {selectedRow.listen_items.length > 0 && (
                <div className="space-y-1.5">
                  {selectedRow.listen_items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-navy px-2 py-1.5"
                    >
                      <span className="text-sm text-white">{item}</span>
                      <button
                        className="btn-icon !h-6 !w-6 text-xs"
                        onClick={() => removeAudio(i)}
                        aria-label={`Remove ${item}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {recentTitles.audio.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {recentTitles.audio.map((title) => (
                    <button
                      key={title}
                      type="button"
                      className="pill"
                      onClick={() => quickAddAudio(title)}
                    >
                      + {title}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Add an audio…"
                  value={newAudio}
                  onChange={(e) => setNewAudio(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAudio();
                    }
                  }}
                />
                <button className="btn-primary shrink-0 px-4" onClick={addAudio}>
                  Add
                </button>
              </div>
            </div>

            <button
              onClick={() => saveToday({ daily_update: !selectedRow.daily_update })}
              className={`card flex items-center justify-between transition active:scale-95 ${
                selectedRow.daily_update ? "!border-amber" : ""
              }`}
            >
              <span className="section-title">📝 Daily Update</span>
              <span className={selectedRow.daily_update ? "pill-amber" : "pill"}>
                {selectedRow.daily_update ? "Done" : "Not yet"}
              </span>
            </button>

            <div className="card space-y-1.5">
              <p className="section-title">
                {selectedDay === today ? "Today's" : formatDateLabel(selectedDay)} Activity
              </p>
              <Counter
                label="Story Shares"
                value={selectedRow.story_shares}
                onChange={(next) => saveToday({ story_shares: next })}
              />
              <Counter
                label="Questions"
                value={selectedRow.questions}
                onChange={(next) => logActivityCount("questions", next)}
              />
              <Counter
                label="Yeses"
                value={selectedRow.yeses}
                onChange={(next) => logActivityCount("yeses", next)}
              />
            </div>

            <div className="card space-y-2">
              <p className="section-title">🤝 Meetings</p>
              {selectedRow.meeting_items.length > 0 && (
                <div className="space-y-1.5">
                  {selectedRow.meeting_items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-navy px-2 py-1.5"
                    >
                      <span className="text-sm text-white">{item}</span>
                      <button
                        className="btn-icon !h-6 !w-6 text-xs"
                        onClick={() => removeMeeting(i)}
                        aria-label={`Remove ${item}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Add a meeting (who/what)…"
                  value={newMeeting}
                  onChange={(e) => setNewMeeting(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMeeting();
                    }
                  }}
                />
                <button className="btn-primary shrink-0 px-4" onClick={addMeeting}>
                  Add
                </button>
              </div>
            </div>
          </>
        )}

        <div className="card space-y-2">
          <p className="section-title">Daily Update Summary</p>
          <p className="text-xs text-slate-400">
            Copy/paste this into your LTD daily update to your upline. Reflects
            whichever day is selected above — {formatDateLabel(selectedDay)}.
          </p>
          <textarea
            readOnly
            className="textarea min-h-[220px] font-mono text-xs"
            value={summaryText}
          />
          <button className="btn-primary w-full" onClick={copySummary}>
            {copied ? "Copied!" : "Copy Daily Update"}
          </button>
          {copied && (
            <>
              <a
                href={LTD_MESSAGING_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary block w-full text-center"
              >
                Open LTD Messaging to paste it
              </a>
              <p className="text-xs text-slate-500">
                Opens its App Store page — tap Open there if it&apos;s already installed.
              </p>
            </>
          )}
        </div>
      </main>
    </FeatureGate>
  );
}
