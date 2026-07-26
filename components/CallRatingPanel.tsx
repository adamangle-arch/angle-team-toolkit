"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import type { CallRating } from "@/lib/types";

export default function CallRatingPanel() {
  const { user } = useAuth();
  const [candidateName, setCandidateName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [rating, setRating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<CallRating[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoadingHistory(true);
      const { data } = await supabase
        .from("call_ratings")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setHistory((data as CallRating[]) ?? []);
      setLoadingHistory(false);
    }
    load();
  }, [user.id]);

  async function handleRate() {
    const text = transcript.trim();
    if (!text || rating) return;
    setError(null);
    setRating(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    try {
      const res = await fetch("/api/assistant/rate-call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ call_type: "QI1", transcript: text }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Something went wrong.");
      }

      const { data: row } = await supabase
        .from("call_ratings")
        .insert({
          user_id: user.id,
          call_type: "QI1",
          candidate_name: candidateName.trim(),
          transcript: text,
          analysis: json.analysis,
          overall_score: json.overall_score,
        })
        .select("*")
        .single();

      if (row) {
        const inserted = row as CallRating;
        setHistory((prev) => [inserted, ...prev]);
        setExpandedId(inserted.id);
      }
      setTranscript("");
      setCandidateName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRating(false);
    }
  }

  return (
    <>
      <div className="card space-y-2">
        <p className="section-title">Rate a QI1 Call</p>
        <p className="text-xs text-slate-400">
          Paste the transcript of a recorded QI1 call and it&apos;ll be scored against the QI1
          vetting rubric. Your upline can see your ratings on the Team tab so they know how to
          help you. QI2 rating is coming soon.
        </p>
        <input
          className="input"
          placeholder="Candidate name (optional)"
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
        />
        <textarea
          className="textarea"
          rows={8}
          placeholder="Paste the QI1 call transcript here…"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          className="btn-primary w-full"
          onClick={handleRate}
          disabled={rating || !transcript.trim()}
        >
          {rating ? "Rating…" : "Rate This Call"}
        </button>
      </div>

      <div className="card space-y-1.5">
        <p className="section-title">Your Ratings ({history.length})</p>
        {loadingHistory ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-400">No calls rated yet.</p>
        ) : (
          history.map((h) => (
            <div key={h.id} className="rounded-lg bg-navy p-2.5">
              <button
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
              >
                <span className="truncate text-sm text-slate-200">
                  {h.call_type}
                  {h.candidate_name ? ` · ${h.candidate_name}` : ""}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                  {h.overall_score !== null && <span className="pill">{h.overall_score}/10</span>}
                  {new Date(h.created_at).toLocaleDateString()}
                </span>
              </button>
              {expandedId === h.id && (
                <p className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{h.analysis}</p>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
