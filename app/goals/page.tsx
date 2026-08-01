"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import { SkeletonList } from "@/components/Skeleton";
import { supabase } from "@/lib/supabaseClient";
import { getWeekStart, getMonthStart, getDateOffset, getMonthStartOffset } from "@/lib/dates";
import {
  GOAL_ITEMS_BY_PERIOD,
  GOAL_PERIODS,
  type GoalMetric,
  type GoalPeriod,
} from "@/lib/constants";
import { periodStartFor, averagesForPeriods, AVERAGES_WINDOW, AVERAGE_METRICS } from "@/lib/periodAverages";
import type { Goal, PipelinePeriod, Profile, StreakDay, MonthlyPv } from "@/lib/types";

// Same leading-number parse as app/streak/page.tsx's read_amount average -
// duplicated rather than imported since it's a tiny, self-contained piece
// of text parsing, not shared business logic like the period-averaging
// fairness rules above.
function leadingNumber(text: string): number {
  const match = text.trim().match(/^(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

const CORE_RUN_WINDOW = 30;
const VOLUME_WINDOW = 6;

function inputKey(metric: GoalMetric, period: GoalPeriod): string {
  return `${metric}:${period}`;
}

type DreamField = "dream_5_year" | "dream_10_year" | "dream_lifetime";

const DREAM_FIELDS: { key: DreamField; label: string; placeholder: string }[] = [
  {
    key: "dream_5_year",
    label: "5 Year Dream",
    placeholder: "Where do you want to be in 5 years? Write whatever comes to mind…",
  },
  {
    key: "dream_10_year",
    label: "10 Year Dream",
    placeholder: "What does 10 years from now look like?",
  },
  {
    key: "dream_lifetime",
    label: "Lifetime Dream",
    placeholder: "The big one — what are you ultimately building toward?",
  },
];

// A plain, unbounded textarea rather than the numeric goal inputs above -
// these are meant to be written freely, not filled into a form. Local
// edit buffer + save-on-blur mirrors the same pattern used for candidate
// notes elsewhere in the app (Pipeline Tracker), so typing doesn't fire a
// save on every keystroke.
function DreamTextarea({
  label,
  placeholder,
  value,
  onSave,
}: {
  label: string;
  placeholder: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  // Adjust local state in response to the loaded value arriving after
  // this mounts (profile fetch resolves after initial render) - done
  // during render per React's "adjusting state" pattern rather than an
  // effect, so it can't fire after the rep has already started typing.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(value);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-slate-200">{label}</p>
      <textarea
        className="textarea"
        rows={4}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== value) onSave(text);
        }}
      />
    </div>
  );
}

export default function GoalsPage() {
  const { user, ownerId } = useAuth();
  const [goalRows, setGoalRows] = useState<Goal[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [qi1Weekly, setQi1Weekly] = useState(0);
  const [qi1Monthly, setQi1Monthly] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dreams, setDreams] = useState<Record<DreamField, string>>({
    dream_5_year: "",
    dream_10_year: "",
    dream_lifetime: "",
  });

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("goals").select("*").eq("user_id", user.id);
      const rows = (data as Goal[]) ?? [];
      setGoalRows(rows);
      const map: Record<string, string> = {};
      for (const g of rows) map[inputKey(g.metric, g.period)] = g.target > 0 ? String(g.target) : "";
      setInputs(map);
      setLoading(false);
    }
    load();
  }, [user.id]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("dream_5_year,dream_10_year,dream_lifetime")
        .eq("id", user.id)
        .single();
      if (data) {
        const d = data as Pick<Profile, "dream_5_year" | "dream_10_year" | "dream_lifetime">;
        setDreams({
          dream_5_year: d.dream_5_year ?? "",
          dream_10_year: d.dream_10_year ?? "",
          dream_lifetime: d.dream_lifetime ?? "",
        });
      }
    }
    load();
  }, [user.id]);

  async function saveDream(field: DreamField, value: string) {
    setDreams((prev) => ({ ...prev, [field]: value }));
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    if (error) {
      setSaveError(`Couldn't save that: ${error.message}`);
    } else {
      setSaveError(null);
    }
  }

  // QI1s already has a real, reliable per-period number (the same one
  // the Pipeline Tracker counters write to), unlike the other goal
  // metrics - so it's safe to show the actual count here without
  // reintroducing the confusing actual-vs-target display that was
  // dropped for everything else.
  useEffect(() => {
    async function load() {
      const [{ data: w }, { data: m }] = await Promise.all([
        supabase
          .from("pipeline_periods")
          .select("qi1")
          .eq("user_id", ownerId)
          .eq("period_type", "weekly")
          .eq("period_start", getWeekStart())
          .maybeSingle(),
        supabase
          .from("pipeline_periods")
          .select("qi1")
          .eq("user_id", ownerId)
          .eq("period_type", "monthly")
          .eq("period_start", getMonthStart())
          .maybeSingle(),
      ]);
      setQi1Weekly((w as Pick<PipelinePeriod, "qi1"> | null)?.qi1 ?? 0);
      setQi1Monthly((m as Pick<PipelinePeriod, "qi1"> | null)?.qi1 ?? 0);
    }
    load();
  }, [ownerId]);

  // Same three average sources already shown on their own pages (Core
  // Run, Pipeline Tracker, Volume) - repeated here so goals and "am I
  // actually on pace" live on one screen together, without replacing
  // where they already are.
  const [streakAvgRows, setStreakAvgRows] = useState<
    Pick<StreakDay, "day" | "read_amount" | "listen_count">[]
  >([]);
  const [dailyPipelineRows, setDailyPipelineRows] = useState<PipelinePeriod[]>([]);
  const [weeklyPipelineRows, setWeeklyPipelineRows] = useState<PipelinePeriod[]>([]);
  const [monthlyPipelineRows, setMonthlyPipelineRows] = useState<PipelinePeriod[]>([]);
  const [volumeRows, setVolumeRows] = useState<MonthlyPv[]>([]);

  useEffect(() => {
    async function load() {
      const since = getDateOffset(CORE_RUN_WINDOW - 1);
      const { data } = await supabase
        .from("streak_days")
        .select("day,read_amount,listen_count")
        .eq("user_id", user.id)
        .gte("day", since);
      setStreakAvgRows((data as Pick<StreakDay, "day" | "read_amount" | "listen_count">[]) ?? []);
    }
    load();
  }, [user.id]);

  useEffect(() => {
    async function load() {
      const dailyStart = periodStartFor("daily", AVERAGES_WINDOW.daily - 1);
      const weeklyStart = periodStartFor("weekly", AVERAGES_WINDOW.weekly - 1);
      const monthlyStart = periodStartFor("monthly", AVERAGES_WINDOW.monthly - 1);
      const [{ data: d }, { data: w }, { data: m }] = await Promise.all([
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "daily")
          .gte("period_start", dailyStart),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "weekly")
          .gte("period_start", weeklyStart),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "monthly")
          .gte("period_start", monthlyStart),
      ]);
      setDailyPipelineRows((d as PipelinePeriod[]) ?? []);
      setWeeklyPipelineRows((w as PipelinePeriod[]) ?? []);
      setMonthlyPipelineRows((m as PipelinePeriod[]) ?? []);
    }
    load();
  }, [ownerId]);

  useEffect(() => {
    async function load() {
      const since = getMonthStartOffset(VOLUME_WINDOW - 1);
      const { data } = await supabase
        .from("monthly_pv")
        .select("*")
        .eq("user_id", ownerId)
        .gte("period_start", since);
      setVolumeRows((data as MonthlyPv[]) ?? []);
    }
    load();
  }, [ownerId]);

  const coreRunAverages = useMemo(() => {
    const byDay = new Map(streakAvgRows.map((r) => [r.day, r]));
    const firstDay = streakAvgRows.map((r) => r.day).sort()[0] ?? getDateOffset(0);
    const days = Array.from({ length: CORE_RUN_WINDOW }, (_, i) =>
      getDateOffset(CORE_RUN_WINDOW - 1 - i)
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
  }, [streakAvgRows]);

  const dailyAverages = useMemo(
    () => averagesForPeriods("daily", dailyPipelineRows, AVERAGES_WINDOW.daily),
    [dailyPipelineRows]
  );
  const weeklyAverages = useMemo(
    () => averagesForPeriods("weekly", weeklyPipelineRows, AVERAGES_WINDOW.weekly),
    [weeklyPipelineRows]
  );
  const monthlyAverages = useMemo(
    () => averagesForPeriods("monthly", monthlyPipelineRows, AVERAGES_WINDOW.monthly),
    [monthlyPipelineRows]
  );

  const volumeAverages = useMemo(() => {
    const byMonth = new Map(volumeRows.map((r) => [r.period_start, r]));
    const firstStart = volumeRows.map((r) => r.period_start).sort()[0] ?? getMonthStart();
    const months = Array.from({ length: VOLUME_WINDOW }, (_, i) =>
      getMonthStartOffset(VOLUME_WINDOW - 1 - i)
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
  }, [volumeRows]);

  function targetFor(metric: GoalMetric, period: GoalPeriod): number {
    return goalRows.find((g) => g.metric === metric && g.period === period)?.target ?? 0;
  }

  async function setTarget(metric: GoalMetric, period: GoalPeriod, target: number) {
    setGoalRows((prev) => {
      const existing = prev.find((g) => g.metric === metric && g.period === period);
      if (existing) return prev.map((g) => (g === existing ? { ...g, target } : g));
      return [...prev, { id: "", user_id: user.id, metric, period, target, updated_at: "" }];
    });
    const { data, error } = await supabase
      .from("goals")
      .upsert({ user_id: user.id, metric, period, target }, { onConflict: "user_id,metric,period" })
      .select("*")
      .single();
    if (error) {
      setSaveError(`Couldn't save that goal: ${error.message}`);
    } else if (data) {
      setSaveError(null);
      const row = data as Goal;
      setGoalRows((prev) => [
        ...prev.filter((g) => !(g.metric === row.metric && g.period === row.period)),
        row,
      ]);
    }
  }

  function qi1CountFor(period: GoalPeriod): number | null {
    if (period === "weekly") return qi1Weekly;
    if (period === "monthly") return qi1Monthly;
    return null;
  }

  return (
    <FeatureGate minSession={5}>
      <PageHeader title="Goals" subtitle="Your goal today is:" />
      <main className="page-main">
        {saveError && (
          <div className="card">
            <p className="text-xs text-red-400">{saveError}</p>
          </div>
        )}

        <div className="card space-y-4">
          <div>
            <p className="section-title">Your Dreams</p>
            <p className="text-xs text-slate-400">
              The big picture — why you&apos;re doing any of this. Write whatever&apos;s true for
              you; your upline can see it so they know how to help you get there.
            </p>
          </div>
          {DREAM_FIELDS.map((field) => (
            <DreamTextarea
              key={field.key}
              label={field.label}
              placeholder={field.placeholder}
              value={dreams[field.key]}
              onSave={(value) => saveDream(field.key, value)}
            />
          ))}
        </div>

        <div className="card space-y-2">
          <p className="section-title">Your Averages</p>
          <p className="text-xs text-slate-400">
            The same averages already shown on Core Run, the Pipeline Tracker, and Volume — pulled
            together here so you can see how you&apos;re actually pacing right next to the goals
            below.
          </p>
          <div className="flex items-center justify-between rounded-lg bg-navy px-3 py-2">
            <span className="text-sm text-slate-200">🎧 Audios per day</span>
            <span className="text-lg font-bold text-amber">
              {coreRunAverages.audiosPerDay.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-navy px-3 py-2">
            <span className="text-sm text-slate-200">📖 Read per day</span>
            <span className="text-lg font-bold text-amber">
              {coreRunAverages.readAmountPerDay.toFixed(1)}
            </span>
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

          <div className="flex items-center justify-between rounded-lg bg-navy px-3 py-2">
            <span className="text-sm text-slate-200">🚀 PV per month</span>
            <span className="text-lg font-bold text-amber">
              {volumeAverages.pvPerMonth.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-navy px-3 py-2">
            <span className="text-sm text-slate-200">💧 Ditto per month</span>
            <span className="text-lg font-bold text-amber">
              {volumeAverages.dittoPerMonth.toFixed(1)}
            </span>
          </div>
        </div>

        {loading ? (
          <SkeletonList cards={2} lines={3} />
        ) : (
          GOAL_PERIODS.map((period) => (
            <div key={period.key} className="card space-y-3">
              <p className="section-title">{period.label}</p>
              <p className="text-xs text-slate-400">
                Stays the same until you change it.
              </p>
              {GOAL_ITEMS_BY_PERIOD[period.key].map((item) => {
                const qi1Count = item.key === "qi1s" ? qi1CountFor(period.key) : null;
                return (
                  <div key={item.key} className="flex items-center gap-2 text-sm text-slate-200">
                    {item.prefix && <span>{item.prefix}</span>}
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="input !w-16 !p-1.5 text-center"
                      value={inputs[inputKey(item.key, period.key)] ?? ""}
                      onChange={(e) =>
                        setInputs((prev) => ({
                          ...prev,
                          [inputKey(item.key, period.key)]: e.target.value,
                        }))
                      }
                      onBlur={(e) => {
                        const parsed = Math.max(0, parseInt(e.target.value, 10) || 0);
                        setInputs((prev) => ({
                          ...prev,
                          [inputKey(item.key, period.key)]: parsed > 0 ? String(parsed) : "",
                        }));
                        if (parsed !== targetFor(item.key, period.key)) {
                          setTarget(item.key, period.key, parsed);
                        }
                      }}
                    />
                    <span>{item.suffix}</span>
                    {qi1Count !== null && (
                      <span className="text-xs text-amber-light">
                        (you&apos;ve shown {qi1Count} so far)
                      </span>
                    )}
                  </div>
                );
              })}
              {period.key === "daily" && (
                <p className="text-xs text-amber-light">
                  📋 Check Upline on what your daily goal should be.
                </p>
              )}
            </div>
          ))
        )}
      </main>
    </FeatureGate>
  );
}
