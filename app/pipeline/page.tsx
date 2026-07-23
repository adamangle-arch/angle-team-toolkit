"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { PIPELINE_STAGES, type PipelineStageKey } from "@/lib/constants";
import { getMonthStart, getWeekStart, formatDateLabel } from "@/lib/dates";
import type { PipelinePeriod } from "@/lib/types";

type PeriodType = "weekly" | "monthly";

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export default function PipelinePage() {
  const { user } = useAuth();
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [period, setPeriod] = useState<PipelinePeriod | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const periodStart =
        periodType === "weekly" ? getWeekStart() : getMonthStart();

      const { data: existing } = await supabase
        .from("pipeline_periods")
        .select("*")
        .eq("user_id", user.id)
        .eq("period_type", periodType)
        .eq("period_start", periodStart)
        .maybeSingle();

      if (existing) {
        if (!cancelled) {
          setPeriod(existing as PipelinePeriod);
          setLoading(false);
        }
        return;
      }

      const { data: created } = await supabase
        .from("pipeline_periods")
        .insert({ user_id: user.id, period_type: periodType, period_start: periodStart })
        .select("*")
        .single();

      if (!cancelled) {
        setPeriod(created as PipelinePeriod);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [periodType, user.id]);

  async function updateStage(key: PipelineStageKey, delta: number) {
    if (!period) return;
    const nextValue = Math.max(0, (period[key] as number) + delta);
    const updated = { ...period, [key]: nextValue };
    setPeriod(updated);
    await supabase
      .from("pipeline_periods")
      .update({ [key]: nextValue, updated_at: new Date().toISOString() })
      .eq("id", period.id);
  }

  const questions = period?.questions ?? 0;
  const launches = period?.launches ?? 0;

  return (
    <>
      <PageHeader
        title="Pipeline Tracker"
        subtitle={
          period
            ? `${periodType === "weekly" ? "Week of" : "Month of"} ${formatDateLabel(
                period.period_start
              )}`
            : undefined
        }
      />
      <main className="page-main">
        <div className="card flex p-1">
          <button
            className={
              periodType === "weekly" ? "toggle-pill-active" : "toggle-pill-inactive"
            }
            onClick={() => setPeriodType("weekly")}
          >
            Weekly
          </button>
          <button
            className={
              periodType === "monthly" ? "toggle-pill-active" : "toggle-pill-inactive"
            }
            onClick={() => setPeriodType("monthly")}
          >
            Monthly
          </button>
        </div>

        <div className="card flex items-center justify-between">
          <div>
            <p className="section-title">Questions → Launches</p>
            <p className="text-xs text-slate-400">Overall conversion</p>
          </div>
          <p className="text-3xl font-bold text-amber">{pct(launches, questions)}</p>
        </div>

        {loading || !period ? (
          <div className="empty-state">Loading pipeline…</div>
        ) : (
          <div className="space-y-2">
            {PIPELINE_STAGES.map((stage, i) => {
              const count = period[stage.key] as number;
              const prevStage = i > 0 ? PIPELINE_STAGES[i - 1] : null;
              const prevCount = prevStage ? (period[prevStage.key] as number) : null;

              return (
                <div key={stage.key}>
                  {i > 0 && (
                    <div className="flex items-center justify-center py-1 text-xs text-slate-500">
                      <span>
                        {prevStage?.label} → {stage.label}:{" "}
                        <span className="font-semibold text-amber-light">
                          {pct(count, prevCount ?? 0)}
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="card flex items-center justify-between">
                    <p className="font-medium text-white">{stage.label}</p>
                    <div className="flex items-center gap-3">
                      <button
                        className="btn-icon"
                        onClick={() => updateStage(stage.key, -1)}
                        disabled={count <= 0}
                        aria-label={`Decrease ${stage.label}`}
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-xl font-bold text-white">
                        {count}
                      </span>
                      <button
                        className="btn-icon"
                        onClick={() => updateStage(stage.key, 1)}
                        aria-label={`Increase ${stage.label}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
