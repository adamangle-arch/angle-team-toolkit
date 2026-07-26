"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { getToday, getWeekStart, getMonthStart } from "@/lib/dates";
import { GOAL_METRICS, GOAL_PERIODS, type GoalMetric, type GoalPeriod } from "@/lib/constants";
import type { StreakDay, Goal } from "@/lib/types";

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Every metric maps to something already tracked daily on streak_days -
// defensive fallbacks here cover a database that hasn't run the
// listen_items/meeting_items/read_pages migrations yet.
function metricValue(row: StreakDay, metric: GoalMetric): number {
  switch (metric) {
    case "questions":
      return row.questions ?? 0;
    case "story_shares":
      return row.story_shares ?? 0;
    case "yeses":
      return row.yeses ?? 0;
    case "meetings":
      return row.meeting_items?.length ?? 0;
    case "audios":
      return row.listen_items?.length ?? 0;
    case "read_pages":
      return row.read_pages ?? 0;
  }
}

function inputKey(metric: GoalMetric, period: GoalPeriod): string {
  return `${metric}:${period}`;
}

export default function GoalsPage() {
  const { user } = useAuth();
  const today = getToday();
  const weekStart = getWeekStart();
  const monthStart = getMonthStart();

  const [days, setDays] = useState<StreakDay[]>([]);
  const [loadingDays, setLoadingDays] = useState(true);
  const [goalRows, setGoalRows] = useState<Goal[]>([]);
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>({});
  const [loadingGoals, setLoadingGoals] = useState(true);

  useEffect(() => {
    async function load() {
      setLoadingDays(true);
      const since = addDays(today, -35);
      const { data } = await supabase
        .from("streak_days")
        .select("*")
        .eq("user_id", user.id)
        .gte("day", since);
      setDays((data as StreakDay[]) ?? []);
      setLoadingDays(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    async function load() {
      setLoadingGoals(true);
      const { data } = await supabase.from("goals").select("*").eq("user_id", user.id);
      const rows = (data as Goal[]) ?? [];
      setGoalRows(rows);
      const map: Record<string, string> = {};
      for (const g of rows) map[inputKey(g.metric, g.period)] = String(g.target);
      setTargetInputs(map);
      setLoadingGoals(false);
    }
    load();
  }, [user.id]);

  function targetFor(metric: GoalMetric, period: GoalPeriod): number {
    return goalRows.find((g) => g.metric === metric && g.period === period)?.target ?? 0;
  }

  async function setTarget(metric: GoalMetric, period: GoalPeriod, target: number) {
    setGoalRows((prev) => {
      const existing = prev.find((g) => g.metric === metric && g.period === period);
      if (existing) {
        return prev.map((g) => (g === existing ? { ...g, target } : g));
      }
      return [...prev, { id: "", user_id: user.id, metric, period, target, updated_at: "" }];
    });
    const { data } = await supabase
      .from("goals")
      .upsert(
        { user_id: user.id, metric, period, target },
        { onConflict: "user_id,metric,period" }
      )
      .select("*")
      .single();
    if (data) {
      const row = data as Goal;
      setGoalRows((prev) => [
        ...prev.filter((g) => !(g.metric === row.metric && g.period === row.period)),
        row,
      ]);
    }
  }

  const actuals = useMemo(() => {
    const result = {} as Record<GoalMetric, Record<GoalPeriod, number>>;
    for (const m of GOAL_METRICS) {
      result[m.key] = { daily: 0, weekly: 0, monthly: 0 };
    }
    for (const row of days) {
      for (const m of GOAL_METRICS) {
        const value = metricValue(row, m.key);
        if (row.day === today) result[m.key].daily += value;
        if (row.day >= weekStart) result[m.key].weekly += value;
        if (row.day >= monthStart) result[m.key].monthly += value;
      }
    }
    return result;
  }, [days, today, weekStart, monthStart]);

  const loading = loadingDays || loadingGoals;

  return (
    <>
      <PageHeader title="Goals" subtitle="What it actually takes today, this week, this month" />
      <main className="page-main">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : (
          GOAL_METRICS.map((m) => (
            <div key={m.key} className="card space-y-2">
              <p className="section-title">
                {m.emoji} {m.label}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {GOAL_PERIODS.map((p) => {
                  const target = targetFor(m.key, p.key);
                  const actual = actuals[m.key][p.key];
                  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
                  const hit = target > 0 && actual >= target;
                  return (
                    <div key={p.key} className="space-y-1.5 rounded-lg bg-navy p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">
                        {p.label}
                      </p>
                      <p className={`text-lg font-bold ${hit ? "text-amber-light" : "text-white"}`}>
                        {actual}
                        {target > 0 && (
                          <span className="text-xs font-normal text-slate-500"> / {target}</span>
                        )}
                      </p>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder="Set goal"
                        className="input !w-full !p-1 text-center text-xs"
                        value={targetInputs[inputKey(m.key, p.key)] ?? ""}
                        onChange={(e) =>
                          setTargetInputs((prev) => ({
                            ...prev,
                            [inputKey(m.key, p.key)]: e.target.value,
                          }))
                        }
                        onBlur={(e) => {
                          const parsed = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setTargetInputs((prev) => ({
                            ...prev,
                            [inputKey(m.key, p.key)]: parsed > 0 ? String(parsed) : "",
                          }));
                          if (parsed !== target) setTarget(m.key, p.key, parsed);
                        }}
                      />
                      {target > 0 && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full ${hit ? "bg-amber" : "bg-amber/60"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>
    </>
  );
}
