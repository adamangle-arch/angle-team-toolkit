"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import {
  ONBOARDING_SESSIONS,
  SESSION_4_CONTACT_MINIMUM,
  SESSION_4_READING_REQUIREMENT,
  effectiveResourcesForSession,
  isPrimaryUser,
  type OnboardingResourceOverrideEntry,
} from "@/lib/constants";
import type { MemberResource } from "@/lib/types";

// A resource url starting with "/" is a link to somewhere else in the
// app (e.g. a Resources tab) rather than an external video/doc link -
// those should navigate in-app via next/link instead of opening a new
// browser tab.
function isInternalLink(url: string): boolean {
  return url.startsWith("/");
}

// One icon + gradient per session, index-matched to ONBOARDING_SESSIONS
// - same "colorful module card" language the Home hub's tiles already
// use, just five fixed entries instead of a cycled palette since there
// are always exactly five sessions.
const SESSION_STYLE: { icon: string; from: string; to: string }[] = [
  { icon: "💰", from: "#6ee7b7", to: "#047857" }, // Budget Session
  { icon: "📋", from: "#7dd3fc", to: "#0369a1" }, // List Building
  { icon: "🛍️", from: "#c4b5fd", to: "#6d28d9" }, // Customers
  { icon: "💬", from: "#fda4af", to: "#be123c" }, // Sharing Your Story
  { icon: "🔥", from: "#fde68a", to: "#b45309" }, // 30-Day Core Run
];

function ProgressBar({ pct, size = "sm" }: { pct: number; size?: "sm" | "lg" }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-white/10 ${size === "lg" ? "h-3.5" : "h-2"}`}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: "linear-gradient(135deg, var(--color-amber-light), var(--color-amber))",
        }}
      />
    </div>
  );
}

export default function OnboardingPage() {
  const { user, ownerId, onboardingComplete } = useAuth();
  const isAdmin = isPrimaryUser(user.email);
  const [unlockedThrough, setUnlockedThrough] = useState(1);
  const [networkContactCount, setNetworkContactCount] = useState(0);
  const [chaptersConfirmed, setChaptersConfirmed] = useState(false);
  const [confirmingChapters, setConfirmingChapters] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [resourceOverrides, setResourceOverrides] = useState<OnboardingResourceOverrideEntry[]>([]);
  const [sentResources, setSentResources] = useState<MemberResource[]>([]);
  // Keyed "session:label" rather than just the label - unlike the
  // candidate flow (one resource list at a time), a member can have the
  // same label reused across different sessions in theory, and this
  // avoids assuming otherwise.
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // Collapsed by default - three full screenshots made this the tallest
  // thing on the page even though most visits don't need it open.
  const [showLtdMediaGuide, setShowLtdMediaGuide] = useState(false);
  const [showLtdMessagingGuide, setShowLtdMessagingGuide] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: profileData }, { count }, { data: overrideRows }, { data: sentRows }, { data: completionRows }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("onboarding_unlocked_through,thinking_big_chapters_confirmed")
            .eq("id", user.id)
            .single(),
          supabase
            .from("contacts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", ownerId)
            .in("category", ["A", "B"]),
          supabase.from("onboarding_resource_overrides").select("*").eq("user_id", ownerId),
          supabase
            .from("member_resources")
            .select("*")
            .eq("recipient_id", user.id)
            .order("created_at", { ascending: true }),
          supabase.from("onboarding_resource_completions").select("session,resource_label").eq("user_id", user.id),
        ]);
      if (!cancelled) {
        setUnlockedThrough(profileData?.onboarding_unlocked_through ?? 1);
        setChaptersConfirmed(profileData?.thinking_big_chapters_confirmed ?? false);
        setNetworkContactCount(count ?? 0);
        setResourceOverrides((overrideRows as OnboardingResourceOverrideEntry[]) ?? []);
        setSentResources((sentRows as MemberResource[]) ?? []);
        setCompletedKeys(
          new Set(
            ((completionRows as { session: number; resource_label: string }[]) ?? []).map(
              (r) => `${r.session}:${r.resource_label}`
            )
          )
        );
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user.id, ownerId]);

  async function dismissSentResource(id: string) {
    const previous = sentResources;
    setSentResources((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("member_resources").delete().eq("id", id);
    if (error) setSentResources(previous);
  }

  async function toggleChaptersConfirmed() {
    const next = !chaptersConfirmed;
    setChaptersConfirmed(next);
    setConfirmingChapters(true);
    setConfirmError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ thinking_big_chapters_confirmed: next })
      .eq("id", user.id);
    if (error) {
      // Roll back the optimistic checkbox - otherwise this would show
      // "confirmed" for a requirement that never actually saved.
      setChaptersConfirmed(!next);
      setConfirmError(error.message);
    }
    setConfirmingChapters(false);
  }

  async function toggleResourceComplete(session: number, label: string) {
    const key = `${session}:${label}`;
    const wasDone = completedKeys.has(key);
    const previous = completedKeys;
    const next = new Set(completedKeys);
    if (wasDone) next.delete(key);
    else next.add(key);
    setCompletedKeys(next);

    const { error } = wasDone
      ? await supabase
          .from("onboarding_resource_completions")
          .delete()
          .eq("user_id", user.id)
          .eq("session", session)
          .eq("resource_label", label)
      : await supabase
          .from("onboarding_resource_completions")
          .insert({ user_id: user.id, session, resource_label: label });
    if (error) setCompletedKeys(previous);
  }

  const unlockedCount = isAdmin
    ? ONBOARDING_SESSIONS.length
    : Math.min(unlockedThrough, ONBOARDING_SESSIONS.length);

  // Resource-level completion across everything actually reachable right
  // now (not the still-locked sessions further down) - the top-of-page
  // progress bar, distinct from the "X/Y sessions unlocked" subtitle
  // which is about gating, not how much of what's unlocked is done.
  let overallTotal = 0;
  let overallDone = 0;
  for (let i = 0; i < unlockedCount; i++) {
    const sessionNumber = i + 1;
    const resources = effectiveResourcesForSession(
      sessionNumber,
      ONBOARDING_SESSIONS[i].resources,
      resourceOverrides
    );
    overallTotal += resources.length;
    overallDone += resources.filter((r) => completedKeys.has(`${sessionNumber}:${r.label}`)).length;
  }
  const overallPct = overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;

  // TEMPORARY: lets an admin preview a locked-down onboarding tier in
  // their own browser (see AuthGate's atk_debug_unlock sessionStorage
  // override) without touching their real onboarding_unlocked_through
  // row. This page is always reachable at every tier, so it's a safe
  // place to switch back to "Full" too. Remove this card (and the
  // override in AuthGate) once testing is done.
  const debugTier = typeof window !== "undefined" ? sessionStorage.getItem("atk_debug_unlock") : null;
  function previewTier(tier: number | null) {
    if (tier === null) sessionStorage.removeItem("atk_debug_unlock");
    else sessionStorage.setItem("atk_debug_unlock", String(tier));
    location.reload();
  }

  return (
    <>
      <PageHeader
        title="Classroom"
        subtitle={`${unlockedCount}/${ONBOARDING_SESSIONS.length} sessions unlocked`}
      />
      <main className="page-main">
        {!loading && overallTotal > 0 && (
          <div
            className="space-y-3 rounded-2xl border p-5"
            style={{
              background: "rgb(var(--amber-rgb) / 0.1)",
              borderColor: "rgb(var(--amber-rgb) / 0.3)",
              boxShadow: "0 0 24px -8px rgb(var(--amber-rgb) / 0.4)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold uppercase tracking-wider text-amber-light">
                🚀 Your Onboarding Progress
              </p>
              <span className="text-4xl font-extrabold leading-none text-amber-light">{overallPct}%</span>
            </div>
            <ProgressBar pct={overallPct} size="lg" />
            <p className="text-sm text-slate-300">
              {overallDone}/{overallTotal} resources completed across your unlocked sessions.
            </p>
          </div>
        )}

        <div className="card space-y-3">
          <button
            className="flex w-full items-center justify-between gap-2 text-left"
            onClick={() => setShowLtdMediaGuide((prev) => !prev)}
            aria-expanded={showLtdMediaGuide}
          >
            <p className="section-title">🎧 Finding Audios in the LTD Media App</p>
            <span className="shrink-0 text-slate-500">{showLtdMediaGuide ? "▾" : "▸"}</span>
          </button>

          {showLtdMediaGuide && (
            <>
              <p className="text-sm text-slate-300">
                There are three places in the LTD Media App where you&apos;ll find a lot of
                helpful audios:
              </p>
              <ol className="space-y-1.5 pl-4 text-sm text-slate-300 marker:text-amber-light" style={{ listStyleType: "decimal" }}>
                <li>
                  <span className="font-semibold text-white">Sales &amp; Profitability Hub</span>{" "}
                  on the home screen
                </li>
                <li>
                  <span className="font-semibold text-white">My First 90 Days</span>, also on the
                  home screen
                </li>
                <li>
                  Tap the <span className="font-semibold text-white">••• menu → Gifts → Received
                  Gifts as Member</span> to see every podcast/audio your mentor has gifted you
                </li>
              </ol>

              <div className="space-y-1.5">
                <Image
                  src="/onboarding/ltd-media-home.jpg"
                  alt="LTD Media App home screen with Sales & Profitability Hub and My First 90 Days circled"
                  width={1170}
                  height={2532}
                  className="w-full rounded-xl object-contain"
                  style={{ maxHeight: "60vh" }}
                />
                <p className="text-xs text-slate-500">
                  Home screen — tap Sales &amp; Profitability Hub or My First 90 Days.
                </p>
              </div>

              <div className="space-y-1.5">
                <Image
                  src="/onboarding/ltd-media-menu.jpg"
                  alt="LTD Media App menu with the Gifts item circled"
                  width={1170}
                  height={2532}
                  className="w-full rounded-xl object-contain"
                  style={{ maxHeight: "60vh" }}
                />
                <p className="text-xs text-slate-500">Menu — tap Gifts.</p>
              </div>

              <div className="space-y-1.5">
                <Image
                  src="/onboarding/ltd-media-gifts-list.jpg"
                  alt="LTD Media App Gifts screen with Received Gifts as Member circled"
                  width={1170}
                  height={2532}
                  className="w-full rounded-xl object-contain"
                  style={{ maxHeight: "60vh" }}
                />
                <p className="text-xs text-slate-500">
                  Gifts screen — tap Received Gifts as Member.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="card space-y-3">
          <button
            className="flex w-full items-center justify-between gap-2 text-left"
            onClick={() => setShowLtdMessagingGuide((prev) => !prev)}
            aria-expanded={showLtdMessagingGuide}
          >
            <p className="section-title">
              ✉️ Sending a Daily Update on the LTD Messaging App
            </p>
            <span className="shrink-0 text-slate-500">{showLtdMessagingGuide ? "▾" : "▸"}</span>
          </button>

          {showLtdMessagingGuide && (
            <>
              <ol className="space-y-1.5 pl-4 text-sm text-slate-300 marker:text-amber-light" style={{ listStyleType: "decimal" }}>
                <li>Copy your daily update once you&apos;ve filled in your Core Run info</li>
                <li>
                  Go to the LTD Messaging App and tap the blue circle in the bottom right corner
                </li>
                <li>Paste the update and fill in the subject</li>
                <li>Tap the green circle and add everyone in your upline</li>
              </ol>

              <div className="space-y-1.5">
                <Image
                  src="/onboarding/ltd-messaging-copy-update.jpg"
                  alt="Core Run Streak page with the Copy Daily Update button circled"
                  width={1170}
                  height={2532}
                  className="w-full rounded-xl object-contain"
                  style={{ maxHeight: "60vh" }}
                />
                <p className="text-xs text-slate-500">
                  Core Run Streak — tap Copy Daily Update once today&apos;s info is filled in.
                </p>
              </div>

              <div className="space-y-1.5">
                <Image
                  src="/onboarding/ltd-messaging-compose.jpg"
                  alt="LTD Messaging App inbox with the compose (pencil) button circled"
                  width={1170}
                  height={2532}
                  className="w-full rounded-xl object-contain"
                  style={{ maxHeight: "60vh" }}
                />
                <p className="text-xs text-slate-500">
                  LTD Messaging App inbox — tap the blue compose button.
                </p>
              </div>

              <div className="space-y-1.5">
                <Image
                  src="/onboarding/ltd-messaging-add-recipients.jpg"
                  alt="LTD Messaging App compose screen with the green add-recipient button circled"
                  width={1170}
                  height={2532}
                  className="w-full rounded-xl object-contain"
                  style={{ maxHeight: "60vh" }}
                />
                <p className="text-xs text-slate-500">
                  Paste the update, fill in the Subject, then tap the green + to add recipients.
                </p>
              </div>

              <div className="space-y-1.5">
                <Image
                  src="/onboarding/ltd-messaging-groups.jpg"
                  alt="LTD Messaging App Groups screen with My Sponsor and My First Uplines groups selected"
                  width={1170}
                  height={2532}
                  className="w-full rounded-xl object-contain"
                  style={{ maxHeight: "60vh" }}
                />
                <p className="text-xs text-slate-500">
                  Select your upline groups (My Sponsor, My First Uplines, and their Secondary
                  counterparts).
                </p>
              </div>
            </>
          )}
        </div>

        {sentResources.length > 0 && (
          <div className="card space-y-1.5">
            <p className="section-title">🎁 Sent To You</p>
            <p className="text-xs text-slate-400">
              Resources your upline has sent you directly — not tied to any session.
            </p>
            {sentResources.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy px-3 py-2">
                <div className="min-w-0">
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm font-medium text-amber-light underline decoration-dotted underline-offset-2"
                    >
                      {r.label}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-medium text-white">{r.label}</p>
                  )}
                  {(r.detail || r.estimate) && (
                    <p className="truncate text-xs text-slate-500">
                      {r.detail}
                      {r.estimate && <span> · {r.estimate}</span>}
                    </p>
                  )}
                </div>
                <button
                  className="btn-icon shrink-0"
                  onClick={() => dismissSentResource(r.id)}
                  aria-label={`Dismiss ${r.label}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {!isAdmin && !onboardingComplete && (
          <div className="card space-y-2 !border-amber bg-amber/10">
            <p className="section-title">🔓 More to Unlock</p>
            <p className="text-sm text-slate-300">
              The app opens up as you go — Contacts and Volume unlock after
              List Building, Pipeline and Candidate History after Sharing
              Your Story, and Run Streak, Goals, Team, Games, and the
              Assistant all unlock once you finish the 30-Day Core Run.
              Keep working through your sessions to unlock the rest!
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="card space-y-2">
            <p className="section-title">🧪 Preview Onboarding Tier</p>
            <p className="text-xs text-slate-400">
              Switches what tabs you see, as if you were at that tier — only
              affects this browser tab, doesn&apos;t touch your real progress
              or anyone else&apos;s.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={debugTier === null ? "toggle-pill-active" : "toggle-pill-inactive"}
                onClick={() => previewTier(null)}
              >
                Full (Me)
              </button>
              {[1, 2, 3, 4, 5].map((tier) => (
                <button
                  key={tier}
                  className={debugTier === String(tier) ? "toggle-pill-active" : "toggle-pill-inactive"}
                  onClick={() => previewTier(tier)}
                >
                  Tier {tier}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <SkeletonList cards={4} />
        ) : (
          ONBOARDING_SESSIONS.map((session, i) => {
            const sessionNumber = i + 1;
            const unlocked = isAdmin || sessionNumber <= unlockedThrough;
            const resources = effectiveResourcesForSession(
              sessionNumber,
              session.resources,
              resourceOverrides
            );
            const style = SESSION_STYLE[i];
            const doneCount = resources.filter((r) => completedKeys.has(`${sessionNumber}:${r.label}`)).length;
            const sessionPct = resources.length > 0 ? Math.round((doneCount / resources.length) * 100) : 0;
            return (
              <div key={session.title} className="card space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                    style={{
                      background: `linear-gradient(135deg, ${style.from}, ${style.to})`,
                      boxShadow: "0 6px 16px -8px rgba(0,0,0,0.6)",
                      opacity: unlocked ? 1 : 0.45,
                    }}
                    aria-hidden
                  >
                    {style.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white">{session.title}</p>
                    <p className="text-xs text-slate-400">{session.description}</p>
                  </div>
                  <span className={`shrink-0 ${unlocked ? "pill-amber" : "pill"}`}>
                    {unlocked ? "Unlocked" : "🔒 Locked"}
                  </span>
                </div>

                {unlocked && resources.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>
                        {doneCount}/{resources.length} done
                      </span>
                      <span>{sessionPct}%</span>
                    </div>
                    <ProgressBar pct={sessionPct} />
                  </div>
                )}

                {unlocked ? (
                  <div className="space-y-1.5">
                    {resources.map((r) => {
                      const done = completedKeys.has(`${sessionNumber}:${r.label}`);
                      return (
                        <div key={r.label} className="flex items-start gap-2.5 rounded-lg bg-navy px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleResourceComplete(sessionNumber, r.label)}
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition ${
                              done
                                ? "border-emerald-400 bg-emerald-400 text-navy"
                                : "border-slate-600 text-transparent"
                            }`}
                            aria-label={done ? `Mark ${r.label} as not done` : `Mark ${r.label} as done`}
                          >
                            ✓
                          </button>
                          <div className="min-w-0 flex-1">
                            {r.url && isInternalLink(r.url) ? (
                              <Link
                                href={r.url}
                                className={`text-sm font-medium underline decoration-dotted underline-offset-2 ${
                                  done ? "text-slate-500" : "text-amber-light"
                                }`}
                              >
                                {r.label}
                              </Link>
                            ) : r.url ? (
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`text-sm font-medium underline decoration-dotted underline-offset-2 ${
                                  done ? "text-slate-500" : "text-amber-light"
                                }`}
                              >
                                {r.label}
                              </a>
                            ) : (
                              <p className={`text-sm font-medium ${done ? "text-slate-400 line-through" : "text-white"}`}>
                                {r.label}
                              </p>
                            )}
                            <p className="text-xs text-slate-400">
                              {r.detail}
                              {r.estimate && <span> · {r.estimate}</span>}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    {sessionNumber === 4 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-amber-light">
                          {networkContactCount >= SESSION_4_CONTACT_MINIMUM ? "✓" : "○"}{" "}
                          {SESSION_4_CONTACT_MINIMUM}+ names in your Contact Builder&apos;s A/B
                          list — you have {networkContactCount}/{SESSION_4_CONTACT_MINIMUM}.
                        </p>
                        <label className="flex items-start gap-2 text-xs text-amber-light">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={chaptersConfirmed}
                            disabled={confirmingChapters}
                            onChange={toggleChaptersConfirmed}
                          />
                          <span>I&apos;ve read {SESSION_4_READING_REQUIREMENT}.</span>
                        </label>
                        {confirmError && <p className="text-xs text-red-400">{confirmError}</p>}
                      </div>
                    )}
                    <p className="text-xs text-slate-500">
                      Ask your upline to unlock this session once you&apos;re ready.
                    </p>
                  </>
                )}
              </div>
            );
          })
        )}
      </main>
    </>
  );
}
