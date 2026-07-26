"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { CANDIDATE_STEPS } from "@/lib/constants";
import { formatDateLabel, formatMonthLabel, getMonthStartOffset } from "@/lib/dates";
import type { Candidate } from "@/lib/types";

export default function HistoryPage() {
  const { ownerId } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthsBack, setMonthsBack] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("user_id", ownerId)
        .order("connected_date", { ascending: false })
        .order("created_at", { ascending: false });
      setCandidates((data as Candidate[]) ?? []);
      setLoading(false);
    }
    load();
  }, [ownerId]);

  const monthStart = getMonthStartOffset(monthsBack);
  const nextMonthStart = getMonthStartOffset(monthsBack - 1);
  const candidatesThisMonth = useMemo(
    () => candidates.filter((c) => c.connected_date >= monthStart && c.connected_date < nextMonthStart),
    [candidates, monthStart, nextMonthStart]
  );

  async function updateCandidate(id: string, patch: Partial<Candidate>) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await supabase
      .from("candidates")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  return (
    <>
      <PageHeader title="Candidate History" subtitle="Every candidate you've ever added" />
      <main className="page-main">
        <div className="card flex items-center justify-between">
          <button
            className="btn-icon"
            onClick={() => setMonthsBack((m) => Math.min(11, m + 1))}
            disabled={monthsBack >= 11}
            aria-label="Previous month"
          >
            ←
          </button>
          <span className="text-sm font-medium text-white">{formatMonthLabel(monthStart)}</span>
          <button
            className="btn-icon"
            onClick={() => setMonthsBack((m) => Math.max(0, m - 1))}
            disabled={monthsBack <= 0}
            aria-label="Next month"
          >
            →
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading candidates…</div>
        ) : candidatesThisMonth.length === 0 ? (
          <div className="empty-state">
            {candidates.length === 0
              ? "No candidates yet. Add one from the Pipeline Tracker's Candidate Roadmap."
              : `No candidates connected in ${formatMonthLabel(monthStart)}.`}
          </div>
        ) : (
          <div className="card space-y-2">
            <div className="no-scrollbar overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="pb-1 pr-2 font-medium">Connected</th>
                    <th className="pb-1 pr-2 font-medium">Name</th>
                    <th className="pb-1 pr-2 font-medium">Status</th>
                    <th className="pb-1 pr-2 font-medium">Notes</th>
                    <th className="pb-1 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {candidatesThisMonth.map((c) => {
                    const step = CANDIDATE_STEPS[c.current_step];
                    return (
                      <tr key={c.id} className="border-t border-white/5">
                        <td className="py-1.5 pr-2 whitespace-nowrap text-slate-400">
                          {formatDateLabel(c.connected_date)}
                        </td>
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
