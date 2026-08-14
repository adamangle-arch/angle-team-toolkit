"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import SearchablePicker from "@/components/SearchablePicker";
import AverageLeaders from "@/components/AverageLeaders";
import PercentileNote from "@/components/PercentileNote";
import { SkeletonList } from "@/components/Skeleton";
import TrendChart from "@/components/TrendChart";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { PIPELINE_STAGES, READING_UNITS, type PipelineStageKey } from "@/lib/constants";
import {
  getDateOffset,
  getWeekStartOffset,
  getMonthStart,
  getMonthStartOffset,
  formatShortDateLabel,
  formatDateLabel,
} from "@/lib/dates";
import { periodStartFor, averagesForPeriods, AVERAGES_WINDOW, AVERAGE_METRICS } from "@/lib/periodAverages";
import type {
  PipelinePeriod,
  Profile,
  StreakDay,
  MonthlyPv,
  AverageLeaderEntry,
  AveragePercentileEntry,
} from "@/lib/types";

const DAILY_WINDOW_DAYS = 90;
const WEEK_TREND_COUNT = 8;
const MAX_PINNED_KPIS = 4;
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

type DownlineMember = { id: string; name: string };

function stageLabel(key: PipelineStageKey): string {
  return PIPELINE_STAGES.find((s) => s.key === key)?.label ?? key;
}

// Same as Pipeline Tracker's own pct() - shared shape, not shared code,
// since this file has no lib module of its own to put it in.
function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
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
  const [monthlyGoals, setMonthlyGoals] = useState<{ metric: string; target: number }[]>([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [downlineMembers, setDownlineMembers] = useState<DownlineMember[]>([]);
  const [downlineWeekly, setDownlineWeekly] = useState<Record<string, DownlineTotals>>({});
  const [trendStage, setTrendStage] = useState<PipelineStageKey>("launches");
  const [editingPins, setEditingPins] = useState(false);
  const [pinDraft, setPinDraft] = useState<PipelineStageKey[]>([]);
  const [savingPins, setSavingPins] = useState(false);
  // Ported Conversion/Trend pickers (see the cards further down) - kept
  // independent of trendStage above, which drives Downline Trend, so
  // picking a stage for one doesn't also flip the other.
  const [personalTrendStage, setPersonalTrendStage] = useState<PipelineStageKey>("questions");
  const [ratioFromKey, setRatioFromKey] = useState<PipelineStageKey>("questions");
  const [ratioToKey, setRatioToKey] = useState<PipelineStageKey>("launches");

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
  // Where the currently-viewed person's own averages fall against the
  // whole team, one per get_*_average_percentile RPC (supabase/schema.sql) -
  // same three-metric-group split as the leaders lists above.
  const [dailyPercentiles, setDailyPercentiles] = useState<AveragePercentileEntry[]>([]);
  const [weeklyPercentiles, setWeeklyPercentiles] = useState<AveragePercentileEntry[]>([]);
  const [monthlyPercentiles, setMonthlyPercentiles] = useState<AveragePercentileEntry[]>([]);
  const [streakPercentiles, setStreakPercentiles] = useState<AveragePercentileEntry[]>([]);
  const [volumePercentiles, setVolumePercentiles] = useState<AveragePercentileEntry[]>([]);

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

  // Everything scoped to whichever person is currently selected lives in
  // this one effect/Promise.all, gated by the same `loading` flag that
  // hides the whole page below it - the averages/volume queries used to
  // be their own separate effects, each on its own async clock, which
  // meant switching the Viewing picker could flip `loading` back to
  // false (this fetch resolving first) while a slower averages fetch was
  // still mid-flight and its state still held the PREVIOUS person's
  // numbers - "Show Me Your Numbers" and Your Averages would briefly
  // show someone else's real activity captioned with the new person's
  // name. Merging them into one Promise.all means every number on the
  // page is guaranteed to belong to the same target by the time `loading`
  // ever goes false again.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // Today is never counted in coreRunAverages below, so this needs to
      // reach one day further back to still cover CORE_RUN_WINDOW
      // completed days.
      const streakSince = getDateOffset(CORE_RUN_WINDOW);
      const today = getDateOffset(0);
      // +1 further back than each window size - the current (in-progress)
      // period is never counted (see averagesForPeriods), so this still
      // needs to reach far enough back for a full window of *completed*
      // periods.
      const dailyStart = periodStartFor("daily", AVERAGES_WINDOW.daily);
      const weeklyStart = periodStartFor("weekly", AVERAGES_WINDOW.weekly);
      const monthlyStart = periodStartFor("monthly", AVERAGES_WINDOW.monthly);
      const volumeSince = getMonthStartOffset(VOLUME_WINDOW);
      const thisMonth = getMonthStart();
      const [
        { data: currentWeek },
        { data: daily },
        { data: weekly },
        { data: monthly },
        { data: streakCount },
        { data: streakRows },
        { data: avgDaily },
        { data: avgWeekly },
        { data: avgMonthly },
        { data: volume },
        { data: dailyPct },
        { data: weeklyPct },
        { data: monthlyPct },
        { data: streakPct },
        { data: volumePct },
        { data: goalsData },
      ] = await Promise.all([
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
        supabase.rpc("get_current_streak", { p_user_id: streakTargetId }),
        supabase
          .from("streak_days")
          .select("day,read_amount,listen_count")
          .eq("user_id", streakTargetId)
          .gte("day", streakSince)
          .lt("day", today),
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
        supabase
          .from("monthly_pv")
          .select("*")
          .eq("user_id", pipelineTargetId)
          .gte("period_start", volumeSince)
          .lt("period_start", thisMonth),
        supabase.rpc("get_pipeline_average_percentile", { p_target_id: pipelineTargetId, p_period_type: "daily" }),
        supabase.rpc("get_pipeline_average_percentile", { p_target_id: pipelineTargetId, p_period_type: "weekly" }),
        supabase.rpc("get_pipeline_average_percentile", { p_target_id: pipelineTargetId, p_period_type: "monthly" }),
        supabase.rpc("get_streak_average_percentile", { p_target_id: streakTargetId }),
        supabase.rpc("get_volume_average_percentile", { p_target_id: pipelineTargetId }),
        supabase.from("goals").select("metric,target").eq("user_id", streakTargetId).eq("period", "monthly"),
      ]);
      if (cancelled) return;
      setCurrentWeekRow((currentWeek as PipelinePeriod) ?? null);
      setDailyRows((daily as PipelinePeriod[]) ?? []);
      setWeeklyRows((weekly as PipelinePeriod[]) ?? []);
      setMonthlyRow((monthly as PipelinePeriod) ?? null);
      setCurrentStreak((streakCount as number) ?? 0);
      setAvgStreakRows((streakRows as Pick<StreakDay, "day" | "read_amount" | "listen_count">[]) ?? []);
      setAvgDailyRows((avgDaily as PipelinePeriod[]) ?? []);
      setAvgWeeklyRows((avgWeekly as PipelinePeriod[]) ?? []);
      setAvgMonthlyRows((avgMonthly as PipelinePeriod[]) ?? []);
      setAvgVolumeRows((volume as MonthlyPv[]) ?? []);
      setDailyPercentiles((dailyPct as AveragePercentileEntry[]) ?? []);
      setWeeklyPercentiles((weeklyPct as AveragePercentileEntry[]) ?? []);
      setMonthlyPercentiles((monthlyPct as AveragePercentileEntry[]) ?? []);
      setStreakPercentiles((streakPct as AveragePercentileEntry[]) ?? []);
      setVolumePercentiles((volumePct as AveragePercentileEntry[]) ?? []);
      setMonthlyGoals((goalsData as { metric: string; target: number }[]) ?? []);
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

  // Percent-of-Questions alone (the old version of this card) makes every
  // stage past Yeses look like a flat, indistinguishable near-zero line,
  // since each one is being compared all the way back to the top of a
  // 9-step funnel instead of to whatever actually feeds it - it shows
  // shape but never says WHERE the funnel is actually leaking. Step
  // conversion (this stage over the one right before it) is the number
  // that answers that, so a single "biggest drop-off" step gets called
  // out above the funnel instead of making someone eyeball ten bars for it.
  const stageConversion = useMemo(() => {
    const rows = PIPELINE_STAGES.map((stage, i) => {
      const value = dailyTotals[stage.key];
      const prevStage = i === 0 ? null : PIPELINE_STAGES[i - 1];
      const prevValue = prevStage ? dailyTotals[prevStage.key] : null;
      const stepRate = prevValue && prevValue > 0 ? value / prevValue : null;
      const pctOfQuestions = dailyTotals.questions > 0 ? value / dailyTotals.questions : 0;
      return { key: stage.key, label: stage.label, prevLabel: prevStage?.label ?? null, value, stepRate, pctOfQuestions };
    });
    const withStep = rows.filter((r) => r.stepRate !== null) as ((typeof rows)[number] & { stepRate: number })[];
    const worst =
      withStep.length > 0 ? withStep.reduce((a, b) => (b.stepRate < a.stepRate ? b : a)) : null;
    return { rows, worst };
  }, [dailyTotals]);

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

  // Predictive Pipeline Health - before month-end, not after: whichever
  // Monthly goals (Goals page only supports Yeses/QI1s at that period)
  // are set get compared against this same month-end projection above,
  // instead of only being able to look back once the month's already
  // over. goals.metric uses the plural "qi1s"/"yeses" GoalMetric keys
  // (lib/constants.ts) while pipeline_periods/PIPELINE_STAGES use
  // singular "qi1"/"yeses" - goalMetricToStageKey bridges the two. The
  // bottleneck named is stageConversion.worst (already computed above
  // for the funnel view) - the single step-to-step conversion furthest
  // below 100% over the last 90 days, i.e. this person's own weakest
  // link, not a generic "work harder" nudge.
  const pipelineHealth = useMemo(() => {
    const goalMetricToStageKey: Record<string, PipelineStageKey> = { yeses: "yeses", qi1s: "qi1" };
    const flags = monthlyGoals
      .map((g) => {
        const stageKey = goalMetricToStageKey[g.metric];
        if (!stageKey || g.target <= 0) return null;
        const projection = paceProjection.find((p) => p.key === stageKey);
        if (!projection) return null;
        return {
          metric: g.metric,
          label: stageLabel(stageKey),
          target: g.target,
          projected: projection.projected,
          soFar: projection.soFar,
          offPace: projection.projected < g.target,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    return { flags, hasGoals: flags.length > 0, anyOffPace: flags.some((f) => f.offPace) };
  }, [monthlyGoals, paceProjection]);

  // Ported from Pipeline Tracker's own Conversion/Trend/Your Averages
  // cards (same underlying data this page already loads - no new
  // fetches) - Pipeline keeps its own copies of all three untouched,
  // this is a duplicate view for whoever's on Insights and wants them
  // without switching pages.
  const weeklyByStart = useMemo(() => new Map(weeklyRows.map((r) => [r.period_start, r])), [weeklyRows]);

  const personalChartData = useMemo(
    () =>
      weekStarts.map((ws) => ({
        label: formatShortDateLabel(ws),
        value: weeklyByStart.get(ws)?.[personalTrendStage] ?? 0,
      })),
    [weekStarts, weeklyByStart, personalTrendStage]
  );

  const ratioFromLabel = stageLabel(ratioFromKey);
  const ratioToLabel = stageLabel(ratioToKey);
  const ratioFromValue = currentWeekRow?.[ratioFromKey] ?? 0;
  const ratioToValue = currentWeekRow?.[ratioToKey] ?? 0;

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

  // "Show me your numbers" - a plain-text digest of everything on this
  // page, formatted to paste straight into a text thread with an upline
  // rather than screenshot the app. Pulls from state/memos this page
  // already computes for its own cards - nothing fetched twice.
  const [copiedSummary, setCopiedSummary] = useState(false);

  const summaryText = useMemo(() => {
    const name = viewingSelf
      ? [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "My"
      : `${viewingName}'s`;
    const lines: string[] = [];
    lines.push(`📊 ${name} Numbers — ${formatDateLabel(getDateOffset(0))}`);
    lines.push("");
    lines.push(`🔥 Core Run Streak: ${currentStreak} day${currentStreak === 1 ? "" : "s"}`);
    lines.push("");

    lines.push("PIPELINE");
    if (currentWeekRow) {
      lines.push(
        "This week — " +
          PIPELINE_STAGES.map((s) => `${s.label}: ${currentWeekRow[s.key] ?? 0}`).join(", ")
      );
    } else {
      lines.push("This week — nothing logged yet.");
    }
    if (monthlyRow) {
      lines.push(
        "This month — " +
          PIPELINE_STAGES.map((s) => `${s.label}: ${monthlyRow[s.key] ?? 0}`).join(", ")
      );
    } else {
      lines.push("This month — nothing logged yet.");
    }
    if (monthlyRow) {
      lines.push(
        "On pace for " + paceProjection.map((p) => `~${p.projected} ${p.label}`).join(", ") + " by month end"
      );
    }
    lines.push("");

    lines.push(`CONVERSION (last ${DAILY_WINDOW_DAYS} days)`);
    if (dailyTotals.questions === 0) {
      lines.push("No pipeline activity logged in this window yet.");
    } else {
      for (const r of stageConversion.rows) {
        if (r.stepRate === null) continue;
        const flag = stageConversion.worst?.key === r.key ? "  ← biggest drop-off" : "";
        lines.push(`${r.prevLabel} → ${r.label}: ${Math.round(r.stepRate * 100)}%${flag}`);
      }
    }
    lines.push("");

    lines.push("HABITS (rolling averages)");
    lines.push(
      `Daily (${dailyAverages.windowCount}d): ` +
        AVERAGE_METRICS.map((m) => `${dailyAverages[m.key].toFixed(1)} ${m.label}/day`).join(", ")
    );
    lines.push(
      `Weekly (${weeklyAverages.windowCount}wk): ` +
        AVERAGE_METRICS.map((m) => `${weeklyAverages[m.key].toFixed(1)} ${m.label}/wk`).join(", ")
    );
    lines.push(
      `Monthly (${monthlyAverages.windowCount}mo): ` +
        AVERAGE_METRICS.map((m) => `${monthlyAverages[m.key].toFixed(1)} ${m.label}/mo`).join(", ")
    );
    lines.push(
      `🎧 ${coreRunAverages.audiosPerDay.toFixed(1)} audios/day · 📖 ${coreRunAverages.readAmountPerDay.toFixed(1)} ${readingUnitLabel.toLowerCase()}/day`
    );

    return lines.join("\n");
  }, [
    viewingSelf,
    viewingName,
    profile,
    currentStreak,
    currentWeekRow,
    monthlyRow,
    paceProjection,
    dailyTotals,
    stageConversion,
    dailyAverages,
    weeklyAverages,
    monthlyAverages,
    coreRunAverages,
    readingUnitLabel,
  ]);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) -
      // silently no-op rather than surfacing an error for a nice-to-have.
    }
  }

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
            {pipelineHealth.hasGoals && (
              <div
                className={`card space-y-1.5 ${
                  pipelineHealth.anyOffPace ? "border border-red-400/40 bg-red-500/5" : ""
                }`}
              >
                <p className="section-title">
                  {pipelineHealth.anyOffPace ? "⚠️ Off Pace for Month-End" : "✅ On Pace for Month-End"}
                </p>
                {pipelineHealth.flags.map((f) => (
                  <p key={f.metric} className="text-sm text-slate-200">
                    {f.offPace ? "⚠️" : "✅"} Monthly {f.label}: projected{" "}
                    <span className="font-bold text-amber">{f.projected}</span> of a{" "}
                    <span className="font-bold text-white">{f.target}</span> target ({f.soFar} so far)
                  </p>
                ))}
                {pipelineHealth.anyOffPace && stageConversion.worst && (
                  <p className="text-xs text-slate-400">
                    Biggest drop-off over the last 90 days: {stageConversion.worst.prevLabel} →{" "}
                    {stageConversion.worst.label} ({(stageConversion.worst.stepRate * 100).toFixed(0)}%) —
                    that&apos;s the step most worth focusing on to catch up.
                  </p>
                )}
              </div>
            )}

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

            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="section-title">📋 Show Me Your Numbers</p>
                <button className="chip-btn shrink-0" onClick={copySummary}>
                  {copiedSummary ? "Copied!" : "Copy Summary"}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                A copy-paste text summary of everything on this page - pipeline, conversion, Core Run streak,
                and habits - ready to send to your upline.
              </p>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-navy p-2.5 text-[11px] leading-relaxed text-slate-300">
                {summaryText}
              </pre>
            </div>

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

            {/* Ported from Pipeline Tracker (still there too, untouched) -
                Conversion and Trend, in place of this page's own Stage
                Conversion / Core Run correlation cards. The third ported
                card, Your Averages, was dropped again right after - this
                page already had its own richer "Your Averages" card
                further down (Team Leaders, Core Run, Volume, all in one),
                and the plain ported version duplicated its daily/weekly/
                monthly table exactly. */}
            <div className="card space-y-2">
              <p className="section-title">Conversion (this week)</p>
              <div className="flex items-center gap-2">
                <select
                  className="select flex-1"
                  value={ratioFromKey}
                  onChange={(e) => setRatioFromKey(e.target.value as PipelineStageKey)}
                  aria-label="From stage"
                >
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span className="shrink-0 text-slate-500">→</span>
                <select
                  className="select flex-1"
                  value={ratioToKey}
                  onChange={(e) => setRatioToKey(e.target.value as PipelineStageKey)}
                  aria-label="To stage"
                >
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {ratioFromLabel} → {ratioToLabel}
                </p>
                <p className="text-3xl font-bold text-amber">{pct(ratioToValue, ratioFromValue)}</p>
              </div>
            </div>

            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="section-title">Trend</p>
                <select
                  className="select"
                  value={personalTrendStage}
                  onChange={(e) => setPersonalTrendStage(e.target.value as PipelineStageKey)}
                >
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <TrendChart data={personalChartData} />
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
                <PercentileNote entry={streakPercentiles.find((p) => p.metric === "audios")} />
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
                <PercentileNote entry={streakPercentiles.find((p) => p.metric === "read_amount")} />
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
                          <PercentileNote entry={dailyPercentiles.find((p) => p.metric === metric.key)} />
                        </td>
                        <td className="py-1.5 pr-2 text-right font-bold text-amber">
                          {weeklyAverages[metric.key].toFixed(1)}
                          <PercentileNote entry={weeklyPercentiles.find((p) => p.metric === metric.key)} />
                        </td>
                        <td className="py-1.5 text-right font-bold text-amber">
                          {monthlyAverages[metric.key].toFixed(1)}
                          <PercentileNote entry={monthlyPercentiles.find((p) => p.metric === metric.key)} />
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
                <PercentileNote entry={volumePercentiles.find((p) => p.metric === "pv")} />
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
                <PercentileNote entry={volumePercentiles.find((p) => p.metric === "ditto")} />
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
