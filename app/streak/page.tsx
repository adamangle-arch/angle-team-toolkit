"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import { supabase } from "@/lib/supabaseClient";
import { getToday, getWeekStart, getMonthStart, formatDateLabel } from "@/lib/dates";
import { PIPELINE_STAGES, CANDIDATE_STEP_SHORT_LABELS, type PipelineStageKey } from "@/lib/constants";
import type { StreakDay, PipelinePeriod, MonthlyPv, Candidate, Profile } from "@/lib/types";

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

// Best-effort local notification reusing the permission/service worker
// set up on the Notifications page - no server round-trip needed.
async function notifyTriviaUnlocked() {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("Trivia Unlocked! 🎉", {
      body: "You completed today's Core Run - go answer today's 5 trivia questions.",
      icon: "/icon-192.png",
    });
  } catch {
    // Notifications are a nice-to-have; ignore failures.
  }
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
    story_share: row.story_shares > 0,
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
        <span className="w-5 text-center text-sm font-bold text-white">{value}</span>
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
  const today = getToday();
  const since = addDays(today, -120);

  // Which day the edit fields below (Read/Listen/Daily Update/Meetings)
  // and the Daily Update summary both target - defaults to today, but
  // can be switched to any previously-logged day (via the date picker or
  // tapping a day in the Last 30 Days grid) so someone can back-fill
  // something they missed, or file after midnight for the day that just
  // ended, without disturbing any other day's entries.
  const [selectedDay, setSelectedDay] = useState(today);

  const [readWhat, setReadWhat] = useState("");
  const [readAmount, setReadAmount] = useState("");
  const [newAudio, setNewAudio] = useState("");
  const [newMeeting, setNewMeeting] = useState("");

  const [weekly, setWeekly] = useState<PipelinePeriod | null>(null);
  const [monthly, setMonthly] = useState<PipelinePeriod | null>(null);
  const [pv, setPv] = useState<MonthlyPv | null>(null);
  const [activeCandidates, setActiveCandidates] = useState<Candidate[]>([]);
  const [newCandidatesForDay, setNewCandidatesForDay] = useState<Candidate[]>([]);
  const [copied, setCopied] = useState(false);
  const [showTriviaUnlocked, setShowTriviaUnlocked] = useState(false);
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
  // A linked spouse is NOT downline even if they also happen to satisfy
  // is_upline_of (e.g. they entered your account number as their upline
  // when they signed up) - their business data resolves to the exact
  // same ownerId as this account's own, so counting them here would
  // double-count your own numbers under their name. Filter anyone whose
  // resolved owner matches this account's own ownerId before doing
  // anything else with the list.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,household_id")
        .neq("id", user.id);
      if (cancelled) return;
      const downlineProfiles = (
        (data as Pick<Profile, "id" | "first_name" | "last_name" | "household_id">[]) ?? []
      ).filter((p) => (p.household_id ?? p.id) !== ownerId);
      setDownlineMemberCount(downlineProfiles.length);

      if (downlineProfiles.length === 0) {
        setDownlineWeekly(emptyStageTotals());
        setDownlineMonthly(emptyStageTotals());
        setDownlineActive([]);
        return;
      }

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

  const selectedRow: StreakDay = history[selectedDay] ?? emptyDay(user.id, selectedDay);

  // Adjust local input state during render (React's recommended pattern)
  // instead of in an effect, so it stays in sync whenever a fresh row
  // loads without triggering an extra render pass. Keyed on both the day
  // and the row id: the day alone catches switching between two days
  // that both happen to have no saved row yet (id "" both times, which
  // an id-only key would miss), and the id alone catches history finishing
  // its initial load or a fresh save creating a row for the same day.
  const rowSyncKey = `${selectedDay}:${selectedRow.id}`;
  const [syncedKey, setSyncedKey] = useState(rowSyncKey);
  if (syncedKey !== rowSyncKey) {
    setSyncedKey(rowSyncKey);
    setReadWhat(selectedRow.read_what);
    setReadAmount(selectedRow.read_amount);
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
  // historical snapshot of pipeline state to go back to.
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("user_id", ownerId)
        .eq("launched", false)
        .eq("filtered_out", false)
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
  async function saveToday(patch: Partial<StreakDay>) {
    const merged = withDerived({ ...selectedRow, ...patch });
    const isToday = selectedDay === today;
    const justUnlockedTrivia = isToday && !qualifies(selectedRow) && qualifies(merged);
    setHistory((prev) => ({ ...prev, [selectedDay]: merged }));
    if (justUnlockedTrivia) {
      setShowTriviaUnlocked(true);
      notifyTriviaUnlocked();
    }
    const { data, error } = await supabase
      .from("streak_days")
      .upsert(
        {
          user_id: user.id,
          day: selectedDay,
          read: merged.read,
          listen: merged.listen,
          daily_update: merged.daily_update,
          story_share: merged.story_share,
          read_what: merged.read_what,
          read_amount: merged.read_amount,
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
      setHistory((prev) => ({ ...prev, [selectedDay]: normalizeRow(data as StreakDay) }));
    }
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

  const streakAsOfSelectedDay = useMemo(
    () => computeStreakAsOf(history, selectedDay),
    [history, selectedDay]
  );

  const selectedQualifies = qualifies(selectedRow);
  const selectedDoneCount = [
    selectedRow.read,
    selectedRow.listen,
    selectedRow.daily_update,
    selectedRow.story_share,
  ].filter(Boolean).length;

  const summaryText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`📋 Daily Update — ${formatDateLabel(selectedDay)}`);
    lines.push("");
    lines.push("Today:");
    lines.push(
      `📖 Read: ${selectedRow.read_what || "—"}${selectedRow.read_amount ? ` — ${selectedRow.read_amount}` : ""}`
    );
    lines.push(
      `🎧 Listened: ${selectedRow.listen_what || "—"}${selectedRow.listen_count ? ` — ${selectedRow.listen_count} audio(s)` : ""}`
    );
    lines.push(`📝 Daily Update: ${selectedRow.daily_update ? "Done" : "Not yet"}`);
    lines.push(
      `💬 Story Shares: ${selectedRow.story_shares} | Questions: ${selectedRow.questions} | Yeses: ${selectedRow.yeses}`
    );
    lines.push(`🤝 Meetings Today (${selectedRow.meeting_items.length}):`);
    lines.push(
      selectedRow.meeting_items.length > 0 ? selectedRow.meeting_items.join("\n") : "None today."
    );
    lines.push(`👋 New Contacts Today (${newCandidatesForDay.length}):`);
    lines.push(
      newCandidatesForDay.length > 0
        ? newCandidatesForDay
            .map((c) => `${c.name}${c.notes ? ` — ${c.notes}` : ""}`)
            .join("\n")
        : "None today."
    );
    lines.push(`🔥 Current Streak: ${streakAsOfSelectedDay} day(s)`);
    lines.push("");
    lines.push("My Pipeline — This Week:");
    lines.push(
      weekly
        ? PIPELINE_STAGES.map((s) => `${s.label}: ${weekly[s.key]}`).join(" | ")
        : "No pipeline activity logged yet."
    );
    lines.push("");
    lines.push("My Pipeline — This Month:");
    lines.push(
      monthly
        ? PIPELINE_STAGES.map((s) => `${s.label}: ${monthly[s.key]}`).join(" | ")
        : "No pipeline activity logged yet."
    );
    lines.push("");
    lines.push(`💰 Current PV: ${pv?.pv ?? 0}`);
    lines.push("");
    lines.push(`My Active Pipeline (${activeCandidates.length}):`);
    lines.push(
      activeCandidates.length > 0
        ? activeCandidates
            .map((c) => `${c.name} — ${CANDIDATE_STEP_SHORT_LABELS[c.current_step] ?? "QI1"}`)
            .join("\n")
        : "No active candidates right now."
    );
    lines.push("");
    lines.push(`— Downline (${downlineMemberCount} member(s)) —`);
    if (downlineMemberCount === 0) {
      lines.push("No downline yet.");
    } else {
      lines.push("");
      lines.push("Downline — This Week:");
      lines.push(PIPELINE_STAGES.map((s) => `${s.label}: ${downlineWeekly[s.key]}`).join(" | "));
      lines.push("");
      lines.push("Downline — This Month:");
      lines.push(PIPELINE_STAGES.map((s) => `${s.label}: ${downlineMonthly[s.key]}`).join(" | "));
      lines.push("");
      lines.push(`Downline Active in Pipeline (${downlineActive.length}):`);
      lines.push(
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
        {showTriviaUnlocked && (
          <div className="card flex items-center justify-between gap-2 !border-amber bg-amber/10">
            <div>
              <p className="section-title">🎉 Trivia Unlocked!</p>
              <p className="text-xs text-slate-300">
                Today&apos;s Core Run is done — go answer today&apos;s 5 trivia questions.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/games?tab=trivia" className="btn-primary">
                Play
              </Link>
              <button
                className="btn-icon"
                onClick={() => setShowTriviaUnlocked(false)}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

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
          <div className="empty-state">Loading…</div>
        ) : (
          <>
            <div className="card space-y-2">
              <p className="section-title">📖 Read</p>
              <input
                className="input"
                placeholder="What are you reading?"
                value={readWhat}
                onChange={(e) => setReadWhat(e.target.value)}
                onBlur={() => {
                  if (readWhat !== selectedRow.read_what) saveToday({ read_what: readWhat });
                }}
              />
              <input
                className="input"
                placeholder="How much today? (e.g. 20 pages)"
                value={readAmount}
                onChange={(e) => setReadAmount(e.target.value)}
                onBlur={() => {
                  if (readAmount !== selectedRow.read_amount) saveToday({ read_amount: readAmount });
                }}
              />
              <Counter
                label="Minutes read"
                value={selectedRow.read_minutes}
                onChange={(next) => saveToday({ read_minutes: next })}
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
                onChange={(next) => saveToday({ questions: next })}
              />
              <Counter
                label="Yeses"
                value={selectedRow.yeses}
                onChange={(next) => saveToday({ yeses: next })}
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
