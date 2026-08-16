"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ProgressBar from "@/components/ProgressBar";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import {
  ONBOARDING_SESSIONS,
  effectiveResourcesForSession,
  isPrimaryUser,
  type OnboardingResourceOverrideEntry,
} from "@/lib/constants";
import { SESSION_STYLE } from "@/lib/onboarding-style";

// A resource url starting with "/" is a link to somewhere else in the
// app (e.g. a Resources tab) rather than an external video/doc link -
// those should navigate in-app via next/link instead of opening a new
// browser tab.
function isInternalLink(url: string): boolean {
  return url.startsWith("/");
}

export default function OnboardingSessionPage({ params }: { params: Promise<{ session: string }> }) {
  const { session: sessionParam } = use(params);
  const { user, ownerId } = useAuth();
  const isAdmin = isPrimaryUser(user.email);

  const sessionNumber = Number(sessionParam);
  const valid = Number.isInteger(sessionNumber) && sessionNumber >= 1 && sessionNumber <= ONBOARDING_SESSIONS.length;

  const [unlockedThrough, setUnlockedThrough] = useState(1);
  const [resourceOverrides, setResourceOverrides] = useState<OnboardingResourceOverrideEntry[]>([]);
  const [completedLabels, setCompletedLabels] = useState<Set<string>>(new Set());
  // sessionParam never changes after mount (it's the URL segment), so
  // this lazy initializer is the only place an invalid session needs to
  // resolve loading to false - no effect needed for that branch, which
  // is what a synchronous setState inside the effect body would do.
  const [loading, setLoading] = useState(valid);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    async function load() {
      const [{ data: profileData }, { data: overrideRows }, { data: completionRows }] = await Promise.all([
        supabase.from("profiles").select("onboarding_unlocked_through").eq("id", user.id).single(),
        supabase.from("onboarding_resource_overrides").select("*").eq("user_id", ownerId),
        supabase
          .from("onboarding_resource_completions")
          .select("resource_label")
          .eq("user_id", user.id)
          .eq("session", sessionNumber),
      ]);
      if (!cancelled) {
        setUnlockedThrough(profileData?.onboarding_unlocked_through ?? 1);
        setResourceOverrides((overrideRows as OnboardingResourceOverrideEntry[]) ?? []);
        setCompletedLabels(
          new Set(((completionRows as { resource_label: string }[]) ?? []).map((r) => r.resource_label))
        );
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [valid, user.id, ownerId, sessionNumber]);

  async function toggleResourceComplete(label: string) {
    const wasDone = completedLabels.has(label);
    const previous = completedLabels;
    const next = new Set(completedLabels);
    if (wasDone) next.delete(label);
    else next.add(label);
    setCompletedLabels(next);

    const { error } = wasDone
      ? await supabase
          .from("onboarding_resource_completions")
          .delete()
          .eq("user_id", user.id)
          .eq("session", sessionNumber)
          .eq("resource_label", label)
      : await supabase
          .from("onboarding_resource_completions")
          .insert({ user_id: user.id, session: sessionNumber, resource_label: label });
    if (error) setCompletedLabels(previous);
  }

  if (!valid) {
    return (
      <>
        <PageHeader title="Classroom" />
        <main className="page-main">
          <div className="card space-y-3 text-center">
            <p className="text-sm text-slate-300">That session doesn&apos;t exist.</p>
            <Link href="/onboarding" className="chip-btn mx-auto inline-flex w-fit items-center gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to Classroom
            </Link>
          </div>
        </main>
      </>
    );
  }

  const session = ONBOARDING_SESSIONS[sessionNumber - 1];
  const style = SESSION_STYLE[sessionNumber - 1];
  const unlocked = isAdmin || sessionNumber <= unlockedThrough;
  const resources = effectiveResourcesForSession(sessionNumber, session.resources, resourceOverrides);
  const doneCount = resources.filter((r) => completedLabels.has(r.label)).length;
  const pct = resources.length > 0 ? Math.round((doneCount / resources.length) * 100) : 0;

  return (
    <>
      <PageHeader
        title={session.title}
        subtitle={unlocked ? `${doneCount}/${resources.length} homework items done` : "Locked"}
      />
      <main className="page-main">
        <Link href="/onboarding" className="chip-btn inline-flex w-fit items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Classroom
        </Link>

        <div
          className="relative flex min-h-[110px] flex-col justify-end overflow-hidden rounded-2xl p-4"
          style={{
            background: unlocked
              ? `linear-gradient(135deg, ${style.from}, ${style.to})`
              : "linear-gradient(135deg, #64748b, #334155)",
            boxShadow: "0 10px 24px -12px rgba(0,0,0,0.55)",
            filter: unlocked ? undefined : "grayscale(0.6)",
          }}
        >
          <style.icon
            className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 text-white opacity-25"
            strokeWidth={1.5}
            aria-hidden
          />
          {!unlocked && (
            <span
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/30"
              aria-hidden
            >
              <Lock className="h-3.5 w-3.5 text-white" />
            </span>
          )}
          <p className="relative z-10 text-lg font-extrabold leading-tight text-white drop-shadow-sm">
            {session.title}
          </p>
          <p className="relative z-10 text-sm text-white/85">{session.description}</p>
        </div>

        {!unlocked ? (
          <div className="card space-y-2">
            <span className="pill inline-flex w-fit items-center gap-1">
              <Lock className="h-3 w-3" aria-hidden />
              Locked
            </span>
            <p className="text-sm text-slate-400">
              Ask your upline to unlock this session once you&apos;re ready — the requirements (if
              any) show on the Classroom tab while it&apos;s still locked.
            </p>
          </div>
        ) : loading ? (
          <SkeletonList cards={3} />
        ) : (
          <>
            {resources.length > 0 && (
              <div className="card space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {doneCount}/{resources.length} done
                  </span>
                  <span>{pct}%</span>
                </div>
                <ProgressBar pct={pct} size="lg" />
              </div>
            )}

            <div className="space-y-1.5">
              {resources.map((r) => {
                const done = completedLabels.has(r.label);
                return (
                  <div key={r.label} className="flex items-start gap-2.5 rounded-lg bg-navy px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleResourceComplete(r.label)}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition ${
                        done ? "border-emerald-400 bg-emerald-400 text-navy" : "border-slate-600 text-transparent"
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
          </>
        )}
      </main>
    </>
  );
}
