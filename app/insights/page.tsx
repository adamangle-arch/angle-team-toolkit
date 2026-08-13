"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import SearchablePicker from "@/components/SearchablePicker";
import AverageLeaders from "@/components/AverageLeaders";
import { SkeletonList } from "@/components/Skeleton";
import TrendChart from "@/components/TrendChart";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { PIPELINE_STAGES, READING_UNITS, type PipelineStageKey } from "@/lib/constants";
import {
  getDateOffset,
  getWeekStart,
  getWeekStartOffset,
  getMonthStart,
  getMonthStartOffset,
  formatShortDateLabel,
} from "@/lib/dates";
import { periodStartFor, averagesForPeriods, AVERAGES_WINDOW, AVERAGE_METRICS } from "@/lib/periodAverages";
import type { PipelinePeriod, Profile, StreakDay, MonthlyPv, AverageLeaderEntry } from "@/lib/types";

const DAILY_WINDOW_DAYS = 90;
const WEEK_TREND_COUNT = 8;
const MAX_PINNED_KPIS = 4;
// Out of a possible 7 - the threshold used to split "high Core Run" weeks
// from "low" ones in the correlation view below.
const HIGH_CORE_RUN_THRESHOLD = 4;
// Your Averages section - moved here from the Goals page verbatim, just
// retargeted to whichever person the Viewing picker above has selected
// instead of always being the viewer's own numbers.
const CORE_RUN_WINDOW = 30;
const VOLUME_WINDOW = 6;

// Same leading-number parse as app/streak/page.tsx's read_amount average -
// duplicated rather than imported since it's a tiny, self-contained piece
// of text parsing, not shared business logic like the period-averaging
// fairness rules above.
function leadingNumber(text: string): number {
  const match = text.trim().match(/^(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

type StreakDayRow = {
  day: string;
  read: boolean;
  listen: boolean;
  daily_update: boolean;
  story_share: boolean;
};

type DownlineMember = { id: string; name: string };

function stageLabel(key: PipelineStageKey): string {
  return PIPELINE_STAGES.find((s) => s.key === key)?.label ?? key;
}

function emptyStageTotals(): Record<PipelineStageKey, number> {
  const totals = {} as Record<PipelineStageKey, number>;
  for (const stage of PIPELINE_STAGES) totals[stage.key] = 0;
  return totals;
}

// Sums every PIPELINE_STAGES column across a batch of pipeline_periods
// rows - shared by the stage-conversion funnel (90 daily rows) below.
function sumStageTotals(rows: PipelinePeriod[]): Record<PipelineStageKey, number> {
  const totals = emptyStageTotals();
  for (const row of rows) {
    for (const stage of PIPELINE_STAGES) {
      totals[stage.key] += row[stage.key] ?? 0;
    }
  }
  return totals;
}

function deltaArrow(delta: number): string {
  return delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
}

type DownlineTotals = Record<PipelineStageKey, number>;

export default function InsightsPage() {
  return (
    <FeatureGate minSession={5}>
      <InsightsPageInner />
    </FeatureGate>
  );
}

function InsightsPageInner() {
  const { user, ownerId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentWeekRow, setCurrentWeekRow] = useState<PipelinePeriod | null>(null);
  const [dailyRows, setDailyRows] = useState<PipelinePeriod[]>([]);
  const [weeklyRows, setWeeklyRows] = useState<PipelinePeriod[]>([]);
  const [monthlyRow, setMonthlyRow] = useState<PipelinePeriod | null>(null);
  const [streakDays, setStreakDays] = useState<StreakDayRow[]>([]);
  const [downlineMembers, setDownlineMembers] = useState<DownlineMember[]>([]);
  const [downlineWeekly, setDownlineWeekly] = useState<Record<string, DownlineTotals>>({});
  const [trendStage, setTrendStage] = useState<PipelineStageKey>("launches");
  const [editingPins, setEditingPins] = useState(false);
  const [pinDraft, setPinDraft] = useState<PipelineStageKey[]>([]);
  const [savingPins, setSavingPins] = useState(false);
  const [correlationStage, setCorrelationStage] = useState<PipelineStageKey>("questions");

  // Your Averages - company-wide Team Leaders are independent of who's
  // selected in the Viewing picker (always the real leaders), but the
  // rolling-window pacing numbers below them retarget to whichever
  // person is currently selected, same as the rest of this page.
  const [pipelineLeaders, setPipelineLeaders] = useState<AverageLeaderEntry[]>([]);
  const [volumeLeaders, setVolumeLeaders] = useState<AverageLeaderEntry[]>([]);
  const [streakLeaders, setStreakLeaders] = useState<AverageLeaderEntry[]>([]);
  const [leadersError, setLeadersError] = useState<string | null>(null);
  const [avgStreakRows, setAvgStreakRows] = useState<
    Pick<StreakDay, "day" | "read_amount" | "listen_count">[]
  >([]);
  const [avgDailyRows, setAvgDailyRows] = useState<PipelinePeriod[]>([]);
  const [avgWeeklyRows, setAvgWeeklyRows] = useState<PipelinePeriod[]>([]);
  const [avgMonthlyRows, setAvgMonthlyRows] = useState<PipelinePeriod[]>([]);
  const [avgVolumeRows, setAvgVolumeRows] = useState<MonthlyPv[]>([]);

  // Empty string = viewing your own (household) numbers - anything else is
  // a downline member's raw user_id, viewed directly rather than through
  // their own household resolution (an edge case not worth the extra
  // lookup for a "peek at someone else's numbers" feature).
  const [viewingId, setViewingId] = useState("");
  const viewingSelf = viewingId === "";
  const pipelineTargetId = viewingSelf ? ownerId : viewingId;
  const streakTargetId = viewingSelf ? user.id : viewingId;
  const viewingName = viewingSelf
    ? "You"
    : downlineMembers.find((m) => m.id === viewingId)?.name ?? "them";

  const hasDownline = downlineMembers.length > 0;

  // Oldest to newest, excludes the current in-progress week (offset 0) -
  // same "don't count an unfinished period" principle lib/periodAverages.ts
  // already uses for the Tally/Goals averages.
  const weekStarts = useMemo(
    () => Array.from({ length: WEEK_TREND_COUNT }, (_, i) => getWeekStartOffset(WEEK_TREND_COUNT - i)),
    []
  );

  // The downline roster (for the "Viewing" picker) and your own profile
  // (pinned_kpis is always yours, even while viewing someone else's
  // numbers) - neither depends on which target is selected, so both load
  // once per visit rather than re-fetching on every picker change.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: profileRow }, { data: downlineIds }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.rpc("get_downline_user_ids", { p_user_id: user.id }),
      ]);
      if (cancelled) return;
      setProfile((profileRow as Profile) ?? null);
      const ids = ((downlineIds as { user_id: string }[]) ?? []).map((r) => r.user_id);
      if (ids.length === 0) {
        setDownlineMembers([]);
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,first_name,last_name")
        .in("id", ids);
      const list = ((profiles as Pick<Profile, "id" | "first_name" | "last_name">[]) ?? [])
        .map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed" }))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!cancelled) setDownlineMembers(list);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: currentWeek }, { data: daily }, { data: weekly }, { data: monthly }, { data: streak }] =
        await Promise.all([
          supabase
            .from("pipeline_periods")
            .select("*")
            .eq("user_id", pipelineTargetId)
            .eq("period_type", "weekly")
            .eq("period_start", getWeekStartOffset(0))
            .maybeSingle(),
          supabase
            .from("pipeline_periods")
            .select("*")
            .eq("user_id", pipelineTargetId)
            .eq("period_type", "daily")
            .gte("period_start", getDateOffset(DAILY_WINDOW_DAYS - 1)),
          supabase
            .from("pipeline_periods")
            .select("*")
            .eq("user_id", pipelineTargetId)
            .eq("period_type", "weekly")
            .in("period_start", weekStarts),
          supabase
            .from("pipeline_periods")
            .select("*")
            .eq("user_id", pipelineTargetId)
            .eq("period_type", "monthly")
            .eq("period_start", getMonthStartOffset(0))
            .maybeSingle(),
          supabase
            .from("streak_days")
            .select("day,read,listen,daily_update,story_share")
            .eq("user_id", streakTargetId)
            .gte("day", weekStarts[0]),
        ]);
      if (cancelled) return;
      setCurrentWeekRow((currentWeek as PipelinePeriod) ?? null);
      setDailyRows((daily as PipelinePeriod[]) ?? []);
      setWeeklyRows((weekly as PipelinePeriod[]) ?? []);
      setMonthlyRow((monthly as PipelinePeriod) ?? null);
      setStreakDays((streak as StreakDayRow[]) ?? []);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineTargetId, streakTargetId]);

  // Downline Trend always reflects the real logged-in user's own downline
  // rollup, regardless of who's selected in the "Viewing" picker above -
  // a distinct concept (your team's combined numbers) from "peek at one
  // person's individual numbers." get_downline_pipeline_totals has no
  // range variant, so this is WEEK_TREND_COUNT of its own round trips,
  // loaded independently so it doesn't block the rest of the page.
  useEffect(() => {
    if (!hasDownline) return;
    let cancelled = false;
    async function load() {
      const results = await Promise.all(
        weekStarts.map((ws) =>
          supabase.rpc("get_downline_pipeline_totals", { p_period_type: "weekly", p_period_start: ws })
        )
      );
      if (cancelled) return;
      const map: Record<string, DownlineTotals> = {};
      results.forEach((res, i) => {
        const row = ((res.data as DownlineTotals[]) ?? [])[0];
        if (row) map[weekStarts[i]] = row;
      });
      setDownlineWeekly(map);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDownline]);

  // Team-wide top 3 for each Your Averages metric below - the real
  // company leaders regardless of who's selected in the Viewing picker,
  // so this only loads once per visit rather than on every target switch.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [
        { data: pipeline, error: pipelineError },
        { data: volume, error: volumeError },
        { data: streak, error: streakError },
      ] = await Promise.all([
        supabase.rpc("get_pipeline_average_leaders", { p_period_type: "monthly" }),
        supabase.rpc("get_volume_average_leaders"),
        supabase.rpc("get_streak_average_leaders"),
      ]);
      if (cancelled) return;
      const error = pipelineError || volumeError || streakError;
      if (error) {
        setLeadersError(error.message);
      } else {
        setLeadersError(null);
        setPipelineLeaders((pipeline as AverageLeaderEntry[]) ?? []);
        setVolumeLeaders((volume as AverageLeaderEntry[]) ?? []);
        setStreakLeaders((streak as AverageLeaderEntry[]) ?? []);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Today is never counted (see coreRunAverages below), so this needs
      // to reach one day further back to still cover CORE_RUN_WINDOW
      // completed days.
      const since = getDateOffset(CORE_RUN_WINDOW);
      const today = getDateOffset(0);
      const { data } = await supabase
        .from("streak_days")
        .select("day,read_amount,listen_count")
        .eq("user_id", streakTargetId)
        .gte("day", since)
        .lt("day", today);
      if (!cancelled) {
        setAvgStreakRows((data as Pick<StreakDay, "day" | "read_amount" | "listen_count">[]) ?? []);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [streakTargetId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // +1 further back than each window size - the current (in-progress)
      // period is never counted (see averagesForPeriods), so this still
      // needs to reach far enough back for a full window of *completed*
      // periods.
      const dailyStart = periodStartFor("daily", AVERAGES_WINDOW.daily);
      const weeklyStart = periodStartFor("weekly", AVERAGES_WINDOW.weekly);
      const monthlyStart = periodStartFor("monthly", AVERAGES_WINDOW.monthly);
      const [{ data: d }, { data: w }, { data: m }] = await Promise.all([
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", pipelineTargetId)
          .eq("period_type", "daily")
          .gte("period_start", dailyStart),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", pipelineTargetId)
          .eq("period_type", "weekly")
          .gte("period_start", weeklyStart),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", pipelineTargetId)
          .eq("period_type", "monthly")
          .gte("period_start", monthlyStart),
      ]);
      if (cancelled) return;
      setAvgDailyRows((d as PipelinePeriod[]) ?? []);
      setAvgWeeklyRows((w as PipelinePeriod[]) ?? []);
      setAvgMonthlyRows((m as PipelinePeriod[]) ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [pipelineTargetId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const since = getMonthStartOffset(VOLUME_WINDOW);
      const thisMonth = getMonthStart();
      const { data } = await supabase
        .from("monthly_pv")
        .select("*")
        .eq("user_id", pipelineTargetId)
        .gte("period_start", since)
        .lt("period_start", thisMonth);
      if (!cancelled) setAvgVolumeRows((data as MonthlyPv[]) ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [pipelineTargetId]);

  // Today isn't counted, on top of the usual fairness clamp - a day
  // that isn't over yet will always look emptier than a finished one
  // purely because there's still time left to log something in it.
  const coreRunAverages = useMemo(() => {
    const byDay = new Map(avgStreakRows.map((r) => [r.day, r]));
    const firstDay = avgStreakRows.map((r) => r.day).sort()[0] ?? getDateOffset(1);
    const days = Array.from({ length: CORE_RUN_WINDOW }, (_, i) =>
      getDateOffset(CORE_RUN_WINDOW - i)
    ).filter((d) => d >= firstDay);

    let audioTotal = 0;
    let readTotal = 0;
    for (const day of days) {
      const row = byDay.get(day);
      audioTotal += row?.listen_count ?? 0;
      readTotal += row ? leadingNumber(row.read_amount) : 0;
    }
    const n = days.length || 1;
    return { audiosPerDay: audioTotal / n, readAmountPerDay: readTotal / n, windowCount: days.length };
  }, [avgStreakRows]);

  const dailyAverages = useMemo(
    () => averagesForPeriods("daily", avgDailyRows, AVERAGES_WINDOW.daily),
    [avgDailyRows]
  );
  const weeklyAverages = useMemo(
    () => averagesForPeriods("weekly", avgWeeklyRows, AVERAGES_WINDOW.weekly),
    [avgWeeklyRows]
  );
  const monthlyAverages = useMemo(
    () => averagesForPeriods("monthly", avgMonthlyRows, AVERAGES_WINDOW.monthly),
    [avgMonthlyRows]
  );

  // This month isn't counted either, same reasoning - it isn't over yet.
  const volumeAverages = useMemo(() => {
    const byMonth = new Map(avgVolumeRows.map((r) => [r.period_start, r]));
    const firstStart = avgVolumeRows.map((r) => r.period_start).sort()[0] ?? getMonthStartOffset(1);
    const months = Array.from({ length: VOLUME_WINDOW }, (_, i) =>
      getMonthStartOffset(VOLUME_WINDOW - i)
    ).filter((s) => s >= firstStart);

    let pvTotal = 0;
    let dittoTotal = 0;
    for (const start of months) {
      const row = byMonth.get(start);
      pvTotal += row?.pv ?? 0;
      dittoTotal += row?.day1_ditto_pv ?? 0;
    }
    const n = months.length || 1;
    return { pvPerMonth: pvTotal / n, dittoPerMonth: dittoTotal / n, windowCount: months.length };
  }, [avgVolumeRows]);

  const readingUnitLabel = READING_UNITS.find((u) => u.key === profile?.reading_unit)?.label ?? "Minutes";

  const dailyTotals = useMemo(() => sumStageTotals(dailyRows), [dailyRows]);

  // Two clear stat tiles (Questions + Launches, last week vs. the week
  // before) instead of one auto-written sentence - the sentence version
  // read as a wall of text that was more work to parse than the numbers
  // it was summarizing.
  const digestStats = useMemo(() => {
    const lastWeek = weeklyRows.find((r) => r.period_start === weekStarts[WEEK_TREND_COUNT - 1]);
    if (!lastWeek) return null;
    const weekBefore = weeklyRows.find((r) => r.period_start === weekStarts[WEEK_TREND_COUNT - 2]);
    const keys: PipelineStageKey[] = ["questions", "launches"];
    return keys.map((key) => {
      const value = lastWeek[key];
      const delta = value - (weekBefore?.[key] ?? 0);
      return { key, label: stageLabel(key), value, delta };
    });
  }, [weeklyRows, weekStarts]);

  const paceProjection = useMemo(() => {
    const now = new Date();
    const daysElapsed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const factor = daysInMonth / daysElapsed;
    const keys: PipelineStageKey[] = ["questions", "yeses", "qi1", "launches"];
    return keys.map((key) => ({
      key,
      label: stageLabel(key),
      soFar: monthlyRow?.[key] ?? 0,
      projected: Math.round((monthlyRow?.[key] ?? 0) * factor),
    }));
  }, [monthlyRow]);

  const correlationWeeks = useMemo(() => {
    const coreRunCounts: Record<string, number> = {};
    for (const ws of weekStarts) coreRunCounts[ws] = 0;
    for (const d of streakDays) {
      if (!(d.read && d.listen && d.daily_update && d.story_share)) continue;
      const bucket = getWeekStart(new Date(`${d.day}T00:00:00`));
      if (bucket in coreRunCounts) coreRunCounts[bucket] += 1;
    }
    const weeklyByStart = new Map(weeklyRows.map((r) => [r.period_start, r]));
    return weekStarts.map((ws) => ({
      weekStart: ws,
      coreRuns: coreRunCounts[ws],
      value: weeklyByStart.get(ws)?.[correlationStage] ?? 0,
    }));
  }, [streakDays, weeklyRows, weekStarts, correlationStage]);

  const correlationSummary = useMemo(() => {
    const high = correlationWeeks.filter((w) => w.coreRuns >= HIGH_CORE_RUN_THRESHOLD);
    const low = correlationWeeks.filter((w) => w.coreRuns < HIGH_CORE_RUN_THRESHOLD);
    if (high.length === 0 || low.length === 0) return null;
    const avg = (arr: typeof correlationWeeks) => arr.reduce((s, w) => s + w.value, 0) / arr.length;
    return { highAvg: avg(high), lowAvg: avg(low) };
  }, [correlationWeeks]);

  const downlineChartData = useMemo(
    () =>
      weekStarts.map((ws) => ({
        label: formatShortDateLabel(ws),
        value: downlineWeekly[ws]?.[trendStage] ?? 0,
      })),
    [weekStarts, downlineWeekly, trendStage]
  );

  function startEditingPins() {
    setPinDraft(profile?.pinned_kpis ?? ["questions", "yeses", "qi1", "launches"]);
    setEditingPins(true);
  }

  function togglePin(key: PipelineStageKey) {
    setPinDraft((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_PINNED_KPIS) return prev;
      return [...prev, key];
    });
  }

  async function savePins() {
    if (pinDraft.length === 0) return;
    setSavingPins(true);
    const { error } = await supabase.from("profiles").update({ pinned_kpis: pinDraft }).eq("id", user.id);
    setSavingPins(false);
    if (!error) {
      setProfile((prev) => (prev ? { ...prev, pinned_kpis: pinDraft } : prev));
      setEditingPins(false);
    }
  }

  const pinnedKpis = profile?.pinned_kpis ?? ["questions", "yeses", "qi1", "launches"];

  return (
    <>
      <PageHeader title="Insights" subtitle="Your numbers, trends, and what they mean" />
      <main className="page-main">
        {hasDownline && (
          <div className="card space-y-1.5">
            <p className="section-title">Viewing</p>
            <SearchablePicker
              value={viewingId}
              onChange={setViewingId}
              placeholder="Me (and household)"
              searchPlaceholder="Search your downline…"
              options={[
                { value: "", label: "Me (and household)" },
                ...downlineMembers.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
          </div>
        )}

        {loading ? (
          <SkeletonList cards={4} />
        ) : (
          <>
            <div className="card space-y-2">
              <div className="flex items-center justify-between">
                <p className="section-title">{viewingSelf ? "Your KPIs" : `${viewingName}'s KPIs`}</p>
                {viewingSelf && (
                  <button className="chip-btn" onClick={editingPins ? savePins : startEditingPins} disabled={savingPins}>
                    {editingPins ? (savingPins ? "Saving…" : "Save") : "Customize"}
                  </button>
                )}
              </div>
              {editingPins ? (
                <div className="flex flex-wrap gap-1.5">
                  {PIPELINE_STAGES.map((stage) => (
                    <button
                      key={stage.key}
                      onClick={() => togglePin(stage.key)}
                      className={pinDraft.includes(stage.key) ? "toggle-pill-active" : "toggle-pill-inactive"}
                    >
                      {stage.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {pinnedKpis.map((key) => (
                    <div key={key} className="rounded-lg bg-navy p-2.5">
                      <p className="text-2xl font-bold text-white">{currentWeekRow?.[key] ?? 0}</p>
                      <p className="text-xs text-slate-400">{stageLabel(key)} this week</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {digestStats && (
              <div className="card space-y-2">
                <p className="section-title">Weekly Digest</p>
                <p className="text-xs text-slate-500">Last week vs. the week before</p>
                <div className="grid grid-cols-2 gap-2">
                  {digestStats.map((s) => (
                    <div key={s.key} className="rounded-lg bg-navy p-2.5">
                      <p className="text-2xl font-bold text-white">{s.value}</p>
                      <p className="text-xs text-slate-400">{s.label}</p>
                      <p
                        className={`text-xs font-medium ${
                          s.delta > 0 ? "text-amber-light" : s.delta < 0 ? "text-red-300" : "text-slate-500"
                        }`}
                      >
                        {deltaArrow(s.delta)} {Math.abs(s.delta)} vs. last week
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card space-y-2">
              <p className="section-title">Pace This Month</p>
              {monthlyRow ? (
                <div className="grid grid-cols-2 gap-2">
                  {paceProjection.map((p) => (
                    <div key={p.key} className="rounded-lg bg-navy p-2.5">
                      <p className="text-lg font-bold text-white">
                        {p.soFar} <span className="text-xs font-normal text-slate-500">so far</span>
                      </p>
                      <p className="text-xs text-amber-light">On pace for ~{p.projected}</p>
                      <p className="text-xs text-slate-500">{p.label}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">No pipeline activity logged yet this month.</p>
              )}
            </div>

            <div className="card space-y-2">
              <p className="section-title">Stage Conversion (last {DAILY_WINDOW_DAYS} days)</p>
              {dailyTotals.questions === 0 ? (
                <p className="empty-state">Log some Questions to see the funnel.</p>
              ) : (
                <div className="space-y-1.5">
                  {PIPELINE_STAGES.map((stage) => {
                    const value = dailyTotals[stage.key];
                    const pct = Math.min(100, (value / dailyTotals.questions) * 100);
                    return (
                      <div key={stage.key} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">{stage.label}</span>
                          <span className="text-slate-500">
                            {value} · {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                          <div className="h-full rounded-full bg-amber" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card space-y-2">
              <div className="flex items-center justify-between">
                <p className="section-title">Core Run vs. {stageLabel(correlationStage)}</p>
                <select
                  className="input !w-auto !py-1 text-xs"
                  value={correlationStage}
                  onChange={(e) => setCorrelationStage(e.target.value as PipelineStageKey)}
                >
                  {PIPELINE_STAGES.map((stage) => (
                    <option key={stage.key} value={stage.key}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </div>
              {correlationSummary ? (
                <p className="text-sm text-slate-300">
                  On weeks with {HIGH_CORE_RUN_THRESHOLD}+ Core Runs, {viewingSelf ? "you" : viewingName} averaged{" "}
                  <span className="text-amber-light">{correlationSummary.highAvg.toFixed(1)}</span>{" "}
                  {stageLabel(correlationStage).toLowerCase()} — vs {correlationSummary.lowAvg.toFixed(1)} on weeks
                  below that.
                </p>
              ) : (
                <p className="text-sm text-slate-400">
                  Keep logging both to see how they connect — needs weeks on both sides of {HIGH_CORE_RUN_THRESHOLD}{" "}
                  Core Runs to compare.
                </p>
              )}
              <div className="space-y-1">
                {correlationWeeks.map((w) => (
                  <div key={w.weekStart} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{formatShortDateLabel(w.weekStart)}</span>
                    <span className="text-slate-300">
                      {w.coreRuns}/7 Core Runs · {w.value} {stageLabel(correlationStage).toLowerCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {hasDownline && (
              <div className="card space-y-2">
                <div className="flex items-center justify-between">
                  <p className="section-title">Downline Trend</p>
                  <select
                    className="input !w-auto !py-1 text-xs"
                    value={trendStage}
                    onChange={(e) => setTrendStage(e.target.value as PipelineStageKey)}
                  >
                    {PIPELINE_STAGES.map((stage) => (
                      <option key={stage.key} value={stage.key}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                </div>
                <TrendChart data={downlineChartData} />
              </div>
            )}

            <div className="card space-y-2">
              <p className="section-title">{viewingSelf ? "Your Averages" : `${viewingName}'s Averages`}</p>
              <p className="text-xs text-slate-400">
                Rolling-window pacing — Core Run, Pipeline, and Volume averages side by side with
                company-wide Team Leaders for each. None of these count the current, still-in-progress
                day/week/month — only completed ones, since a period that isn&apos;t over yet isn&apos;t a
                fair comparison to a finished one.
              </p>
              {leadersError && <p className="text-xs text-red-400">{leadersError}</p>}
              <div className="space-y-1 rounded-lg bg-navy px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-200">🎧 Audios per day</span>
                  <span className="text-lg font-bold text-amber">
                    {coreRunAverages.audiosPerDay.toFixed(1)}
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
                    {coreRunAverages.readAmountPerDay.toFixed(1)}
                  </span>
                </div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  🏆 Team Leaders
                </p>
                <AverageLeaders leaders={streakLeaders} metric="read_amount" />
              </div>

              <div className="no-scrollbar overflow-x-auto pt-1">
                <table className="w-full min-w-[380px] text-left text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="pb-1.5 pr-2 font-medium"></th>
                      <th className="pb-1.5 pr-2 text-right font-medium">
                        Daily ({dailyAverages.windowCount}d)
                      </th>
                      <th className="pb-1.5 pr-2 text-right font-medium">
                        Weekly ({weeklyAverages.windowCount}w)
                      </th>
                      <th className="pb-1.5 text-right font-medium">
                        Monthly ({monthlyAverages.windowCount}mo)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {AVERAGE_METRICS.map((metric) => (
                      <tr key={metric.key} className="border-t border-white/5">
                        <td className="py-1.5 pr-2 font-medium text-white">{metric.label}</td>
                        <td className="py-1.5 pr-2 text-right font-bold text-amber">
                          {dailyAverages[metric.key].toFixed(1)}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-bold text-amber">
                          {weeklyAverages[metric.key].toFixed(1)}
                        </td>
                        <td className="py-1.5 text-right font-bold text-amber">
                          {monthlyAverages[metric.key].toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 rounded-lg bg-navy px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  🏆 Team Leaders (Monthly)
                </p>
                {AVERAGE_METRICS.map((metric) => (
                  <div key={metric.key}>
                    <p className="text-xs font-medium text-slate-300">{metric.label}</p>
                    <AverageLeaders leaders={pipelineLeaders} metric={metric.key} />
                  </div>
                ))}
              </div>

              <div className="space-y-1 rounded-lg bg-navy px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-200">🚀 PV per month</span>
                  <span className="text-lg font-bold text-amber">
                    {volumeAverages.pvPerMonth.toFixed(1)}
                  </span>
                </div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  🏆 Team Leaders
                </p>
                <AverageLeaders leaders={volumeLeaders} metric="pv" />
              </div>
              <div className="space-y-1 rounded-lg bg-navy px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-200">💧 Ditto per month</span>
                  <span className="text-lg font-bold text-amber">
                    {volumeAverages.dittoPerMonth.toFixed(1)}
                  </span>
                </div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  🏆 Team Leaders
                </p>
                <AverageLeaders leaders={volumeLeaders} metric="ditto" />
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
