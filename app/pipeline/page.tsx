"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import TrendChart from "@/components/TrendChart";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import {
  PIPELINE_STAGES,
  CANDIDATE_STEPS,
  ACTIVE_PIPELINE_MIN_STEP,
  type PipelineStageKey,
} from "@/lib/constants";
import {
  getMonthStart,
  getWeekStart,
  formatDateLabel,
  formatShortDateLabel,
  formatShortMonthLabel,
} from "@/lib/dates";
import type { PipelinePeriod, Candidate } from "@/lib/types";

type PeriodType = "weekly" | "monthly";

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export default function PipelinePage() {
  const { ownerId } = useAuth();
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [period, setPeriod] = useState<PipelinePeriod | null>(null);
  const [loading, setLoading] = useState(true);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [trendStage, setTrendStage] = useState<PipelineStageKey>("questions");
  const [trendHistory, setTrendHistory] = useState<PipelinePeriod[]>([]);
  const [showActiveSummary, setShowActiveSummary] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const periodStart =
        periodType === "weekly" ? getWeekStart() : getMonthStart();

      const { data: existing } = await supabase
        .from("pipeline_periods")
        .select("*")
        .eq("user_id", ownerId)
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
        .insert({ user_id: ownerId, period_type: periodType, period_start: periodStart })
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
  }, [periodType, ownerId]);

  useEffect(() => {
    async function load() {
      setLoadingCandidates(true);
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false });
      setCandidates((data as Candidate[]) ?? []);
      setLoadingCandidates(false);
    }
    load();
  }, [ownerId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const limit = periodType === "weekly" ? 8 : 6;
      const { data } = await supabase
        .from("pipeline_periods")
        .select("*")
        .eq("user_id", ownerId)
        .eq("period_type", periodType)
        .order("period_start", { ascending: false })
        .limit(limit);
      if (!cancelled) setTrendHistory((data as PipelinePeriod[]) ?? []);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [periodType, ownerId]);

  const chartData = useMemo(() => {
    const merged = [...trendHistory];
    if (period) {
      const idx = merged.findIndex((p) => p.period_start === period.period_start);
      if (idx >= 0) merged[idx] = period;
      else merged.push(period);
    }
    return merged
      .slice()
      .sort((a, b) => a.period_start.localeCompare(b.period_start))
      .map((p) => ({
        label:
          periodType === "weekly"
            ? formatShortDateLabel(p.period_start)
            : formatShortMonthLabel(p.period_start),
        value: p[trendStage] as number,
      }));
  }, [trendHistory, period, periodType, trendStage]);

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

  async function addCandidate() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const { data } = await supabase
      .from("candidates")
      .insert({ name, user_id: ownerId })
      .select("*")
      .single();
    if (data) setCandidates((prev) => [data as Candidate, ...prev]);
    setNewName("");
    setAdding(false);
  }

  async function updateCandidate(id: string, patch: Partial<Candidate>) {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
    await supabase
      .from("candidates")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  function moveStep(candidate: Candidate, delta: number) {
    const next = Math.min(
      CANDIDATE_STEPS.length - 1,
      Math.max(0, candidate.current_step + delta)
    );
    if (next === candidate.current_step) return;
    updateCandidate(candidate.id, { current_step: next });
  }

  const questions = period?.questions ?? 0;
  const launches = period?.launches ?? 0;

  // Filtered-out candidates disappear from the active roadmap once they're
  // filtered out — they only live on in the Candidate History tab.
  const active = candidates.filter((c) => !c.launched && !c.filtered_out);
  const launched = candidates.filter((c) => c.launched);
  const activeInPipeline = active.filter((c) => c.current_step >= ACTIVE_PIPELINE_MIN_STEP);
  const activeInPipelineCount = activeInPipeline.length;

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

        <div className="card space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="section-title">Trend</p>
            <select
              className="select"
              value={trendStage}
              onChange={(e) => setTrendStage(e.target.value as PipelineStageKey)}
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <TrendChart data={chartData} />
        </div>

        <div className="flex items-center justify-between px-1 pt-2">
          <p className="section-title">Candidate Roadmap</p>
          <button
            className="pill pill-amber"
            onClick={() => setShowActiveSummary((s) => !s)}
          >
            {activeInPipelineCount} active in pipeline
          </button>
        </div>

        {showActiveSummary && (
          <div className="card space-y-1.5">
            <p className="section-title">Who&apos;s Active</p>
            {activeInPipeline.length === 0 ? (
              <p className="text-sm text-slate-400">No one active in the pipeline right now.</p>
            ) : (
              activeInPipeline.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">{c.name}</span>
                  <span className="pill">{CANDIDATE_STEPS[c.current_step].label}</span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="card space-y-2">
          <p className="section-title">Add Candidate</p>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Candidate name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCandidate()}
            />
            <button
              className="btn-primary"
              onClick={addCandidate}
              disabled={adding || !newName.trim()}
            >
              Add
            </button>
          </div>
        </div>

        {loadingCandidates ? (
          <div className="empty-state">Loading candidates…</div>
        ) : candidates.length === 0 ? (
          <div className="empty-state">No candidates yet. Add your first one above.</div>
        ) : (
          <>
            {active.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                onMoveStep={moveStep}
                onUpdate={updateCandidate}
              />
            ))}

            {active.length === 0 && (
              <p className="empty-state">No active candidates right now.</p>
            )}

            {launched.length > 0 && (
              <div className="space-y-2">
                <p className="section-title px-1">Launched 🎉</p>
                {launched.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    onMoveStep={moveStep}
                    onUpdate={updateCandidate}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function CandidateCard({
  candidate,
  onMoveStep,
  onUpdate,
}: {
  candidate: Candidate;
  onMoveStep: (candidate: Candidate, delta: number) => void;
  onUpdate: (id: string, patch: Partial<Candidate>) => void;
}) {
  const [notes, setNotes] = useState(candidate.notes);
  const step = CANDIDATE_STEPS[candidate.current_step];
  const isSettled = candidate.launched || candidate.filtered_out;

  return (
    <div className={`card space-y-3 ${isSettled ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">{candidate.name}</p>
          <p className="pill-amber mt-1">
            Step {candidate.current_step + 1}/{CANDIDATE_STEPS.length}: {step.label}
          </p>
        </div>
        {!isSettled ? (
          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              className="btn-primary"
              onClick={() => onUpdate(candidate.id, { launched: true, filtered_out: false })}
            >
              Mark Launched
            </button>
            <button
              className="btn-danger"
              onClick={() => onUpdate(candidate.id, { filtered_out: true, launched: false })}
            >
              Filtered Out
            </button>
          </div>
        ) : (
          <button
            className="btn-secondary shrink-0"
            onClick={() => onUpdate(candidate.id, { launched: false, filtered_out: false })}
          >
            Restore
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-400">
        <span className="shrink-0 font-medium text-slate-300">Connected:</span>
        <input
          type="date"
          className="input"
          value={candidate.connected_date}
          onChange={(e) => onUpdate(candidate.id, { connected_date: e.target.value })}
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          className="btn-secondary flex-1"
          onClick={() => onMoveStep(candidate, -1)}
          disabled={candidate.current_step === 0}
        >
          ← Back
        </button>
        <button
          className="btn-primary flex-1"
          onClick={() => onMoveStep(candidate, 1)}
          disabled={candidate.current_step === CANDIDATE_STEPS.length - 1}
        >
          Advance →
        </button>
      </div>

      <textarea
        className="textarea"
        placeholder="Notes…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes !== candidate.notes) onUpdate(candidate.id, { notes });
        }}
      />
    </div>
  );
}
