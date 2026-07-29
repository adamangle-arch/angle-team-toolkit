"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  CANDIDATE_STEP_RESOURCES,
  VIRTUAL_WEBINAR_SLOTS,
  type CandidateStepResource,
  type WebinarSlot,
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

type ResourceOverride = {
  step: number;
  action: "add" | "remove";
  label: string;
  detail: string;
  url: string | null;
};

type SpecificResource = {
  id: string;
  label: string;
  detail: string;
  url: string | null;
};

// Merges this candidate's owner's own customizations (see the "Candidate
// Resources" section of the Resources tab) into the team-wide defaults -
// a "remove" hides a default with that exact label for this step, an
// "add" is a resource this owner tacked on beyond the defaults.
function effectiveResourcesForStep(step: number, overrides: ResourceOverride[]): CandidateStepResource[] {
  const removedLabels = new Set(
    overrides.filter((o) => o.step === step && o.action === "remove").map((o) => o.label)
  );
  const defaults = CANDIDATE_STEP_RESOURCES[step].filter((r) => !removedLabels.has(r.label));
  const added = overrides
    .filter((o) => o.step === step && o.action === "add")
    .map((o) => ({ label: o.label, detail: o.detail, url: o.url ?? undefined }));
  return [...defaults, ...added];
}

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
  const [overrides, setOverrides] = useState<ResourceOverride[]>([]);
  const [specificResources, setSpecificResources] = useState<SpecificResource[]>([]);
  const [flyer, setFlyer] = useState<InfoSessionFlyer | null>(null);
  const [verifiedCode, setVerifiedCode] = useState("");
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedStorage, setCheckedStorage] = useState(false);

  // Fixed weekly recurring slots, so "next 4" only changes with the
  // calendar, not with anything about this candidate - safe to compute
  // once up front rather than after the early returns below (hooks must
  // run in the same order on every render).
  const nextWebinarSlots = useMemo(
    () =>
      VIRTUAL_WEBINAR_SLOTS.map((slot) => ({ slot, at: nextWebinarOccurrence(slot) }))
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .slice(0, 4),
    []
  );

  async function lookup(codeToTry: string, persist: boolean) {
    const trimmed = codeToTry.trim();
    if (!trimmed) return;
    setLoading(true);
    setFormError(null);
    const [{ data, error }, { data: eventRows }, { data: overrideRows }, { data: specificRows }, { data: flyerRow }] =
      await Promise.all([
        supabase.rpc("get_candidate_by_access_code", { p_code: trimmed }).maybeSingle(),
        supabase.rpc("get_candidate_upcoming_events", { p_code: trimmed }),
        supabase.rpc("get_candidate_resource_overrides", { p_code: trimmed }),
        supabase.rpc("get_candidate_specific_resources", { p_code: trimmed }),
        supabase.rpc("get_current_info_session_flyer").maybeSingle(),
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
    setOverrides((overrideRows as ResourceOverride[]) ?? []);
    setSpecificResources((specificRows as SpecificResource[]) ?? []);
    setFlyer((flyerRow as InfoSessionFlyer) ?? null);
    setVerifiedCode(trimmed);
    if (persist) localStorage.setItem(STORAGE_KEY, trimmed);
  }

  async function setSessionMode(step: "is1" | "is2", mode: "in_person" | "virtual") {
    if (!info) return;
    setSessionError(null);
    setInfo({ ...info, [step === "is1" ? "is1_session_mode" : "is2_session_mode"]: mode });
    const { error } = await supabase.rpc("set_candidate_info_session_mode", {
      p_code: verifiedCode,
      p_step: step,
      p_mode: mode,
    });
    if (error) setSessionError(error.message);
  }

  async function selectWebinar(step: "is1" | "is2", slotKey: string) {
    setSessionError(null);
    setSessionSaving(true);
    const { data, error } = await supabase.rpc("select_candidate_virtual_webinar", {
      p_code: verifiedCode,
      p_step: step,
      p_slot_key: slotKey,
    });
    setSessionSaving(false);
    if (error) {
      setSessionError(error.message);
      return;
    }
    if (!data) {
      setSessionError("That didn't go through — try refreshing the page.");
      return;
    }
    if (!info) return;
    setInfo({ ...info, [step === "is1" ? "is1_webinar_slot" : "is2_webinar_slot"]: slotKey });
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
            nextSlots={nextWebinarSlots}
            saving={sessionSaving}
            error={sessionError}
            onSetMode={(mode) => setSessionMode(infoSessionStep, mode)}
            onSelectWebinar={(slotKey) => selectWebinar(infoSessionStep, slotKey)}
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
              <div key={r.id} className="card space-y-1">
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

function InfoSessionCard({
  mode,
  webinarSlot,
  watched,
  flyer,
  nextSlots,
  saving,
  error,
  onSetMode,
  onSelectWebinar,
  onMarkWatched,
}: {
  mode: SessionMode;
  webinarSlot: string | null;
  watched: boolean;
  flyer: InfoSessionFlyer | null;
  nextSlots: { slot: WebinarSlot; at: Date }[];
  saving: boolean;
  error: string | null;
  onSetMode: (mode: "in_person" | "virtual") => void;
  onSelectWebinar: (slotKey: string) => void;
  onMarkWatched: () => void;
}) {
  if (watched) {
    return (
      <div className="card text-center">
        <p className="text-sm font-semibold text-white">✅ Info Session complete</p>
      </div>
    );
  }

  const selectedSlot = webinarSlot ? VIRTUAL_WEBINAR_SLOTS.find((s) => s.key === webinarSlot) ?? null : null;

  return (
    <div className="card space-y-3">
      <p className="section-title">🎤 Info Session</p>

      {mode === null && (
        <>
          <p className="text-sm text-slate-300">Will you be there in person, or watching virtually?</p>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => onSetMode("in_person")}>
              🏢 In Person
            </button>
            <button className="btn-secondary flex-1" onClick={() => onSetMode("virtual")}>
              💻 Virtual
            </button>
          </div>
        </>
      )}

      {mode === "in_person" && (
        <>
          {flyer?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flyer.image_url} alt="This week's Info Session" className="w-full rounded-xl" />
          ) : (
            <p className="text-sm text-slate-400">Details for this week&apos;s session are coming soon.</p>
          )}
          <button className="w-full text-center text-xs text-slate-500" onClick={() => onSetMode("virtual")}>
            Watching virtually instead? Tap here
          </button>
        </>
      )}

      {mode === "virtual" && !selectedSlot && (
        <>
          <p className="text-sm text-slate-300">Pick whichever time works best for you:</p>
          <div className="space-y-1.5">
            {nextSlots.map(({ slot, at }) => (
              <button
                key={slot.key}
                className="btn-secondary flex w-full items-center justify-between"
                onClick={() => onSelectWebinar(slot.key)}
                disabled={saving}
              >
                <span>{slot.presenter}</span>
                <span className="text-xs text-slate-400">{formatWebinarTime(at)}</span>
              </button>
            ))}
          </div>
          <button className="w-full text-center text-xs text-slate-500" onClick={() => onSetMode("in_person")}>
            Coming in person instead? Tap here
          </button>
        </>
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
