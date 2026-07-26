"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { getWeekStart, getMonthStart } from "@/lib/dates";
import {
  GOAL_ITEMS_BY_PERIOD,
  GOAL_PERIODS,
  type GoalMetric,
  type GoalPeriod,
} from "@/lib/constants";
import type { Goal, PipelinePeriod } from "@/lib/types";

function inputKey(metric: GoalMetric, period: GoalPeriod): string {
  return `${metric}:${period}`;
}

export default function GoalsPage() {
  const { user, ownerId } = useAuth();
  const [goalRows, setGoalRows] = useState<Goal[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [qi1Weekly, setQi1Weekly] = useState(0);
  const [qi1Monthly, setQi1Monthly] = useState(0);

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
    const { data } = await supabase
      .from("goals")
      .upsert({ user_id: user.id, metric, period, target }, { onConflict: "user_id,metric,period" })
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

  function qi1CountFor(period: GoalPeriod): number | null {
    if (period === "weekly") return qi1Weekly;
    if (period === "monthly") return qi1Monthly;
    return null;
  }

  return (
    <>
      <PageHeader title="Goals" subtitle="Your goal today is:" />
      <main className="page-main">
        {loading ? (
          <div className="empty-state">Loading…</div>
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
                        (you&apos;ve booked {qi1Count} so far)
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
    </>
  );
}
