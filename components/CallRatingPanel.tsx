"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthGate";
import { useRatingJobs } from "@/components/RatingJobsProvider";
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

// Same idea, but across every candidate of this call type — this is what
// lets the model comment on the rep's own growth ("still doing X you did
// last time" / "score is trending up") instead of judging each call in
// total isolation.
const MAX_GROWTH_RATINGS = 4;

export default function CallRatingPanel() {
  const { user } = useAuth();
  const { jobs, submitRating } = useRatingJobs();
  const [callType, setCallType] = useState<CallRatingType | "">("");
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Job ids this panel instance has submitted, so it can react when one of
  // them finishes - the job itself keeps running in RatingJobsProvider
  // (mounted at the app root) even if this panel unmounts because the rep
  // switched pages, so this list only matters while this panel is up.
  const [myJobIds, setMyJobIds] = useState<string[]>([]);

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

  const myRunningJobs = jobs.filter((j) => myJobIds.includes(j.id) && j.status === "running");

  // React to jobs this panel submitted finishing - whether that happens
  // while this panel is still mounted (updates History in place, right
  // here) or the rep already moved to another page (RatingJobsProvider's
  // banner is what tells them then; this panel just picks up the result
  // from Supabase next time it mounts). This is exactly the "subscribe to
  // an external system and setState when it changes" case the lint rule
  // itself calls out as fine, so it's disabled below rather than restructured.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (myJobIds.length === 0) return;
    const mine = jobs.filter((j) => myJobIds.includes(j.id) && j.status !== "running");
    if (mine.length === 0) return;

    for (const job of mine) {
      if (job.status === "done" && job.result) {
        setHistory((prev) => (prev.some((h) => h.id === job.result!.id) ? prev : [job.result!, ...prev]));
        setExpandedId(job.result.id);
      } else if (job.status === "error") {
        setError(job.error ?? "Something went wrong.");
      }
    }
    setMyJobIds((prev) => prev.filter((id) => !mine.some((j) => j.id === id)));
  }, [jobs, myJobIds]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleRate() {
    const text = transcript.trim();
    if (!text || !callType || submitting) return;
    setError(null);
    setSubmitting(true);

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
      const prior = ((priorRows as { call_type: string; analysis: string; created_at: string }[]) ?? [])
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

    // The rep's own last few ratings of this same call type, regardless of
    // candidate — already sitting in `history` from this panel's initial
    // load, so no extra query needed. Oldest-first, same ordering as the
    // candidate-specific context above, so the write-up reads as a
    // timeline rather than most-recent-first.
    const growthContext = history
      .filter((h) => h.call_type === callType)
      .slice(0, MAX_GROWTH_RATINGS)
      .slice()
      .reverse()
      .map(
        (r) =>
          `--- ${r.call_type} on ${new Date(r.created_at).toLocaleDateString()}, scored ${r.overall_score ?? "—"}/10 ---\n${(r.analysis || "").slice(0, MAX_PRIOR_ANALYSIS_CHARS)}`
      )
      .join("\n\n");

    // Hand the actual rating off to RatingJobsProvider (mounted at the app
    // root) and clear the form right away - the job now runs independently
    // of this panel, so there's nothing left here to wait on. It'll keep
    // going, get saved, and show up in History even if this page is long
    // gone by the time it finishes.
    const jobId = submitRating({
      userId: user.id,
      callType,
      transcript: text,
      candidateId: candidate?.id ?? null,
      candidateName: finalCandidateName,
      candidateContext,
      growthContext,
    });
    setMyJobIds((prev) => [...prev, jobId]);
    setTranscript("");
    setCandidateName("");
    setCallType("");
    setSubmitting(false);
  }

  async function handleDeleteRating(id: string) {
    setHistory((prev) => prev.filter((h) => h.id !== id));
    if (expandedId === id) setExpandedId(null);
    await supabase.from("call_ratings").delete().eq("id", id);
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
          disabled={submitting || !transcript.trim() || !callType}
        >
          {!callType ? "Select a meeting type first" : "Rate This Call"}
        </button>
        <p className="text-center text-xs text-slate-500">
          Ratings run in the background — feel free to switch tabs, it&apos;ll keep going and land
          in Your Ratings (with a heads-up banner) whenever it&apos;s done.
        </p>
      </div>

      {myRunningJobs.length > 0 && (
        <div className="card space-y-1">
          {myRunningJobs.map((job) => (
            <div key={job.id} className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-amber" />
              <p className="text-xs text-slate-400">
                Analyzing {job.candidateName}&apos;s {job.callType} call against the rubric — a
                detailed call can take up to a minute.
              </p>
            </div>
          ))}
        </div>
      )}

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
                  <div className="flex w-full items-center justify-between gap-2">
                    <button
                      className="flex flex-1 items-center justify-between gap-2 text-left"
                      onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                    >
                      <span className="truncate text-sm text-slate-200">
                        {h.candidate_name || "Untitled"}
                        {!h.analysis.trim() && (
                          <span className="ml-1 text-red-400">(no result — try re-rating)</span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                        {h.overall_score !== null && (
                          <span className="pill">{h.overall_score.toFixed(1)}/10</span>
                        )}
                        {new Date(h.created_at).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      className="shrink-0 text-sm text-slate-500"
                      onClick={() => handleDeleteRating(h.id)}
                      aria-label="Delete rating"
                    >
                      ✕
                    </button>
                  </div>
                  {expandedId === h.id && (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-slate-300">
                      {h.analysis}
                    </p>
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
