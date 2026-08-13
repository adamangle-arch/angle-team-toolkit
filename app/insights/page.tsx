"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import { SkeletonList } from "@/components/Skeleton";
import TrendChart from "@/components/TrendChart";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { PIPELINE_STAGES, type PipelineStageKey } from "@/lib/constants";
import { getDateOffset, getWeekStart, getWeekStartOffset, getMonthStartOffset, formatShortDateLabel } from "@/lib/dates";
import type { PipelinePeriod, Profile } from "@/lib/types";

const DAILY_WINDOW_DAYS = 90;
const WEEK_TREND_COUNT = 8;
const MAX_PINNED_KPIS = 4;
// Out of a possible 7 - the threshold used to split "high Core Run" weeks
// from "low" ones in the correlation view below.
const HIGH_CORE_RUN_THRESHOLD = 4;

type StreakDayRow = {
  day: string;
  read: boolean;
  listen: boolean;
  daily_update: boolean;
  story_share: boolean;
};

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

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// One auto-written sentence comparing the last two fully-completed weeks -
// deliberately skips the current in-progress week (see weekStarts below),
// since a partial week would always look artificially low next to a
// finished one.
function buildDigest(lastWeek: PipelinePeriod | undefined, weekBefore: PipelinePeriod | undefined): string | null {
  if (!lastWeek) return null;
  const prevQuestions = weekBefore?.questions ?? 0;
  const prevLaunches = weekBefore?.launches ?? 0;
  const qDelta = lastWeek.questions - prevQuestions;
  const lDelta = lastWeek.launches - prevLaunches;
  const qWord = qDelta > 0 ? "up" : qDelta < 0 ? "down" : "flat vs.";
  const lWord = lDelta > 0 ? "up" : lDelta < 0 ? "down" : "flat vs.";
  return `Last week you logged ${pluralize(lastWeek.questions, "question")} (${qWord} ${Math.abs(qDelta)} from the week before) and ${pluralize(lastWeek.launches, "launch")} (${lWord} ${Math.abs(lDelta)}).`;
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
  const [hasDownline, setHasDownline] = useState(false);
  const [downlineWeekly, setDownlineWeekly] = useState<Record<string, DownlineTotals>>({});
  const [trendStage, setTrendStage] = useState<PipelineStageKey>("launches");
  const [editingPins, setEditingPins] = useState(false);
  const [pinDraft, setPinDraft] = useState<PipelineStageKey[]>([]);
  const [savingPins, setSavingPins] = useState(false);

  // Oldest to newest, excludes the current in-progress week (offset 0) -
  // same "don't count an unfinished period" principle lib/periodAverages.ts
  // already uses for the Tally/Goals averages.
  const weekStarts = useMemo(
    () => Array.from({ length: WEEK_TREND_COUNT }, (_, i) => getWeekStartOffset(WEEK_TREND_COUNT - i)),
    []
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [
        { data: profileRow },
        { data: currentWeek },
        { data: daily },
        { data: weekly },
        { data: monthly },
        { data: streak },
        { data: downlineIds },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "weekly")
          .eq("period_start", getWeekStartOffset(0))
          .maybeSingle(),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "daily")
          .gte("period_start", getDateOffset(DAILY_WINDOW_DAYS - 1)),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "weekly")
          .in("period_start", weekStarts),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "monthly")
          .eq("period_start", getMonthStartOffset(0))
          .maybeSingle(),
        supabase
          .from("streak_days")
          .select("day,read,listen,daily_update,story_share")
          .eq("user_id", user.id)
          .gte("day", weekStarts[0]),
        supabase.rpc("get_downline_user_ids", { p_user_id: user.id }),
      ]);
      if (cancelled) return;
      setProfile((profileRow as Profile) ?? null);
      setCurrentWeekRow((currentWeek as PipelinePeriod) ?? null);
      setDailyRows((daily as PipelinePeriod[]) ?? []);
      setWeeklyRows((weekly as PipelinePeriod[]) ?? []);
      setMonthlyRow((monthly as PipelinePeriod) ?? null);
      setStreakDays((streak as StreakDayRow[]) ?? []);
      setHasDownline(((downlineIds as { user_id: string }[]) ?? []).length > 0);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, ownerId]);

  // Separate from the load above - get_downline_pipeline_totals has no
  // range variant, so this is WEEK_TREND_COUNT of its own round trips.
  // No reason to block the rest of the page (which is all one query each)
  // on that, so it loads independently and fills in once it's back.
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

  const dailyTotals = useMemo(() => sumStageTotals(dailyRows), [dailyRows]);

  const digest = useMemo(() => {
    const lastWeek = weeklyRows.find((r) => r.period_start === weekStarts[WEEK_TREND_COUNT - 1]);
    const weekBefore = weeklyRows.find((r) => r.period_start === weekStarts[WEEK_TREND_COUNT - 2]);
    return buildDigest(lastWeek, weekBefore);
  }, [weeklyRows, weekStarts]);

  const paceProjection = useMemo(() => {
    const now = new Date();
    const daysElapsed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const factor = daysInMonth / daysElapsed;
    const keys: PipelineStageKey[] = ["questions", "yeses", "qi1", "launches"];
    return keys.map((key) => ({
      key,
      label: PIPELINE_STAGES.find((s) => s.key === key)!.label,
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
      launches: weeklyByStart.get(ws)?.launches ?? 0,
    }));
  }, [streakDays, weeklyRows, weekStarts]);

  const correlationSummary = useMemo(() => {
    const high = correlationWeeks.filter((w) => w.coreRuns >= HIGH_CORE_RUN_THRESHOLD);
    const low = correlationWeeks.filter((w) => w.coreRuns < HIGH_CORE_RUN_THRESHOLD);
    if (high.length === 0 || low.length === 0) return null;
    const avg = (arr: typeof correlationWeeks) => arr.reduce((s, w) => s + w.launches, 0) / arr.length;
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
        {loading ? (
          <SkeletonList cards={4} />
        ) : (
          <>
            <div className="card space-y-2">
              <div className="flex items-center justify-between">
                <p className="section-title">Your KPIs</p>
                <button className="chip-btn" onClick={editingPins ? savePins : startEditingPins} disabled={savingPins}>
                  {editingPins ? (savingPins ? "Saving…" : "Save") : "Customize"}
                </button>
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
                      <p className="text-xs text-slate-400">
                        {PIPELINE_STAGES.find((s) => s.key === key)?.label} this week
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {digest && (
              <div className="card space-y-1">
                <p className="section-title">Weekly Digest</p>
                <p className="text-sm text-slate-300">{digest}</p>
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
                <p className="empty-state">Log some Questions to see your funnel.</p>
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
              <p className="section-title">Core Run vs. Launches</p>
              {correlationSummary ? (
                <p className="text-sm text-slate-300">
                  On weeks you completed {HIGH_CORE_RUN_THRESHOLD}+ Core Runs, you averaged{" "}
                  <span className="text-amber-light">{correlationSummary.highAvg.toFixed(1)}</span> launches — vs{" "}
                  {correlationSummary.lowAvg.toFixed(1)} on weeks below that.
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
                      {w.coreRuns}/7 Core Runs · {w.launches} launch{w.launches === 1 ? "" : "es"}
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
          </>
        )}
      </main>
    </>
  );
}
