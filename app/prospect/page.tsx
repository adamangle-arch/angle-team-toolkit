"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { CANDIDATE_STEPS, CANDIDATE_STEP_RESOURCES } from "@/lib/constants";

type CandidateInfo = {
  candidate_id: string;
  candidate_name: string;
  current_step: number;
  launched: boolean;
  inviter_first_name: string | null;
  inviter_last_name: string | null;
};

type UpcomingEvent = {
  event_id: string;
  title: string;
  notes: string;
  event_at: string;
};

function formatEventAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Remembers a validated code on this device so a prospect doesn't have to
// retype it every time they check back for new resources - there's no
// real account/session here, just this one value.
const STORAGE_KEY = "atk_prospect_code";

export default function ProspectPage() {
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<CandidateInfo | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedStorage, setCheckedStorage] = useState(false);

  async function lookup(codeToTry: string, persist: boolean) {
    const trimmed = codeToTry.trim();
    if (!trimmed) return;
    setLoading(true);
    setFormError(null);
    const [{ data, error }, { data: eventRows }] = await Promise.all([
      supabase.rpc("get_candidate_by_access_code", { p_code: trimmed }).maybeSingle(),
      supabase.rpc("get_candidate_upcoming_events", { p_code: trimmed }),
    ]);
    setLoading(false);
    setCheckedStorage(true);
    if (error || !data) {
      setFormError("That code doesn't match anyone — double check it and try again.");
      if (persist) localStorage.removeItem(STORAGE_KEY);
      return;
    }
    setInfo(data as CandidateInfo);
    setEvents((eventRows as UpcomingEvent[]) ?? []);
    if (persist) localStorage.setItem(STORAGE_KEY, trimmed);
  }

  useEffect(() => {
    function init() {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setCode(saved);
        lookup(saved, false);
      } else {
        setCheckedStorage(true);
      }
    }
    init();
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    lookup(code, true);
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    setInfo(null);
    setCode("");
    setFormError(null);
  }

  if (!checkedStorage) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading…</div>
    );
  }

  if (!info) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">Angle Team Toolkit</p>
            <p className="text-sm text-slate-400">Enter the code you were sent to see your resources.</p>
          </div>
          <form onSubmit={handleSubmit} className="card space-y-3">
            <input
              className="input text-center text-lg uppercase tracking-[0.3em]"
              placeholder="CODE"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
            />
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <button className="btn-primary w-full" disabled={loading || !code.trim()}>
              {loading ? "Checking…" : "Continue"}
            </button>
          </form>
          <Link href="/dashboard" className="block w-full text-center text-xs text-slate-400">
            Already a team member? Sign in
          </Link>
        </div>
      </div>
    );
  }

  const inviterName =
    [info.inviter_first_name, info.inviter_last_name].filter(Boolean).join(" ") || "Your contact";
  const firstName = info.candidate_name.split(" ")[0] || info.candidate_name;

  const unlockedResources = CANDIDATE_STEP_RESOURCES.slice(0, info.current_step + 1).flatMap(
    (resources, step) => resources.map((r) => ({ ...r, step }))
  );

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">Hey {firstName}! 👋</h1>
        <p className="app-subtitle">Resources from {inviterName}</p>
      </header>
      <main className="page-main">
        {info.launched ? (
          <div className="card space-y-2 text-center !border-amber bg-amber/10">
            <p className="text-lg font-semibold text-white">🎉 You&apos;re in!</p>
            <p className="text-sm text-slate-300">
              Time to create your own account and get full access to the app.
            </p>
            <Link href="/dashboard" className="btn-primary block w-full">
              Create Your Account
            </Link>
          </div>
        ) : (
          <div className="card">
            <p className="section-title">
              Step {info.current_step + 1}/{CANDIDATE_STEPS.length}:{" "}
              {CANDIDATE_STEPS[info.current_step].label}
            </p>
          </div>
        )}

        {events.length > 0 && (
          <div className="space-y-1.5">
            <p className="section-title">📅 Upcoming</p>
            {events.map((e) => (
              <div key={e.event_id} className="card space-y-1">
                <p className="text-sm font-medium text-white">{e.title}</p>
                <p className="text-xs text-amber-light">{formatEventAt(e.event_at)}</p>
                {e.notes && <p className="text-xs text-slate-400">{e.notes}</p>}
              </div>
            ))}
          </div>
        )}

        {unlockedResources.length === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-400">Nothing here yet — check back soon.</p>
          </div>
        ) : (
          unlockedResources.map((r, i) => (
            <div key={i} className="card space-y-1">
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-amber-light underline decoration-dotted underline-offset-2"
                >
                  {r.label}
                </a>
              ) : (
                <p className="text-sm font-medium text-white">{r.label}</p>
              )}
              <p className="text-xs text-slate-400">{r.detail}</p>
            </div>
          ))
        )}

        <button className="w-full text-center text-xs text-slate-500" onClick={reset}>
          Not you? Enter a different code
        </button>
      </main>
    </>
  );
}
