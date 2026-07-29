"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  VIRTUAL_WEBINAR_SLOTS,
  effectiveResourcesForStep,
  type CandidateResourceOverrideEntry,
} from "@/lib/constants";
import { nextWebinarOccurrence, formatWebinarTime } from "@/lib/dates";

type SessionMode = "in_person" | "virtual" | null;

type CandidateInfo = {
  candidate_id: string;
  candidate_name: string;
  current_step: number;
  launched: boolean;
  inviter_first_name: string | null;
  inviter_last_name: string | null;
  is1_session_mode: SessionMode;
  is1_webinar_slot: string | null;
  is1_watched: boolean;
  is2_session_mode: SessionMode;
  is2_webinar_slot: string | null;
  is2_watched: boolean;
};

type InfoSessionFlyer = {
  image_url: string | null;
  speaker_name: string | null;
};

type UpcomingEvent = {
  event_id: string;
  title: string;
  notes: string;
  event_at: string;
};

type SpecificResource = {
  id: string;
  label: string;
  detail: string;
  url: string | null;
  estimate: string | null;
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
  const [overrides, setOverrides] = useState<CandidateResourceOverrideEntry[]>([]);
  const [specificResources, setSpecificResources] = useState<SpecificResource[]>([]);
  const [flyer, setFlyer] = useState<InfoSessionFlyer | null>(null);
  const [completedLabels, setCompletedLabels] = useState<Set<string>>(new Set());
  const [verifiedCode, setVerifiedCode] = useState("");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedStorage, setCheckedStorage] = useState(false);

  async function lookup(codeToTry: string, persist: boolean) {
    const trimmed = codeToTry.trim();
    if (!trimmed) return;
    setLoading(true);
    setFormError(null);
    const [
      { data, error },
      { data: eventRows },
      { data: overrideRows },
      { data: specificRows },
      { data: flyerRow },
      { data: completionRows },
    ] = await Promise.all([
      supabase.rpc("get_candidate_by_access_code", { p_code: trimmed }).maybeSingle(),
      supabase.rpc("get_candidate_upcoming_events", { p_code: trimmed }),
      supabase.rpc("get_candidate_resource_overrides", { p_code: trimmed }),
      supabase.rpc("get_candidate_specific_resources", { p_code: trimmed }),
      supabase.rpc("get_current_info_session_flyer").maybeSingle(),
      supabase.rpc("get_candidate_resource_completions", { p_code: trimmed }),
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
    setOverrides((overrideRows as CandidateResourceOverrideEntry[]) ?? []);
    setSpecificResources((specificRows as SpecificResource[]) ?? []);
    setFlyer((flyerRow as InfoSessionFlyer) ?? null);
    setCompletedLabels(
      new Set(((completionRows as { resource_label: string }[]) ?? []).map((r) => r.resource_label))
    );
    setVerifiedCode(trimmed);
    if (persist) localStorage.setItem(STORAGE_KEY, trimmed);
  }

  async function markWatched(step: "is1" | "is2") {
    if (!info) return;
    setSessionError(null);
    setInfo({ ...info, [step === "is1" ? "is1_watched" : "is2_watched"]: true });
    const { error } = await supabase.rpc("mark_candidate_virtual_watched", {
      p_code: verifiedCode,
      p_step: step,
    });
    if (error) setSessionError(error.message);
  }

  async function toggleResourceCompletion(label: string) {
    const wasCompleted = completedLabels.has(label);
    setCompletedLabels((prev) => {
      const next = new Set(prev);
      if (wasCompleted) next.delete(label);
      else next.add(label);
      return next;
    });
    const { error } = await supabase.rpc("toggle_candidate_resource_completion", {
      p_code: verifiedCode,
      p_label: label,
    });
    if (error) {
      setCompletedLabels((prev) => {
        const next = new Set(prev);
        if (wasCompleted) next.add(label);
        else next.delete(label);
        return next;
      });
    }
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

  const unlockedResources = Array.from({ length: info.current_step + 1 }, (_, step) => step).flatMap((step) =>
    effectiveResourcesForStep(step, overrides).map((r) => ({ ...r, step }))
  );

  // IS1 is step 3, IS2 is step 5 (see CANDIDATE_STEPS in lib/constants.ts)
  // - a candidate is only ever at one of them at a time.
  const infoSessionStep: "is1" | "is2" | null =
    info.current_step === 3 ? "is1" : info.current_step === 5 ? "is2" : null;

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">Hey {firstName}! 👋</h1>
        <p className="app-subtitle">Resources from {inviterName}</p>
      </header>
      <main className="page-main">
        {info.launched && (
          <div className="card space-y-2 text-center !border-amber bg-amber/10">
            <p className="text-lg font-semibold text-white">🎉 You&apos;re in!</p>
            <p className="text-sm text-slate-300">
              Time to create your own account and get full access to the app.
            </p>
            <Link href="/dashboard" className="btn-primary block w-full">
              Create Your Account
            </Link>
          </div>
        )}

        {infoSessionStep && (
          <InfoSessionCard
            mode={infoSessionStep === "is1" ? info.is1_session_mode : info.is2_session_mode}
            webinarSlot={infoSessionStep === "is1" ? info.is1_webinar_slot : info.is2_webinar_slot}
            watched={infoSessionStep === "is1" ? info.is1_watched : info.is2_watched}
            flyer={flyer}
            error={sessionError}
            onMarkWatched={() => markWatched(infoSessionStep)}
          />
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

        {specificResources.length > 0 && (
          <div className="space-y-1.5">
            <p className="section-title">🎁 Just For You</p>
            {specificResources.map((r) => (
              <ResourceRow
                key={r.id}
                label={r.label}
                detail={r.detail}
                url={r.url}
                estimate={r.estimate ?? undefined}
                completed={completedLabels.has(r.label)}
                onToggle={() => toggleResourceCompletion(r.label)}
              />
            ))}
          </div>
        )}

        {!info.launched && unlockedResources.length > 0 && (
          <div className="card space-y-1.5 !border-amber bg-amber/10">
            <p className="text-sm font-semibold text-white">📋 Before You Meet Again</p>
            <p className="text-xs text-slate-300">
              Make sure you&apos;ve gone through everything below before you catch back up with{" "}
              {inviterName}. You&apos;ll keep getting more resources like these as you move through
              this process — they&apos;re here to inform you, but they&apos;re also part of how we
              gauge how serious someone is about this. Coming back having actually done the work
              says a lot.
            </p>
          </div>
        )}

        {unlockedResources.length === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-400">Nothing here yet — check back soon.</p>
          </div>
        ) : (
          unlockedResources.map((r, i) => (
            <ResourceRow
              key={i}
              label={r.label}
              detail={r.detail}
              url={r.url}
              estimate={r.estimate}
              completed={completedLabels.has(r.label)}
              onToggle={() => toggleResourceCompletion(r.label)}
            />
          ))
        )}

        <button className="w-full text-center text-xs text-slate-500" onClick={reset}>
          Not you? Enter a different code
        </button>
      </main>
    </>
  );
}

// The IBO decides in-person vs. virtual (and, for virtual, which specific
// webinar) from the Candidate Roadmap - not asked here, since the
// candidate doesn't know the jargon and the IBO is the one who actually
// knows how the conversation with them went. This card is read-only
// except for "I've watched it," which only the candidate can honestly
// report.
function InfoSessionCard({
  mode,
  webinarSlot,
  watched,
  flyer,
  error,
  onMarkWatched,
}: {
  mode: SessionMode;
  webinarSlot: string | null;
  watched: boolean;
  flyer: InfoSessionFlyer | null;
  error: string | null;
  onMarkWatched: () => void;
}) {
  if (watched) {
    return (
      <div className="card text-center">
        <p className="text-sm font-semibold text-white">✅ Info Session complete</p>
      </div>
    );
  }

  if (mode === null) return null;

  const selectedSlot = webinarSlot ? VIRTUAL_WEBINAR_SLOTS.find((s) => s.key === webinarSlot) ?? null : null;

  return (
    <div className="card space-y-3">
      <p className="section-title">🎤 Info Session</p>

      {mode === "in_person" &&
        (flyer?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flyer.image_url} alt="This week's Info Session" className="w-full rounded-xl" />
        ) : (
          <p className="text-sm text-slate-400">Details for this week&apos;s session are coming soon.</p>
        ))}

      {mode === "virtual" && !selectedSlot && (
        <p className="text-sm text-slate-400">
          Your contact will send you the specific time for this soon.
        </p>
      )}

      {mode === "virtual" && selectedSlot && (
        <>
          <p className="text-sm text-slate-300">
            You&apos;re registered with <span className="font-semibold text-white">{selectedSlot.presenter}</span> —
            next up {formatWebinarTime(nextWebinarOccurrence(selectedSlot))}.
          </p>
          <a
            href={selectedSlot.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary block w-full text-center"
          >
            Join the Webinar
          </a>
          <button className="btn-secondary w-full" onClick={onMarkWatched}>
            I&apos;ve watched it ✅
          </button>
        </>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// Lets the candidate check a resource off as done - a plain toggle (not
// a one-way lock like Info Session's "watched"), since unchecking a
// mis-tap should be just as easy as checking it. Completion is keyed by
// label (see candidate_resource_completions in supabase/schema.sql), so
// it works the same whether the resource is a team-wide default, a
// per-IBO addition, or a one-off "Just For You" send.
function ResourceRow({
  label,
  detail,
  url,
  estimate,
  completed,
  onToggle,
}: {
  label: string;
  detail: string;
  url?: string | null;
  estimate?: string;
  completed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`card flex items-start gap-3 ${completed ? "opacity-60" : ""}`}>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 accent-amber"
        checked={completed}
        onChange={onToggle}
        aria-label={completed ? `Mark "${label}" as not done` : `Mark "${label}" as done`}
      />
      <div className="min-w-0 flex-1 space-y-1">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm font-medium underline decoration-dotted underline-offset-2 ${
              completed ? "text-slate-400 line-through" : "text-amber-light"
            }`}
          >
            {label}
          </a>
        ) : (
          <p className={`text-sm font-medium ${completed ? "text-slate-400 line-through" : "text-white"}`}>
            {label}
          </p>
        )}
        <p className="text-xs text-slate-400">
          {detail}
          {estimate && <span className="text-slate-500"> · {estimate}</span>}
        </p>
      </div>
    </div>
  );
}
