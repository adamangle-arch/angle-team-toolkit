"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import { CALL_TYPES } from "@/lib/constants";
import { formatDateLabel } from "@/lib/dates";
import type { CallLogEntry } from "@/lib/types";

export default function CallsPage() {
  const [calls, setCalls] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [candidateName, setCandidateName] = useState("");
  const [callType, setCallType] = useState<string>(CALL_TYPES[0]);
  const [score, setScore] = useState(7);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("call_log")
        .select("*")
        .order("created_at", { ascending: false });
      setCalls((data as CallLogEntry[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function addCall() {
    const name = candidateName.trim();
    if (!name) return;
    setSaving(true);
    const { data } = await supabase
      .from("call_log")
      .insert({ candidate_name: name, call_type: callType, score, notes })
      .select("*")
      .single();
    if (data) setCalls((prev) => [data as CallLogEntry, ...prev]);
    setCandidateName("");
    setNotes("");
    setScore(7);
    setSaving(false);
  }

  async function deleteCall(id: string) {
    setCalls((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("call_log").delete().eq("id", id);
  }

  const average = useMemo(() => {
    if (calls.length === 0) return null;
    const total = calls.reduce((sum, c) => sum + c.score, 0);
    return (total / calls.length).toFixed(1);
  }, [calls]);

  return (
    <>
      <PageHeader title="Call Log" subtitle="Track quality across every call" />
      <main className="page-main">
        <div className="card flex items-center justify-between">
          <div>
            <p className="section-title">Average Score</p>
            <p className="text-xs text-slate-400">{calls.length} calls logged</p>
          </div>
          <p className="text-3xl font-bold text-amber">{average ?? "—"}</p>
        </div>

        <div className="card space-y-2">
          <p className="section-title">Log a Call</p>
          <input
            className="input"
            placeholder="Candidate name"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
          />
          <select
            className="select"
            value={callType}
            onChange={(e) => setCallType(e.target.value)}
          >
            {CALL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Score</span>
            <input
              type="range"
              min={1}
              max={10}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="flex-1 accent-amber"
            />
            <span className="w-6 text-center text-lg font-bold text-amber">{score}</span>
          </div>
          <textarea
            className="textarea"
            placeholder="Notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            className="btn-primary w-full"
            onClick={addCall}
            disabled={saving || !candidateName.trim()}
          >
            Save Call
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading calls…</div>
        ) : calls.length === 0 ? (
          <div className="empty-state">No calls logged yet.</div>
        ) : (
          <div className="space-y-2">
            {calls.map((call) => (
              <div key={call.id} className="card space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{call.candidate_name}</p>
                    <p className="text-xs text-slate-400">
                      {call.call_type} • {formatDateLabel(call.created_at.slice(0, 10))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="pill-amber">{call.score}/10</span>
                    <button
                      className="btn-icon !h-7 !w-7 text-sm"
                      onClick={() => deleteCall(call.id)}
                      aria-label="Delete call"
                    >
                      ×
                    </button>
                  </div>
                </div>
                {call.notes && <p className="text-sm text-slate-300">{call.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
