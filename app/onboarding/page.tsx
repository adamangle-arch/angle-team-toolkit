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
  const [loading, setLoading] = useState(true);
  // Collapsed by default - three full screenshots made this the tallest
  // thing on the page even though most visits don't need it open.
  const [showLtdMediaGuide, setShowLtdMediaGuide] = useState(false);
  const [showLtdMessagingGuide, setShowLtdMessagingGuide] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: profileData }, { count }, { data: overrideRows }, { data: sentRows }] =
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
        ]);
      if (!cancelled) {
        setUnlockedThrough(profileData?.onboarding_unlocked_through ?? 1);
        setChaptersConfirmed(profileData?.thinking_big_chapters_confirmed ?? false);
        setNetworkContactCount(count ?? 0);
        setResourceOverrides((overrideRows as OnboardingResourceOverrideEntry[]) ?? []);
        setSentResources((sentRows as MemberResource[]) ?? []);
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

  const unlockedCount = isAdmin
    ? ONBOARDING_SESSIONS.length
    : Math.min(unlockedThrough, ONBOARDING_SESSIONS.length);

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
        title="Onboarding"
        subtitle={`${unlockedCount}/${ONBOARDING_SESSIONS.length} sessions unlocked`}
      />
      <main className="page-main">
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
            return (
              <div key={session.title} className="card space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="section-title">{session.title}</p>
                  <span className={unlocked ? "pill-amber" : "pill"}>
                    {unlocked ? "Unlocked" : "🔒 Locked"}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{session.description}</p>
                {unlocked ? (
                  <div className="space-y-1.5">
                    {resources.map((r) => (
                      <div key={r.label} className="rounded-lg bg-navy px-3 py-2">
                        {r.url && isInternalLink(r.url) ? (
                          <Link
                            href={r.url}
                            className="text-sm font-medium text-amber-light underline decoration-dotted underline-offset-2"
                          >
                            {r.label}
                          </Link>
                        ) : r.url ? (
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
                        <p className="text-xs text-slate-400">
                          {r.detail}
                          {r.estimate && <span> · {r.estimate}</span>}
                        </p>
                      </div>
                    ))}
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
