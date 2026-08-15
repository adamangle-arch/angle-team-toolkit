"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fireNotifyEvent } from "@/lib/notifyClient";
import type { CallRatingType } from "@/lib/constants";
import type { CallRating } from "@/lib/types";

type RatingJobStatus = "running" | "done" | "error";

export type RatingJob = {
  id: string;
  callType: CallRatingType;
  candidateName: string;
  status: RatingJobStatus;
  result?: CallRating;
  error?: string;
};

type SubmitRatingInput = {
  userId: string;
  callType: CallRatingType;
  transcript: string;
  candidateId: string | null;
  candidateName: string;
  candidateContext: string;
  growthContext: string;
};

type RatingJobsContextValue = {
  jobs: RatingJob[];
  submitRating: (input: SubmitRatingInput) => string;
  dismissJob: (id: string) => void;
};

const RatingJobsContext = createContext<RatingJobsContextValue | null>(null);

export function useRatingJobs(): RatingJobsContextValue {
  const ctx = useContext(RatingJobsContext);
  if (!ctx) throw new Error("useRatingJobs must be used within RatingJobsProvider");
  return ctx;
}

// "Load failed" (Safari/WebKit) and "Failed to fetch" (Chromium) are the
// browser's own wording for a request whose connection dropped outright,
// usually transient on mobile (a signal dip, or iOS suspending the
// request while the screen locks) and worth one silent retry.
function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError && /load failed|failed to fetch|network/i.test(err.message);
}

// A rating job must never hang forever in the background with nothing to
// show for it - if generation genuinely stalls, the job still needs to
// resolve into a visible error eventually.
const JOB_TIMEOUT_MS = 90_000;

function timeoutRejection(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("That took too long and timed out — check your connection and try again.")), ms)
  );
}

// Rating a call used to run entirely inside CallRatingPanel's own local
// state, so navigating to another tab while it was in flight unmounted
// the component and threw the in-progress request away entirely - the
// same operation that runs fine for 60+ seconds server-side got killed
// client-side the moment you looked at anything else. This provider lives
// at the app root (mounted once in AuthGate, never torn down by page
// navigation) so a submitted rating keeps running and gets saved no
// matter what page is on screen when it finishes.
export default function RatingJobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<RatingJob[]>([]);

  const submitRating = useCallback((input: SubmitRatingInput): string => {
    const id = crypto.randomUUID();
    setJobs((prev) => [
      ...prev,
      { id, callType: input.callType, candidateName: input.candidateName || "Untitled", status: "running" },
    ]);

    function updateJob(patch: Partial<RatingJob>) {
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
    }

    async function run(): Promise<CallRating> {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const res = await fetch("/api/assistant/rate-call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          call_type: input.callType,
          transcript: input.transcript,
          candidate_context: input.candidateContext,
          rep_growth_context: input.growthContext,
        }),
      });

      // A killed/timed-out function (or any platform-level failure that
      // never reaches our route handler) comes back as a non-JSON body -
      // an HTML error page, or nothing at all. res.json() on that throws a
      // raw, cryptic native exception (Safari's wording for this is
      // literally "The string did not match the expected pattern.", which
      // reads like nonsense to a rep with zero context). Parse as text
      // first so a real failure here always surfaces a clear message
      // instead of an inscrutable one.
      const bodyText = await res.text();
      let json: { error?: string; analysis?: string; overall_score?: number | null };
      try {
        json = JSON.parse(bodyText);
      } catch {
        throw new Error(
          res.ok
            ? "Got an unreadable response from the server. Please try again."
            : `The server didn't respond properly (status ${res.status}). Please try again.`
        );
      }
      if (!res.ok) {
        throw new Error(json.error || "Something went wrong.");
      }

      const { data: row, error: insertError } = await supabase
        .from("call_ratings")
        .insert({
          user_id: input.userId,
          call_type: input.callType,
          candidate_id: input.candidateId,
          candidate_name: input.candidateName,
          transcript: input.transcript,
          analysis: json.analysis,
          overall_score: json.overall_score,
        })
        .select("*")
        .single();

      if (insertError) {
        throw new Error(`Rated it, but couldn't save it: ${insertError.message}`);
      }
      fireNotifyEvent({
        kind: "call_rating_submitted",
        candidateName: input.candidateName || "a candidate",
        callType: input.callType,
        overallScore: json.overall_score ?? null,
      });
      return row as CallRating;
    }

    (async () => {
      try {
        let result: CallRating;
        try {
          result = await Promise.race([run(), timeoutRejection(JOB_TIMEOUT_MS)]);
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
          await new Promise((resolve) => setTimeout(resolve, 1500));
          result = await Promise.race([run(), timeoutRejection(JOB_TIMEOUT_MS)]);
        }
        updateJob({ status: "done", result });
      } catch (err) {
        updateJob({
          status: "error",
          error:
            err instanceof Error
              ? err.message
              : "Something went wrong.",
        });
      }
    })();

    return id;
  }, []);

  const dismissJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  return (
    <RatingJobsContext.Provider value={{ jobs, submitRating, dismissJob }}>
      {children}
      <RatingJobsBanner jobs={jobs} onDismiss={dismissJob} />
    </RatingJobsContext.Provider>
  );
}

function RatingJobsBanner({ jobs, onDismiss }: { jobs: RatingJob[]; onDismiss: (id: string) => void }) {
  if (jobs.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-1.5 px-4">
      {jobs.map((job) => (
        <RatingJobRow key={job.id} job={job} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// Finished jobs (done or error) auto-dismiss a few seconds after landing
// so this doesn't turn into a permanent banner that has to be manually
// swiped away every time - but stay tappable-to-dismiss early in case the
// rep wants it gone sooner.
function RatingJobRow({ job, onDismiss }: { job: RatingJob; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (job.status === "running") return;
    const timer = setTimeout(() => onDismiss(job.id), 6000);
    return () => clearTimeout(timer);
  }, [job.status, job.id, onDismiss]);

  return (
    <button
      type="button"
      onClick={() => onDismiss(job.id)}
      className="card pointer-events-auto flex w-full max-w-md items-center gap-2 !p-2.5 text-left shadow-lg"
    >
      {job.status === "running" && (
        <>
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-amber" />
          <span className="text-xs text-slate-300">
            Rating {job.candidateName}&apos;s {job.callType} call in the background…
          </span>
        </>
      )}
      {job.status === "done" && (
        <>
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
          <span className="text-xs text-slate-200">
            Rated {job.candidateName}&apos;s {job.callType} call
            {job.result?.overall_score != null ? ` — ${job.result.overall_score.toFixed(1)}/10` : ""}
          </span>
        </>
      )}
      {job.status === "error" && (
        <>
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
          <span className="text-xs text-red-400">
            Couldn&apos;t rate {job.candidateName}&apos;s {job.callType} call — {job.error}
          </span>
        </>
      )}
    </button>
  );
}
