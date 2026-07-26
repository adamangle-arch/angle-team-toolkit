"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { CALL_RATING_TYPES, type CallRatingType } from "@/lib/constants";
import { groupCallRatingsByType } from "@/lib/call-ratings";
import type { CallRating } from "@/lib/types";

type CandidateOption = {
  id: string;
  name: string;
  notes: string;
};

// Bounds how much prior-meeting context gets fed back in for a repeat
// candidate — enough for the model to remember them without letting cost
// grow unbounded the more times a candidate gets rated.
const MAX_PRIOR_RATINGS = 3;
const MAX_PRIOR_ANALYSIS_CHARS = 3000;

// A detailed, non-streamed rating on a long transcript can legitimately
// take a while, but it must never hang forever — if this fires first, the
// button always recovers with a clear message instead of staying stuck on
// "Rating..." no matter which step (session refresh, the API call, the
// save) is the one that's actually stalled.
const RATE_TIMEOUT_MS = 90_000;

function timeoutRejection(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("That took too long and timed out — check your connection and try again.")),
      ms
    )
  );
}

export default function CallRatingPanel() {
  const { user } = useAuth();
  const [callType, setCallType] = useState<CallRatingType | "">("");
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [rating, setRating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<CallRating[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: candidateRows }, { data: ratingRows }] = await Promise.all([
        supabase
          .from("candidates")
          .select("id,name,notes")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("call_ratings")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      setCandidates((candidateRows as CandidateOption[]) ?? []);
      setHistory((ratingRows as CallRating[]) ?? []);
      setLoadingHistory(false);
    }
    load();
  }, [user.id]);

  async function handleRate() {
    const text = transcript.trim();
    if (!text || !callType || rating) return;
    setError(null);
    setRating(true);

    // Everything that can talk to the network - session refresh, the
    // prior-ratings lookup, the API call, the save - runs inside this one
    // closure so a single race against the timeout above covers all of it,
    // instead of only the fetch call being guarded and the rest able to
    // hang the button forever.
    const run = async () => {
      const candidate = candidates.find((c) => c.id === selectedCandidateId) ?? null;
      const finalCandidateName = candidate ? candidate.name : candidateName.trim();

      let candidateContext = "";
      if (candidate) {
        const { data: priorRows } = await supabase
          .from("call_ratings")
          .select("call_type,analysis,created_at")
          .eq("candidate_id", candidate.id)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(MAX_PRIOR_RATINGS);
        const prior = (
          (priorRows as { call_type: string; analysis: string; created_at: string }[]) ?? []
        )
          .slice()
          .reverse();

        const notesPart = candidate.notes.trim()
          ? `Rep's notes on this candidate:\n${candidate.notes.trim()}\n\n`
          : "";
        const priorPart = prior
          .map(
            (r) =>
              `--- ${r.call_type} on ${new Date(r.created_at).toLocaleDateString()} ---\n${r.analysis.slice(0, MAX_PRIOR_ANALYSIS_CHARS)}`
          )
          .join("\n\n");
        candidateContext = `${notesPart}${priorPart}`.trim();
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const res = await fetch("/api/assistant/rate-call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ call_type: callType, transcript: text, candidate_context: candidateContext }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Something went wrong.");
      }

      const { data: row, error: insertError } = await supabase
        .from("call_ratings")
        .insert({
          user_id: user.id,
          call_type: callType,
          candidate_id: candidate?.id ?? null,
          candidate_name: finalCandidateName,
          transcript: text,
          analysis: json.analysis,
          overall_score: json.overall_score,
        })
        .select("*")
        .single();

      if (insertError) {
        throw new Error(`Rated it, but couldn't save it: ${insertError.message}`);
      }

      const inserted = row as CallRating;
      setHistory((prev) => [inserted, ...prev]);
      setExpandedId(inserted.id);
      setTranscript("");
      setCandidateName("");
      setCallType("");
    };

    try {
      await Promise.race([run(), timeoutRejection(RATE_TIMEOUT_MS)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRating(false);
    }
  }

  return (
    <>
      <div className="card space-y-2">
        <p className="section-title">Rate a Call</p>
        <p className="text-xs text-slate-400">
          Paste the transcript of a recorded QI1, QI2, FU1, FU2, or Questionnaire call and
          it&apos;ll be scored against that meeting&apos;s vetting rubric — each stage covers
          different ground, so pick which one this is before rating. Your upline can see your
          ratings on the Team tab so they know how to help you.
        </p>
        <select
          className="input"
          value={callType}
          onChange={(e) => setCallType(e.target.value as CallRatingType | "")}
        >
          <option value="" disabled>
            Which meeting is this? (required)
          </option>
          {CALL_RATING_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={selectedCandidateId}
          onChange={(e) => setSelectedCandidateId(e.target.value)}
        >
          <option value="">Not on my Candidate list (type name below)</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {!selectedCandidateId && (
          <input
            className="input"
            placeholder="Candidate name (optional)"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
          />
        )}
        {selectedCandidateId && (
          <p className="text-xs text-slate-500">
            Linked to your Candidate list — prior ratings and notes for this person will be
            passed along so this and later ratings remember what came up in earlier meetings.
          </p>
        )}
        <textarea
          className="textarea"
          rows={8}
          placeholder="Paste the call transcript here…"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          className="btn-primary w-full"
          onClick={handleRate}
          disabled={rating || !transcript.trim() || !callType}
        >
          {rating ? "Rating…" : !callType ? "Select a meeting type first" : "Rate This Call"}
        </button>
      </div>

      <div className="card space-y-3">
        <p className="section-title">Your Ratings ({history.length})</p>
        {loadingHistory ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-400">No calls rated yet.</p>
        ) : (
          groupCallRatingsByType(history).map((group) => (
            <div key={group.type} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {group.type} ({group.items.length})
                </p>
                {group.avgScore !== null && (
                  <span className="pill">avg {group.avgScore.toFixed(1)}/10</span>
                )}
              </div>
              {group.items.map((h) => (
                <div key={h.id} className="rounded-lg bg-navy p-2.5">
                  <button
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                  >
                    <span className="truncate text-sm text-slate-200">
                      {h.candidate_name || "Untitled"}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                      {h.overall_score !== null && (
                        <span className="pill">{h.overall_score}/10</span>
                      )}
                      {new Date(h.created_at).toLocaleDateString()}
                    </span>
                  </button>
                  {expandedId === h.id && (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{h.analysis}</p>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}
