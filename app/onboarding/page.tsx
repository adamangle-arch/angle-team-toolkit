"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { ONBOARDING_SESSIONS, isPrimaryUser } from "@/lib/constants";

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

  return (
    <>
      <PageHeader
        title="Onboarding"
        subtitle={`${unlockedCount}/${ONBOARDING_SESSIONS.length} sessions unlocked`}
      />
      <main className="page-main">
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
