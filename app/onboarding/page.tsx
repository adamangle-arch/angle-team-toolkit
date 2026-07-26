"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import {
  ONBOARDING_SESSIONS,
  SESSION_4_CONTACT_MINIMUM,
  SESSION_4_READING_REQUIREMENT,
  isPrimaryUser,
} from "@/lib/constants";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: profileData }, { count }] = await Promise.all([
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
      ]);
      if (!cancelled) {
        setUnlockedThrough(profileData?.onboarding_unlocked_through ?? 1);
        setChaptersConfirmed(profileData?.thinking_big_chapters_confirmed ?? false);
        setNetworkContactCount(count ?? 0);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user.id, ownerId]);

  async function toggleChaptersConfirmed() {
    const next = !chaptersConfirmed;
    setChaptersConfirmed(next);
    setConfirmingChapters(true);
    await supabase
      .from("profiles")
      .update({ thinking_big_chapters_confirmed: next })
      .eq("id", user.id);
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
          <div className="empty-state">Loading…</div>
        ) : (
          ONBOARDING_SESSIONS.map((session, i) => {
            const sessionNumber = i + 1;
            const unlocked = isAdmin || sessionNumber <= unlockedThrough;
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
                    {session.resources.map((r) => (
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
                        <p className="text-xs text-slate-400">{r.detail}</p>
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
