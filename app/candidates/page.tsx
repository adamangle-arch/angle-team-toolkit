"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { CANDIDATE_STEPS } from "@/lib/constants";
import type { Candidate } from "@/lib/types";

export default function CandidatesPage() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setCandidates((data as Candidate[]) ?? []);
      setLoading(false);
    }
    load();
  }, [user.id]);

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

  const active = candidates.filter((c) => !c.launched && !c.filtered_out);
  const launched = candidates.filter((c) => c.launched);
  const filteredOut = candidates.filter((c) => c.filtered_out);

  return (
    <>
      <PageHeader title="Candidate Roadmap" subtitle="9-step journey to launch" />
      <main className="page-main">
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

        {loading ? (
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

            {filteredOut.length > 0 && (
              <div className="space-y-2">
                <p className="section-title px-1">Filtered Out</p>
                {filteredOut.map((candidate) => (
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
