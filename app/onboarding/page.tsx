"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { ONBOARDING_SESSIONS, isPrimaryUser } from "@/lib/constants";

// A resource url starting with "/" is a link to somewhere else in the
// app (e.g. a Resources tab) rather than an external video/doc link -
// those should navigate in-app via next/link instead of opening a new
// browser tab.
function isInternalLink(url: string): boolean {
  return url.startsWith("/");
}

export default function OnboardingPage() {
  const { user } = useAuth();
  const isAdmin = isPrimaryUser(user.email);
  const [unlockedThrough, setUnlockedThrough] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_unlocked_through")
        .eq("id", user.id)
        .single();
      if (!cancelled) {
        setUnlockedThrough(data?.onboarding_unlocked_through ?? 1);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

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
                  <p className="text-xs text-slate-500">
                    Ask your upline to unlock this session once you&apos;re ready.
                  </p>
                )}
              </div>
            );
          })
        )}
      </main>
    </>
  );
}
