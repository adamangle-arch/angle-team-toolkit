"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import { SkeletonList } from "@/components/Skeleton";
import { supabase } from "@/lib/supabaseClient";
import {
  getWeekStart,
  getWeekStartOffset,
  formatWeekRangeLabel,
  getMonthStart,
  getDateOffset,
  getToday,
  daysBetween,
  formatDateLabel,
} from "@/lib/dates";
import {
  GOAL_ITEMS_BY_PERIOD,
  GOAL_PERIODS,
  READING_UNITS,
  PIPELINE_STAGES,
  type GoalMetric,
  type GoalPeriod,
  type PipelineStageKey,
  type ReadingUnit,
} from "@/lib/constants";
import type { Goal, PipelinePeriod, Profile, Reflection } from "@/lib/types";

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
      {label && <p className="text-sm font-medium text-slate-200">{label}</p>}
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

  // Private weekly reflection - fully separate table from Dreams above
  // (which upline can see) and from the Daily Update sent through LTD
  // Messaging - RLS on `reflections` restricts every operation to
  // user_id = auth.uid(), no exceptions, so this never surfaces anywhere
  // else in the app. weeksBack mirrors the same back-navigation the
  // Team tab's Teams view and Leaderboard's monthly nav already use.
  const [reflectionWeeksBack, setReflectionWeeksBack] = useState(0);
  const reflectionWeekStart = getWeekStartOffset(reflectionWeeksBack);
  const [reflectionBody, setReflectionBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("reflections")
      .select("body")
      .eq("user_id", user.id)
      .eq("week_start", reflectionWeekStart)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setReflectionBody((data as Pick<Reflection, "body"> | null)?.body ?? "");
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, reflectionWeekStart]);

  async function saveReflection(value: string) {
    setReflectionBody(value);
    const { error } = await supabase
      .from("reflections")
      .upsert(
        { user_id: user.id, week_start: reflectionWeekStart, body: value },
        { onConflict: "user_id,week_start" }
      );
    if (error) {
      setSaveError(`Couldn't save that: ${error.message}`);
    } else {
      setSaveError(null);
    }
  }

  // Goal-backwards planning - "I want N Launches by this date, what does
  // that take?" reverse-computed from this person's own real Questions-
  // to-target conversion rate over their last 90 logged days, not a
  // generic assumption. planStage picks which funnel stage the target
  // count is measured in (Launches by default, since that's the metric
  // that actually drives rank/income) - Questions itself is excluded
  // from the picker since "questions per questions" is a meaningless 1:1
  // ratio, not a real target to plan backwards from.
  const [ninetyDayTotals, setNinetyDayTotals] = useState<Record<PipelineStageKey, number> | null>(null);
  const [planStage, setPlanStage] = useState<PipelineStageKey>("launches");
  const [planTarget, setPlanTarget] = useState("1");
  const [planDate, setPlanDate] = useState(getDateOffset(-90));

  useEffect(() => {
    supabase
      .from("pipeline_periods")
      .select("*")
      .eq("user_id", ownerId)
      .eq("period_type", "daily")
      .gte("period_start", getDateOffset(89))
      .then(({ data }) => {
        const rows = (data as PipelinePeriod[]) ?? [];
        const totals = {} as Record<PipelineStageKey, number>;
        for (const stage of PIPELINE_STAGES) {
          totals[stage.key] = rows.reduce((sum, r) => sum + (r[stage.key] ?? 0), 0);
        }
        setNinetyDayTotals(totals);
      });
  }, [ownerId]);

  const planStageLabel = PIPELINE_STAGES.find((s) => s.key === planStage)?.label ?? planStage;
  const planResult = useMemo(() => {
    if (!ninetyDayTotals) return null;
    const targetNum = parseFloat(planTarget) || 0;
    const totalQuestions = ninetyDayTotals.questions;
    const totalAtStage = ninetyDayTotals[planStage];
    const daysRemaining = daysBetween(getToday(), planDate);
    if (totalQuestions === 0) {
      return { kind: "no_data" as const };
    }
    if (totalAtStage === 0) {
      return { kind: "no_conversions" as const };
    }
    if (daysRemaining <= 0) {
      return { kind: "past_date" as const };
    }
    if (targetNum <= 0) {
      return { kind: "no_target" as const };
    }
    const ratio = totalAtStage / totalQuestions;
    const requiredQuestions = targetNum / ratio;
    const requiredPerDay = requiredQuestions / daysRemaining;
    const currentPerDay = totalQuestions / 90;
    return {
      kind: "ok" as const,
      ratioPct: ratio * 100,
      requiredPerDay,
      requiredPerWeek: requiredPerDay * 7,
      currentPerDay,
      onPace: currentPerDay >= requiredPerDay,
    };
  }, [ninetyDayTotals, planStage, planTarget, planDate]);

  // Which unit the Reading goal (and Core Run's reading input) is tracked
  // in - shared via profiles.reading_unit, so switching it here keeps
  // Core Run in sync too.
  const [readingUnit, setReadingUnit] = useState<ReadingUnit>("minutes");

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
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="section-title">📓 Weekly Reflection</p>
              <p className="text-xs text-slate-400">
                Private — only you can ever see this, not your upline, not admin.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button
              className="chip-btn text-xs"
              onClick={() => setReflectionWeeksBack((w) => w + 1)}
            >
              ◀ Prior week
            </button>
            <p className="text-xs font-medium text-slate-300">{formatWeekRangeLabel(reflectionWeekStart)}</p>
            <button
              className="chip-btn text-xs disabled:opacity-30"
              onClick={() => setReflectionWeeksBack((w) => Math.max(0, w - 1))}
              disabled={reflectionWeeksBack === 0}
            >
              Next week ▶
            </button>
          </div>
          <DreamTextarea
            key={reflectionWeekStart}
            label=""
            placeholder="How did this week actually go? What worked, what didn't, what are you carrying into next week…"
            value={reflectionBody}
            onSave={saveReflection}
          />
        </div>

        <div className="card space-y-2">
          <div>
            <p className="section-title">🎯 Goal-Backwards Planning</p>
            <p className="text-xs text-slate-400">
              Pick a target and a date — this works backwards using your own real last-90-day
              conversion rate, not a generic assumption, to show the daily Questions pace it
              actually takes.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              className="input w-20"
              type="number"
              min={1}
              value={planTarget}
              onChange={(e) => setPlanTarget(e.target.value)}
            />
            <select
              className="select flex-1"
              value={planStage}
              onChange={(e) => setPlanStage(e.target.value as PipelineStageKey)}
            >
              {PIPELINE_STAGES.filter((s) => s.key !== "questions").map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-slate-400">by</span>
            <input
              className="input"
              type="date"
              min={getDateOffset(-1)}
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
            />
          </div>

          {planResult?.kind === "no_data" && (
            <p className="text-xs text-slate-400">
              Log some Questions over the next few days so there&apos;s a real conversion rate to
              work from.
            </p>
          )}
          {planResult?.kind === "no_conversions" && (
            <p className="text-xs text-slate-400">
              You haven&apos;t hit {planStageLabel} yet in your last 90 days, so there&apos;s no
              real ratio to project from — this fills in once you do.
            </p>
          )}
          {planResult?.kind === "past_date" && (
            <p className="text-xs text-red-400">Pick a date in the future.</p>
          )}
          {planResult?.kind === "no_target" && (
            <p className="text-xs text-red-400">Enter a target count above 0.</p>
          )}
          {planResult?.kind === "ok" && (
            <div className="space-y-1 rounded-lg bg-navy px-3 py-2">
              <p className="text-sm text-slate-200">
                At your own {planResult.ratioPct.toFixed(1)}% Questions→{planStageLabel} rate,
                that takes about{" "}
                <span className="font-bold text-amber">{planResult.requiredPerDay.toFixed(1)}</span>{" "}
                Questions/day (<span className="font-bold text-amber">
                  {planResult.requiredPerWeek.toFixed(0)}
                </span>
                /week) between now and {formatDateLabel(planDate)}.
              </p>
              <p className="text-xs text-slate-400">
                You&apos;re currently averaging {planResult.currentPerDay.toFixed(1)}/day —{" "}
                {planResult.onPace ? (
                  <span className="text-emerald-400">already on pace. 🎉</span>
                ) : (
                  <span className="text-amber-light">
                    {(planResult.requiredPerDay - planResult.currentPerDay).toFixed(1)} more/day
                    needed to get there.
                  </span>
                )}
              </p>
            </div>
          )}
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
                const isReading = item.key === "read_minutes";
                const suffix = isReading ? readingUnit : item.suffix;
                return (
                  <div key={item.key} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-slate-200">
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
                      <span>{suffix}</span>
                      {qi1Count !== null && (
                        <span className="text-xs text-amber-light">
                          (you&apos;ve shown {qi1Count} so far)
                        </span>
                      )}
                    </div>
                    {isReading && (
                      <div className="flex items-center gap-1.5 pl-1">
                        <span className="shrink-0 text-xs text-slate-400">Track in:</span>
                        <div className="flex flex-1 gap-1.5">
                          {READING_UNITS.map((u) => (
                            <button
                              key={u.key}
                              type="button"
                              className={
                                readingUnit === u.key ? "toggle-pill-active" : "toggle-pill-inactive"
                              }
                              onClick={() => saveReadingUnit(u.key)}
                            >
                              {u.label}
                            </button>
                          ))}
                        </div>
                      </div>
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
