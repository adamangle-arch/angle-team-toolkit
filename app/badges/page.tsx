"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { BADGE_DEFINITIONS, BADGE_CATEGORIES, isBadgeEarned, badgeProgress, type BadgeDefinition } from "@/lib/badges";
import { checkAndAwardBadges } from "@/lib/badgeEngine";
import {
  pointsForBadgeKeys,
  levelProgress,
  frameTierForLevel,
  FRAME_TIER_LABELS,
  type FrameTier,
} from "@/lib/levels";
import LevelAvatar from "@/components/LevelAvatar";
import { SkeletonList } from "@/components/Skeleton";
import { ACTIVITY_LOG_KINDS, isBadgeExcluded, PIPELINE_STAGES, type ActivityLogKind, type PipelineStageKey } from "@/lib/constants";
import type { BadgeMetrics, UserBadge, PersonalBestEntry, PipelinePeriod, SentNotification } from "@/lib/types";

type PageTab = "achievements" | "vault";

const VAULT_STAGES: PipelineStageKey[] = ["questions", "yeses", "qi1", "launches"];
const VAULT_PERIOD_LABELS: Record<PersonalBestEntry["period_type"], string> = {
  daily: "Best Day",
  weekly: "Best Week",
  monthly: "Best Month",
};

function stageLabel(key: PipelineStageKey): string {
  return PIPELINE_STAGES.find((s) => s.key === key)?.label ?? key;
}

// Exactly a year ago, as a local date-only string - built directly from a
// shifted Date rather than any string math, same "never round-trip
// through a date-only string" reasoning lib/dates.ts's own offset helpers
// already document for why that matters.
function oneYearAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const VAULT_NOTIFICATION_KINDS = ["streak_milestone_reached", "badge_earned"] as const;

const ACTIVITY_METRIC_KEY: Record<ActivityLogKind, keyof BadgeMetrics> = {
  sample_bag_given: "sample_bags_given",
  customer_survey_completed: "has_customer_survey",
  weekly_training_attended: "has_weekly_training",
  monthly_masterclass_attended: "has_monthly_masterclass",
  quarterly_conference_attended: "has_quarterly_conference",
  story_practiced: "has_story_practiced",
};

const TIER_ICONS: Record<FrameTier, string> = {
  none: "🔰",
  bronze: "🥉",
  silver: "🥈",
  gold: "🥇",
  diamond: "💎",
};

type FilterMode = "all" | "earned" | "locked";

// Alphabetical, not catalog/insertion order - with 51 categories,
// "findable" beats "grouped by whenever it was added."
const SORTED_CATEGORIES = [...BADGE_CATEGORIES].sort((a, b) => a.localeCompare(b));

function formatEarnedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// A badge earned in roughly the last 3 days gets a "NEW" tag - long
// enough to still catch someone who doesn't open the app daily, short
// enough that the tag doesn't become permanent wallpaper.
const NEW_BADGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
function isRecentlyEarned(earnedAt: string | undefined): boolean {
  return Boolean(earnedAt) && Date.now() - new Date(earnedAt as string).getTime() < NEW_BADGE_WINDOW_MS;
}

function BadgeRow({
  badge,
  earnedAt,
  earned,
  progress,
}: {
  badge: BadgeDefinition;
  earnedAt: string | undefined;
  earned: boolean;
  progress: number;
}) {
  const isCrown = badge.icon === "👑";
  return (
    <div
      className={`relative overflow-hidden rounded-lg px-3 py-2 ${
        earned
          ? isCrown
            ? "bg-gradient-to-r from-amber/25 via-amber/10 to-transparent ring-1 ring-amber/40"
            : "bg-amber/10"
          : "bg-navy"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-lg leading-none ${earned ? "" : "opacity-30 grayscale"}`}>{badge.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className={`text-sm font-medium ${earned ? "text-amber-light" : "text-white"}`}>{badge.label}</p>
            {isRecentlyEarned(earnedAt) && (
              <span className="pill-amber !px-1.5 !py-0 text-[9px] tracking-wide">NEW</span>
            )}
          </div>
          <p className="text-xs text-slate-500">{badge.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-lg leading-none">{earned ? "✅" : "🔒"}</span>
          <span className="text-[10px] font-semibold text-slate-500">+{badge.points}</span>
        </div>
      </div>
      {earned ? (
        earnedAt && <p className="mt-1 pl-7 text-xs text-slate-500">Earned {formatEarnedDate(earnedAt)}</p>
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
}

export default function BadgesPage() {
  const { ownerId, user } = useAuth();
  const excluded = isBadgeExcluded(user.email);
  const [pageTab, setPageTab] = useState<PageTab>("achievements");
  const [metrics, setMetrics] = useState<BadgeMetrics | null>(null);
  const [earnedByKey, setEarnedByKey] = useState<Map<string, string>>(new Map());
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingActivity, setLoggingActivity] = useState<ActivityLogKind | null>(null);

  // Vault tab - lazily loaded (null = not fetched yet) the first time
  // someone actually switches to it, rather than adding three more
  // queries to every Badges page load whether or not Vault gets opened.
  const [personalBests, setPersonalBests] = useState<PersonalBestEntry[] | null>(null);
  const [onThisDay, setOnThisDay] = useState<PipelinePeriod | null>(null);
  const [milestoneArchive, setMilestoneArchive] = useState<SentNotification[] | null>(null);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [copiedMilestoneId, setCopiedMilestoneId] = useState<string | null>(null);

  // Belief-building via verified results, not testimonials - every entry
  // here already came from real logged data (a badge threshold actually
  // hit, a streak length actually reached), so a copy-paste card of it is
  // proof, not a vague "trust me" claim, safe to paste anywhere (a text
  // to an upline, LTD Messaging) without building a competing chat
  // feature of our own.
  async function copyMilestone(n: SentNotification) {
    const text = `${n.kind === "badge_earned" ? "🏅" : "🔥"} ${n.title}\n${n.body}\nVerified ${new Date(
      n.created_at
    ).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} — Angle Team`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMilestoneId(n.id);
      setTimeout(() => setCopiedMilestoneId(null), 2000);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) -
      // silently no-op rather than surfacing an error for a nice-to-have.
    }
  }

  // Browsing controls - a flat list of 300 badges across 51 categories
  // is unusable without these. Search/filter force every matching
  // category open (the whole point of searching or filtering is to see
  // the matches, not just a count), so manual expand/collapse only
  // matters in the plain "no search, no filter" browsing mode.
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set());

  function toggleCategory(category: string) {
    setManuallyExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function load() {
    const [{ data: metricsRows }, { data: badgeRows }, { data: profileRow }] = await Promise.all([
      supabase.rpc("get_badge_metrics", { p_user_id: ownerId }),
      supabase.from("user_badges").select("badge_key,earned_at").eq("user_id", ownerId),
      supabase.from("profiles").select("photo_url").eq("id", user.id).single(),
    ]);
    setMetrics((metricsRows as BadgeMetrics[] | null)?.[0] ?? null);
    setEarnedByKey(
      new Map(((badgeRows as Pick<UserBadge, "badge_key" | "earned_at">[]) ?? []).map((r) => [r.badge_key, r.earned_at]))
    );
    setPhotoUrl((profileRow as { photo_url: string | null } | null)?.photo_url ?? null);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!excluded) await checkAndAwardBadges(ownerId);
      if (!cancelled) await load();
    }
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, excluded]);

  useEffect(() => {
    if (pageTab !== "vault" || personalBests !== null) return;
    let cancelled = false;
    async function loadVault() {
      setVaultLoading(true);
      const [{ data: bests }, { data: lastYear }, { data: milestones }] = await Promise.all([
        supabase.rpc("get_personal_bests", { p_user_id: ownerId }),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "daily")
          .eq("period_start", oneYearAgo())
          .maybeSingle(),
        supabase
          .from("sent_notifications")
          .select("*")
          .eq("user_id", ownerId)
          .in("kind", VAULT_NOTIFICATION_KINDS)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;
      setPersonalBests((bests as PersonalBestEntry[]) ?? []);
      setOnThisDay((lastYear as PipelinePeriod) ?? null);
      setMilestoneArchive((milestones as SentNotification[]) ?? []);
      setVaultLoading(false);
    }
    loadVault();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTab, ownerId]);

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

  async function logActivity(kind: ActivityLogKind) {
    setLoggingActivity(kind);
    setError(null);
    const { error: insertError } = await supabase.from("activity_logs").insert({ user_id: ownerId, kind });
    if (insertError) {
      setError(insertError.message);
      setLoggingActivity(null);
      return;
    }
    await checkAndAwardBadges(ownerId);
    await load();
    setLoggingActivity(null);
  }

  const earnedCount = earnedByKey.size;
  const totalCount = BADGE_DEFINITIONS.length;
  const totalPoints = pointsForBadgeKeys(Array.from(earnedByKey.keys()));
  const myLevel = levelProgress(totalPoints);
  const myTier = frameTierForLevel(myLevel.level);

  // Closest-to-unlocking badges across every category, regardless of
  // which one they belong to - the "video game achievement screen"
  // touch that also happens to be the single most useful thing to show
  // first: exactly what to go do next, instead of making someone hunt
  // through 51 categories for it.
  const nearlyThere = useMemo(() => {
    if (!metrics) return [];
    return BADGE_DEFINITIONS.filter((b) => !earnedByKey.has(b.key))
      .map((b) => ({ badge: b, progress: badgeProgress(b, metrics, earnedByKey) }))
      .filter((x) => x.progress > 0 && x.progress < 1)
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 5);
  }, [metrics, earnedByKey]);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isFiltering = trimmedQuery !== "" || filterMode !== "all";

  return (
    <>
      <PageHeader title="Badges" subtitle={`${earnedCount}/${totalCount} earned`} />
      <main className="page-main">
        <div className="card flex p-1">
          <button
            className={pageTab === "achievements" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setPageTab("achievements")}
          >
            Achievements
          </button>
          <button
            className={pageTab === "vault" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setPageTab("vault")}
          >
            Vault
          </button>
        </div>

        {pageTab === "vault" ? (
          vaultLoading || personalBests === null ? (
            <SkeletonList cards={3} />
          ) : (
            <>
              <div className="card space-y-2">
                <p className="section-title">🏆 Personal Bests</p>
                {personalBests.length === 0 ? (
                  <p className="empty-state">Log some pipeline activity to start setting records.</p>
                ) : (
                  (["daily", "weekly", "monthly"] as const).map((periodType) => {
                    const rows = VAULT_STAGES.map((key) =>
                      personalBests.find((b) => b.period_type === periodType && b.stage_key === key)
                    ).filter((b): b is PersonalBestEntry => Boolean(b) && b!.best_value > 0);
                    if (rows.length === 0) return null;
                    return (
                      <div key={periodType} className="space-y-1">
                        <p className="text-xs font-semibold text-slate-400">{VAULT_PERIOD_LABELS[periodType]}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {rows.map((r) => (
                            <div key={r.stage_key} className="rounded-lg bg-navy p-2">
                              <p className="text-lg font-bold text-white">{r.best_value}</p>
                              <p className="text-xs text-slate-400">{stageLabel(r.stage_key)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="card space-y-2">
                <p className="section-title">📆 On This Day</p>
                {onThisDay ? (
                  <div className="grid grid-cols-2 gap-2">
                    {VAULT_STAGES.map((key) => (
                      <div key={key} className="rounded-lg bg-navy p-2">
                        <p className="text-lg font-bold text-white">{onThisDay[key]}</p>
                        <p className="text-xs text-slate-400">{stageLabel(key)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No logged activity from exactly a year ago today.</p>
                )}
              </div>

              <div className="card space-y-2">
                <div>
                  <p className="section-title">🗂️ Milestone Archive</p>
                  <p className="text-xs text-slate-400">
                    Real, verified results — share one as proof, not a testimonial.
                  </p>
                </div>
                {milestoneArchive === null || milestoneArchive.length === 0 ? (
                  <p className="empty-state">Streak milestones and badges you earn will show up here.</p>
                ) : (
                  milestoneArchive.map((n) => (
                    <div key={n.id} className="flex items-start justify-between gap-2 text-sm">
                      <span className="text-slate-200">
                        {n.kind === "badge_earned" ? "🏅" : "🔥"} {n.title}
                        <span className="ml-1.5 text-xs text-slate-500">
                          {new Date(n.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </span>
                      <button className="chip-btn shrink-0 text-xs" onClick={() => copyMilestone(n)}>
                        {copiedMilestoneId === n.id ? "Copied!" : "Share"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )
        ) : (
          <>
        {!excluded && !loading && (
          <div className="card relative space-y-3 overflow-hidden">
            <div
              className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full opacity-20 blur-2xl"
              style={{ background: "radial-gradient(circle, var(--color-amber), transparent 70%)" }}
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-3">
              <LevelAvatar photoUrl={photoUrl} level={myLevel.level} size="lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="section-title">Level {myLevel.level}</p>
                  <span className="pill-amber shrink-0">
                    {TIER_ICONS[myTier]} {FRAME_TIER_LABELS[myTier]}
                  </span>
                </div>
                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-navy">
                  <div
                    className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-amber-light to-amber"
                    style={{ width: `${Math.round(myLevel.progress * 100)}%` }}
                  >
                    <div
                      className="animate-shimmer absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                      aria-hidden="true"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  {totalPoints} pts
                  {myLevel.nextLevelPoints
                    ? ` — ${myLevel.nextLevelPoints - totalPoints} to Level ${myLevel.level + 1}`
                    : " — max level"}
                </p>
              </div>
            </div>
            <div className="relative space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                <span>Badge Collection</span>
                <span>
                  {earnedCount}/{totalCount}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy">
                <div
                  className="h-full rounded-full bg-sky-400/80 transition-all duration-500"
                  style={{ width: `${totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {!loading && nearlyThere.length > 0 && (
          <div className="card relative space-y-2 overflow-hidden">
            <div
              className="animate-glow-pulse pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full opacity-30 blur-2xl"
              style={{ background: "radial-gradient(circle, var(--color-amber), transparent 70%)" }}
              aria-hidden="true"
            />
            <p className="section-title relative">🔥 Almost There</p>
            <div className="relative space-y-1.5">
              {nearlyThere.map(({ badge, progress }) => (
                <div key={badge.key} className="flex items-center gap-2 rounded-lg bg-navy px-3 py-2">
                  <span className="text-lg leading-none">{badge.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{badge.label}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-amber transition-all duration-300"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-amber-light">{Math.round(progress * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

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

        {!loading && metrics && (
          <div className="card space-y-2">
            <p className="section-title">📋 Log Activity</p>
            <p className="text-xs text-slate-400">
              Same idea as books - there&apos;s no way to auto-detect these, so log them here as
              you do them.
            </p>
            <div className="space-y-1.5">
              {ACTIVITY_LOG_KINDS.map(({ key, label }) => {
                const metricKey = ACTIVITY_METRIC_KEY[key];
                const value = metrics[metricKey];
                const done = typeof value === "boolean" ? value : false;
                const count = typeof value === "number" ? value : null;
                return (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-200">
                      {label}
                      {count !== null && <span className="text-slate-500"> ({count})</span>}
                    </span>
                    {done ? (
                      <span className="pill-amber shrink-0 text-xs">✅ Done</span>
                    ) : (
                      <button
                        className="btn-secondary shrink-0 text-xs"
                        onClick={() => logActivity(key)}
                        disabled={loggingActivity === key}
                      >
                        {loggingActivity === key ? "Logging…" : count !== null ? "+1" : "Mark Done"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && metrics && (
          <div className="card space-y-2">
            <input
              className="input"
              placeholder="🔍 Search all 300 badges…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="flex gap-1.5">
              {(["all", "earned", "locked"] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  className={filterMode === mode ? "toggle-pill-active" : "toggle-pill-inactive"}
                  onClick={() => setFilterMode(mode)}
                >
                  {mode === "all" ? "All" : mode === "earned" ? "✅ Earned" : "🔒 Locked"}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading || !metrics ? (
          <SkeletonList cards={4} />
        ) : (
          (() => {
            const categorySections = SORTED_CATEGORIES.map((category) => {
              // Most valuable first within each category, not catalog-
              // insertion order - a badge's point value (lib/levels.ts)
              // is a better "how impressive is this" signal to lead with.
              const categoryBadges = BADGE_DEFINITIONS.filter((b) => b.category === category).sort(
                (a, b) => b.points - a.points
              );
              const earnedInCategory = categoryBadges.filter((b) => earnedByKey.has(b.key)).length;
              const visibleBadges = categoryBadges.filter((b) => {
                const earned = earnedByKey.has(b.key);
                if (filterMode === "earned" && !earned) return false;
                if (filterMode === "locked" && earned) return false;
                if (
                  trimmedQuery &&
                  !b.label.toLowerCase().includes(trimmedQuery) &&
                  !b.description.toLowerCase().includes(trimmedQuery)
                ) {
                  return false;
                }
                return true;
              });
              return { category, categoryBadges, earnedInCategory, visibleBadges };
            }).filter((section) => section.visibleBadges.length > 0);

            if (categorySections.length === 0) {
              return <p className="empty-state">No badges match that search.</p>;
            }

            return categorySections.map(({ category, categoryBadges, earnedInCategory, visibleBadges }) => {
              const isComplete = earnedInCategory === categoryBadges.length;
              const expanded = isFiltering || manuallyExpanded.has(category);
              return (
                <div key={category} className={`card space-y-2 ${isComplete ? "ring-1 ring-amber/40" : ""}`}>
                  <button
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => toggleCategory(category)}
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="section-title truncate">
                        {isComplete && "👑 "}
                        {category}
                      </p>
                      <div className="h-1 w-full max-w-32 overflow-hidden rounded-full bg-navy">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isComplete ? "bg-amber" : "bg-sky-400/80"
                          }`}
                          style={{ width: `${Math.round((earnedInCategory / categoryBadges.length) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="pill shrink-0">
                      {earnedInCategory}/{categoryBadges.length}
                    </span>
                    <span className="shrink-0 text-slate-500">{expanded ? "▾" : "▸"}</span>
                  </button>
                  {expanded && (
                    <div className="space-y-1.5">
                      {visibleBadges.map((badge) => {
                        const earnedAt = earnedByKey.get(badge.key);
                        const earned = Boolean(earnedAt) || isBadgeEarned(badge, metrics, earnedByKey);
                        const progress = badgeProgress(badge, metrics, earnedByKey);
                        return (
                          <BadgeRow key={badge.key} badge={badge} earnedAt={earnedAt} earned={earned} progress={progress} />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()
        )}
          </>
        )}
      </main>
    </>
  );
}
