"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { BADGE_DEFINITIONS, BADGE_CATEGORIES, isBadgeEarned, badgeProgress } from "@/lib/badges";
import { checkAndAwardBadges } from "@/lib/badgeEngine";
import type { BadgeMetrics, UserBadge } from "@/lib/types";

function formatEarnedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function BadgesPage() {
  const { ownerId } = useAuth();
  const [metrics, setMetrics] = useState<BadgeMetrics | null>(null);
  const [earnedByKey, setEarnedByKey] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [{ data: metricsRows }, { data: badgeRows }] = await Promise.all([
      supabase.rpc("get_badge_metrics", { p_user_id: ownerId }),
      supabase.from("user_badges").select("badge_key,earned_at").eq("user_id", ownerId),
    ]);
    setMetrics((metricsRows as BadgeMetrics[] | null)?.[0] ?? null);
    setEarnedByKey(
      new Map(((badgeRows as Pick<UserBadge, "badge_key" | "earned_at">[]) ?? []).map((r) => [r.badge_key, r.earned_at]))
    );
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await checkAndAwardBadges(ownerId);
      if (!cancelled) await load();
    }
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  async function logBook() {
    setLogging(true);
    setError(null);
    const { error: insertError } = await supabase.from("book_completions").insert({ user_id: ownerId });
    if (insertError) {
      setError(insertError.message);
      setLogging(false);
      return;
    }
    await checkAndAwardBadges(ownerId);
    await load();
    setLogging(false);
  }

  const earnedCount = earnedByKey.size;
  const totalCount = BADGE_DEFINITIONS.length;

  return (
    <>
      <PageHeader title="Badges" subtitle={`${earnedCount}/${totalCount} earned`} />
      <main className="page-main">
        <div className="card space-y-2">
          <p className="section-title">📚 Log a Finished Book</p>
          <p className="text-xs text-slate-400">
            There&apos;s no way to auto-detect a book you&apos;ve read, so tap this each time you finish
            one - it counts toward the Books badges below.
          </p>
          <button className="btn-primary w-full" onClick={logBook} disabled={logging}>
            {logging ? "Logging…" : "+1 Book Finished"}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {loading || !metrics ? (
          <div className="empty-state">Loading…</div>
        ) : (
          BADGE_CATEGORIES.map((category) => {
            const badges = BADGE_DEFINITIONS.filter((b) => b.category === category);
            const earnedInCategory = badges.filter((b) => earnedByKey.has(b.key)).length;
            return (
              <div key={category} className="card space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="section-title">{category}</p>
                  <span className="pill">
                    {earnedInCategory}/{badges.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {badges.map((badge) => {
                    const earnedAt = earnedByKey.get(badge.key);
                    const earned = Boolean(earnedAt) || isBadgeEarned(badge, metrics);
                    const progress = badgeProgress(badge, metrics);
                    return (
                      <div
                        key={badge.key}
                        className={`rounded-lg px-3 py-2 ${earned ? "bg-amber/10" : "bg-navy"}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-lg leading-none ${earned ? "" : "opacity-30 grayscale"}`}>
                            {badge.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-sm font-medium ${earned ? "text-amber-light" : "text-white"}`}>
                              {badge.label}
                            </p>
                            <p className="truncate text-xs text-slate-500">{badge.description}</p>
                          </div>
                          <span className="shrink-0 text-lg leading-none">{earned ? "✅" : "🔒"}</span>
                        </div>
                        {earned ? (
                          earnedAt && (
                            <p className="mt-1 pl-7 text-xs text-slate-500">Earned {formatEarnedDate(earnedAt)}</p>
                          )
                        ) : (
                          <div className="mt-1.5 pl-7">
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-amber transition-all duration-300"
                                style={{ width: `${Math.round(progress * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </main>
    </>
  );
}
