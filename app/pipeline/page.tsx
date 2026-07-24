"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { PIPELINE_STAGES, CANDIDATE_STEPS, type PipelineStageKey } from "@/lib/constants";
import { getMonthStart, getWeekStart, formatDateLabel } from "@/lib/dates";
import type { PipelinePeriod, Candidate } from "@/lib/types";

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

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

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

  useEffect(() => {
    async function load() {
      setLoadingCandidates(true);
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setCandidates((data as Candidate[]) ?? []);
      setLoadingCandidates(false);
    }
    load();
  }, [user.id]);

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
      .insert({ name, user_id: user.id })
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
  // filtered out — they only live on in the Candidate History table below.
  const active = candidates.filter((c) => !c.launched && !c.filtered_out);
  const launched = candidates.filter((c) => c.launched);

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

        <p className="section-title px-1 pt-2">Candidate Roadmap</p>

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

        {candidates.length > 0 && (
          <div className="card space-y-2">
            <p className="section-title">Candidate History</p>
            <p className="text-xs text-slate-400">
              Every candidate you&apos;ve ever added, including where they filtered out.
            </p>
            <div className="no-scrollbar overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="pb-1 pr-2 font-medium">Name</th>
                    <th className="pb-1 pr-2 font-medium">Status</th>
                    <th className="pb-1 pr-2 font-medium">Notes</th>
                    <th className="pb-1 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const step = CANDIDATE_STEPS[c.current_step];
                    return (
                      <tr key={c.id} className="border-t border-white/5">
                        <td className="py-1.5 pr-2 font-medium text-white">{c.name}</td>
                        <td className="py-1.5 pr-2 text-slate-300">
                          {c.launched
                            ? "Launched 🎉"
                            : c.filtered_out
                              ? `Filtered Out — ${step.label}`
                              : `Active — ${step.label}`}
                        </td>
                        <td className="max-w-[160px] truncate py-1.5 pr-2 text-slate-400">
                          {c.notes || "—"}
                        </td>
                        <td className="py-1.5">
                          {(c.launched || c.filtered_out) && (
                            <button
                              className="pill"
                              onClick={() =>
                                updateCandidate(c.id, { launched: false, filtered_out: false })
                              }
                            >
                              Restore
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
            Step {candidate.current_step + 1}/9: {step.label}
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

      <p className="text-xs text-slate-400">
        <span className="font-medium text-slate-300">Homework: </span>
        {step.homework}
      </p>

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
