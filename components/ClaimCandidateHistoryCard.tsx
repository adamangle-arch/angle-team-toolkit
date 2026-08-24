"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, GraduationCap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { QUESTIONNAIRE_QUESTIONS } from "@/lib/constants";

type ClaimedCandidate = {
  candidate_name: string;
  is1_watched: boolean;
  is2_watched: boolean;
  fu1_video_watched: boolean;
};

type ClaimedResource = {
  id: string;
  label: string;
  detail: string;
  url: string | null;
  estimate: string | null;
};

type QuestionnaireResponses = {
  response_1: string;
  response_2: string;
  response_3: string;
  response_4: string;
  response_5: string;
  response_6: string;
  response_7: string;
  response_8: string;
  response_9: string;
};

// Pre-launch stuff (extra resources an IBO sent them one-off, Pre-Launch
// Questionnaire answers, which resources they'd checked off, IS1/IS2/
// FU1-video watched state) all lives keyed by candidate_id with no link
// to the profiles row a new IBO gets once they actually launch - see
// claim_candidate_history() in schema.sql. Once claimed, this reads that
// history through the exact same anon-callable /prospect RPCs the
// candidate view itself uses, just fed the claimed code instead of one
// typed in live.
export default function ClaimCandidateHistoryCard() {
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [candidate, setCandidate] = useState<ClaimedCandidate | null>(null);
  const [resources, setResources] = useState<ClaimedResource[]>([]);
  const [completedLabels, setCompletedLabels] = useState<Set<string>>(new Set());
  const [responses, setResponses] = useState<QuestionnaireResponses | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function load() {
      const { data: claimedCode } = await supabase.rpc("get_my_claimed_candidate_code");
      if (!claimedCode) {
        setLoading(false);
        return;
      }
      setCode(claimedCode as string);
      const [{ data: info }, { data: res }, { data: completions }, { data: qResponses }] = await Promise.all([
        supabase.rpc("get_candidate_by_access_code", { p_code: claimedCode }).maybeSingle(),
        supabase.rpc("get_candidate_specific_resources", { p_code: claimedCode }),
        supabase.rpc("get_candidate_resource_completions", { p_code: claimedCode }),
        supabase.rpc("get_candidate_questionnaire_responses", { p_code: claimedCode }).maybeSingle(),
      ]);
      setCandidate((info as ClaimedCandidate) ?? null);
      setResources((res as ClaimedResource[]) ?? []);
      setCompletedLabels(
        new Set(((completions as { resource_label: string }[]) ?? []).map((r) => r.resource_label))
      );
      setResponses((qResponses as QuestionnaireResponses) ?? null);
      setLoading(false);
    }
    load();
  }, [refreshKey]);

  async function claim() {
    const trimmed = inputCode.trim();
    if (!trimmed) return;
    setClaiming(true);
    setError(null);
    const { error } = await supabase.rpc("claim_candidate_history", { p_code: trimmed });
    setClaiming(false);
    if (error) {
      setError(error.message);
      return;
    }
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }

  if (loading) return null;

  if (!code) {
    return (
      <div className="card space-y-2">
        <p className="section-title flex items-center gap-1.5">
          <GraduationCap className="h-4 w-4" aria-hidden />
          Claim Your Candidate History
        </p>
        <p className="text-xs text-slate-400">
          Were you sent resources, or did you fill out the Pre-Launch Questionnaire, before you
          launched? Enter the access code from that link and it&apos;ll all show up here.
        </p>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-center uppercase tracking-[0.2em]"
            placeholder="CODE"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            maxLength={6}
          />
          <button
            type="button"
            className="btn-secondary shrink-0"
            onClick={claim}
            disabled={claiming || !inputCode.trim()}
          >
            {claiming ? "Claiming..." : "Claim"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  const answeredQuestions = responses
    ? QUESTIONNAIRE_QUESTIONS.map((q, i) => ({
        question: q,
        answer: responses[`response_${i + 1}` as keyof QuestionnaireResponses],
      })).filter((entry) => entry.answer.trim().length > 0)
    : [];

  return (
    <div className="card space-y-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <p className="section-title flex items-center gap-1.5">
          <GraduationCap className="h-4 w-4" aria-hidden />
          Your Candidate History{candidate ? ` — ${candidate.candidate_name}` : ""}
        </p>
        <span className="shrink-0 text-slate-500">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <>
          {candidate && (
            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
              {candidate.is1_watched && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" aria-hidden /> IS1 watched
                </span>
              )}
              {candidate.is2_watched && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" aria-hidden /> IS2 watched
                </span>
              )}
              {candidate.fu1_video_watched && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" aria-hidden /> &quot;How Does an IBO Earn Income&quot;
                  watched
                </span>
              )}
            </div>
          )}

          {resources.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-300">Resources you were sent</p>
              {resources.map((r) => (
                <a
                  key={r.id}
                  href={r.url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block text-sm ${
                    completedLabels.has(r.label) ? "text-slate-500 line-through" : "text-amber-light underline"
                  }`}
                >
                  {r.label}
                </a>
              ))}
            </div>
          )}

          {answeredQuestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-300">Your Pre-Launch Questionnaire answers</p>
              {answeredQuestions.map((entry, i) => (
                <div key={i} className="space-y-0.5">
                  <p className="text-xs text-slate-400">{entry.question}</p>
                  <p className="text-sm text-slate-200">{entry.answer}</p>
                </div>
              ))}
            </div>
          )}

          {resources.length === 0 && answeredQuestions.length === 0 && !candidate?.is1_watched && (
            <p className="text-sm text-slate-400">Nothing on record for this code yet.</p>
          )}
        </>
      )}
    </div>
  );
}
