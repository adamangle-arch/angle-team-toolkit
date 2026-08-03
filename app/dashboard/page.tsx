"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { SkeletonList, SkeletonRows } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import { minSessionFor } from "@/lib/onboarding-gate";
import { supabase } from "@/lib/supabaseClient";
import { getToday, isoDaysAgo, formatDateLabel } from "@/lib/dates";
import {
  GOAL_ITEMS_BY_PERIOD,
  CANDIDATE_STEPS,
  PIPELINE_STAGES,
  isBadgeExcluded,
  STALE_CANDIDATE_DAYS,
} from "@/lib/constants";
import { checkAndAwardBadges } from "@/lib/badgeEngine";
import type { StreakDay, Goal, CalendarEvent, PipelinePeriod, Profile } from "@/lib/types";

type DownlinePipelineTotals = Record<
  "questions" | "yeses" | "qi1" | "qi2" | "is1" | "fu1" | "is2" | "fu2" | "questionnaire" | "launches",
  number
>;

const STREAK_CHECKS: { key: keyof Pick<StreakDay, "read" | "listen" | "daily_update" | "story_share">; label: string }[] = [
  { key: "read", label: "Read" },
  { key: "listen", label: "Listen" },
  { key: "daily_update", label: "Daily Update" },
  { key: "story_share", label: "Story Share" },
];

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type ActiveCandidateRow = {
  id: string;
  name: string;
  current_step: number;
  connected_date: string;
};

type StaleCandidateRow = {
  id: string;
  name: string;
  current_step: number;
  updated_at: string;
  daysStale: number;
};

type MissionItem = {
  key: string;
  icon: string;
  text: string;
  sub?: string;
  href: string;
  actionLabel: string;
};

type DownlineActiveCandidateRow = ActiveCandidateRow & {
  rep_first_name: string | null;
  rep_last_name: string | null;
  rep_team: string | null;
};

function stepLabel(step: number): string {
  return CANDIDATE_STEPS[step]?.label ?? `Step ${step}`;
}

function groupByRep(rows: DownlineActiveCandidateRow[]): { repName: string; items: DownlineActiveCandidateRow[] }[] {
  const groups: { repName: string; items: DownlineActiveCandidateRow[] }[] = [];
  const indexByName = new Map<string, number>();
  for (const row of rows) {
    const repName =
      row.rep_first_name && row.rep_last_name ? `${row.rep_first_name} ${row.rep_last_name}` : "Unknown";
    const existingIndex = indexByName.get(repName);
    if (existingIndex === undefined) {
      indexByName.set(repName, groups.length);
      groups.push({ repName, items: [row] });
    } else {
      groups[existingIndex].items.push(row);
    }
  }
  return groups;
}

export default function DashboardPage() {
  const { user, ownerId, unlockedThrough } = useAuth();
  const today = getToday();
  // Today is reachable from the bottom nav at every tier, but its cards
  // link to pages that are still gated at later tiers - only show a card
  // once its destination is actually unlocked, so it never links
  // somewhere that immediately bounces back to Onboarding.
  const showStreak = unlockedThrough >= minSessionFor("/streak");
  const showGoals = unlockedThrough >= minSessionFor("/goals");
  const showPipeline = unlockedThrough >= minSessionFor("/pipeline");

  const [loading, setLoading] = useState(true);
  const [streakToday, setStreakToday] = useState<StreakDay | null>(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [dailyGoals, setDailyGoals] = useState<Goal[]>([]);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [todayPipeline, setTodayPipeline] = useState<PipelinePeriod | null>(null);
  const [downlineTodayTotals, setDownlineTodayTotals] = useState<DownlinePipelineTotals | null>(null);
  const [dream, setDream] = useState("");
  const [staleCandidate, setStaleCandidate] = useState<StaleCandidateRow | null>(null);
  const [myActiveCount, setMyActiveCount] = useState(0);
  const [downlineActiveCount, setDownlineActiveCount] = useState(0);

  const [activeModal, setActiveModal] = useState<"mine" | "downline" | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [myActiveCandidates, setMyActiveCandidates] = useState<ActiveCandidateRow[]>([]);
  const [downlineActiveCandidates, setDownlineActiveCandidates] = useState<DownlineActiveCandidateRow[]>([]);

  // Resolves a linked spouse's id in either direction (household_id is
  // only ever stored on one side) - same reason the Calendar page needs
  // this on top of `ownerId`: a calendar event is filed under whichever
  // spouse actually added it (ownerId at insert time), which isn't
  // necessarily this account's own user.id. Without this, "Today's
  // Calendar" here only ever found events filed under user.id and missed
  // every one filed under the household's shared ownerId or a spouse's
  // own id - i.e. most real events, since Calendar itself writes new
  // ones under ownerId, not user.id.
  const [partnerId, setPartnerId] = useState<string | null>(null);
  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc("get_household_partner_id");
      setPartnerId((data as string | null) ?? null);
    }
    load();
  }, [user.id]);

  async function openMyActiveModal() {
    setActiveModal("mine");
    setModalLoading(true);
    const { data } = await supabase.rpc("get_my_active_candidates");
    setMyActiveCandidates((data as ActiveCandidateRow[]) ?? []);
    setModalLoading(false);
  }

  async function openDownlineActiveModal() {
    setActiveModal("downline");
    setModalLoading(true);
    const { data } = await supabase.rpc("get_downline_active_candidates");
    setDownlineActiveCandidates((data as DownlineActiveCandidateRow[]) ?? []);
    setModalLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      // Built via JS Date (local-time parsed, since the string has no
      // timezone suffix) rather than passed as a bare "YYYY-MM-DDTHH:mm:ss"
      // string straight to the query - a bare string like that gets
      // interpreted by Postgres in ITS OWN session timezone (UTC), not the
      // browser's, which would silently widen or narrow "today" depending
      // on which side of UTC the viewer's timezone falls on.
      const todayStart = new Date(`${today}T00:00:00`);
      const tomorrow = new Date(`${today}T00:00:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Same reason the Calendar page queries all three: a calendar event
      // is filed under whichever spouse's ownerId was canonical at insert
      // time, not necessarily this account's own user.id.
      const calendarIds = Array.from(
        new Set([user.id, ownerId, partnerId].filter((id): id is string => Boolean(id)))
      );

      const staleThresholdIso = isoDaysAgo(STALE_CANDIDATE_DAYS);

      const [
        { data: streakRow },
        { data: streakCount },
        { data: goals },
        { data: events },
        { data: pipeline },
        { data: activeSummary },
        { data: downlineTotals },
        { data: profileDreams },
        { data: staleCandidateRow },
      ] = await Promise.all([
        supabase.from("streak_days").select("*").eq("user_id", user.id).eq("day", today).maybeSingle(),
        supabase.rpc("get_current_streak", { p_user_id: user.id }),
        supabase.from("goals").select("*").eq("user_id", user.id).eq("period", "daily"),
        supabase
          .from("calendar_events")
          .select("*")
          .in("user_id", calendarIds)
          .gte("event_at", todayStart.toISOString())
          .lt("event_at", tomorrow.toISOString())
          .order("event_at", { ascending: true }),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "daily")
          .eq("period_start", today)
          .maybeSingle(),
        supabase.rpc("get_my_active_pipeline_summary").maybeSingle(),
        supabase.rpc("get_downline_pipeline_totals", { p_period_type: "daily", p_period_start: today }).maybeSingle(),
        supabase
          .from("profiles")
          .select("dream_5_year,dream_10_year,dream_lifetime")
          .eq("id", user.id)
          .single(),
        // The single longest-untouched active candidate, for the "follow
        // up with X" mission item - candidates.updated_at is already
        // stamped on every real edit (step move, note, launch/filter), so
        // this doubles as "how long since I last did anything with them."
        supabase
          .from("candidates")
          .select("id,name,current_step,updated_at")
          .eq("user_id", ownerId)
          .eq("launched", false)
          .eq("filtered_out", false)
          .lt("updated_at", staleThresholdIso)
          .order("updated_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!cancelled) {
        setStreakToday((streakRow as StreakDay) ?? null);
        setCurrentStreak((streakCount as number) ?? 0);
        setDailyGoals((goals as Goal[]) ?? []);
        // A broadcast/company event inserts one row per recipient profile -
        // once a household's ids are merged above, both spouses' own copies
        // of the same standing event would otherwise double-count here.
        // Same dedupe key the Calendar page uses.
        const seenEventKeys = new Set<string>();
        const dedupedEvents = ((events as CalendarEvent[]) ?? []).filter((e) => {
          const key = `${e.title}|${e.event_at}|${e.notes}`;
          if (seenEventKeys.has(key)) return false;
          seenEventKeys.add(key);
          return true;
        });
        setTodayEvents(dedupedEvents);
        setTodayPipeline((pipeline as PipelinePeriod) ?? null);
        setDownlineTodayTotals((downlineTotals as DownlinePipelineTotals) ?? null);
        const summary = activeSummary as { my_active_count: number; downline_active_count: number } | null;
        setMyActiveCount(summary?.my_active_count ?? 0);
        setDownlineActiveCount(summary?.downline_active_count ?? 0);
        const dreams = profileDreams as Pick<Profile, "dream_5_year" | "dream_10_year" | "dream_lifetime"> | null;
        // Lead with whichever horizon is filled in, furthest-out first -
        // the lifetime dream is the one worth being reminded of most, but
        // most people won't have filled in all three right away.
        setDream(dreams?.dream_lifetime || dreams?.dream_10_year || dreams?.dream_5_year || "");
        const staleRow = staleCandidateRow as Omit<StaleCandidateRow, "daysStale"> | null;
        setStaleCandidate(
          staleRow
            ? {
                ...staleRow,
                daysStale: Math.floor(
                  (Date.now() - new Date(staleRow.updated_at).getTime()) / (24 * 60 * 60 * 1000)
                ),
              }
            : null
        );
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user.id, ownerId, partnerId, today]);

  // Opportunistic badge check - Today is the one screen almost everyone
  // opens regularly, so this is the main place new badges actually get
  // noticed and notified, without hooking into every single save action
  // across Pipeline/Streak/Volume that could theoretically cross a
  // threshold.
  useEffect(() => {
    if (isBadgeExcluded(user.email)) return;
    checkAndAwardBadges(ownerId);
  }, [ownerId, user.email]);

  const goalTarget = (metric: string) => dailyGoals.find((g) => g.metric === metric)?.target ?? 0;
  const hasAnyDailyGoal = dailyGoals.some((g) => g.target > 0);

  // A handful of concrete, prioritized "do this next" items instead of
  // just a stats recap - reuses data already fetched above for the other
  // cards, so this adds no extra queries. Deliberately limited to metrics
  // with one reliable source: Questions/Yeses come straight from
  // pipeline_periods (same number the Pipeline Tracker itself shows), not
  // the harder-to-pin-down metrics (reading minutes, audios, conversations)
  // that an earlier goals-progress attempt dropped for being confusing
  // when the "actual" side came from more than one place.
  const missionItems: MissionItem[] = [];

  if (showPipeline && staleCandidate) {
    missionItems.push({
      key: "stale-candidate",
      icon: "👋",
      text: `Follow up with ${staleCandidate.name}`,
      sub: `No movement in ${staleCandidate.daysStale} day${staleCandidate.daysStale === 1 ? "" : "s"} — still at ${stepLabel(staleCandidate.current_step)}`,
      href: "/pipeline",
      actionLabel: "Go to Pipeline",
    });
  }

  if (todayEvents.length > 0) {
    const first = todayEvents[0];
    missionItems.push({
      key: "meetings",
      icon: "📅",
      text: todayEvents.length === 1 ? first.title : `${todayEvents.length} events today`,
      sub: todayEvents.length === 1 ? formatEventTime(first.event_at) : `First at ${formatEventTime(first.event_at)}`,
      href: "/calendar",
      actionLabel: "View Calendar",
    });
  }

  if (showStreak) {
    const missingChecks = STREAK_CHECKS.filter((c) => !streakToday?.[c.key]);
    if (missingChecks.length > 0) {
      missionItems.push({
        key: "core-run",
        icon: "🔥",
        text: "Finish your Core Run",
        sub: `Still need: ${missingChecks.map((c) => c.label).join(", ")}`,
        href: "/streak",
        actionLabel: "Log It",
      });
    }
  }

  if (showGoals && showPipeline && todayPipeline) {
    for (const [metric, noun] of [
      ["questions", "question"],
      ["yeses", "yes"],
    ] as const) {
      const target = goalTarget(metric);
      const actual = (todayPipeline[metric] as number) ?? 0;
      if (target > 0 && actual < target) {
        const remaining = target - actual;
        missionItems.push({
          key: `goal-${metric}`,
          icon: "🎯",
          text: `${remaining} more ${noun}${remaining === 1 ? "" : "s"} today`,
          href: "/streak",
          actionLabel: "Log It",
        });
      }
    }
  }

  // Doc's own cap: no more than 3-5 items so this stays a quick scan, not
  // another wall of stuff to read - priority order above (stale
  // candidate, meetings, Core Run, goal gaps) already puts the most
  // time-sensitive things first.
  const mission = missionItems.slice(0, 5);

  const todayStats = [
    ...(todayPipeline
      ? PIPELINE_STAGES.map((s) => ({ label: s.label, value: todayPipeline[s.key] as number }))
      : []),
    // Meetings are logged on the Core Run Streak page, not the Pipeline
    // Tracker, but they belong on this "everything that happened today"
    // card too.
    { label: "Meetings", value: streakToday?.meetings ?? 0 },
  ].filter((s) => s.value > 0);

  // Same treatment for the downline total: only stages someone actually
  // logged something in show up, rather than a wall of "QI1: 0"s.
  const downlineStats = downlineTodayTotals
    ? PIPELINE_STAGES.map((s) => ({ label: s.label, value: downlineTodayTotals[s.key] })).filter(
        (s) => s.value > 0
      )
    : [];

  return (
    <>
      <PageHeader title="Today" subtitle={formatDateLabel(today)} />
      <main className="page-main">
        {loading ? (
          <SkeletonList cards={4} />
        ) : (
          <>
            <div className="card space-y-2">
              <p className="section-title">🎯 Today&apos;s Mission</p>
              {mission.length === 0 ? (
                <p className="text-sm text-slate-400">
                  🎉 You&apos;re all caught up — nothing urgent right now.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {mission.map((item) => (
                    <Link
                      key={item.key}
                      href={item.href}
                      className="flex items-center justify-between gap-2 rounded-lg bg-navy px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {item.icon} {item.text}
                        </p>
                        {item.sub && <p className="truncate text-xs text-slate-400">{item.sub}</p>}
                      </div>
                      <span className="pill-amber shrink-0 text-xs">{item.actionLabel}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {showGoals && dream && (
              <Link href="/goals" className="card block space-y-1">
                <p className="section-title">🌟 Remember Your Why</p>
                <p className="line-clamp-2 text-sm text-slate-300">{dream}</p>
              </Link>
            )}

            {showStreak && (
              <Link href="/streak" className="card block space-y-2">
                <div className="flex items-center justify-between">
                  <p className="section-title">🔥 Core Run Streak</p>
                  <span className="pill pill-amber">{currentStreak}d</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STREAK_CHECKS.map((c) => (
                    <span key={c.key} className={streakToday?.[c.key] ? "pill-amber" : "pill"}>
                      {streakToday?.[c.key] ? "✅" : "⬜"} {c.label}
                    </span>
                  ))}
                </div>
              </Link>
            )}

            {showGoals && (
              <Link href="/goals" className="card block space-y-2">
                <p className="section-title">🎯 Today&apos;s Goals</p>
                {hasAnyDailyGoal ? (
                  <div className="space-y-1">
                    {GOAL_ITEMS_BY_PERIOD.daily
                      .filter((item) => goalTarget(item.key) > 0)
                      .map((item) => (
                        <div key={item.key} className="flex items-center justify-between text-sm">
                          <span className="text-slate-300">
                            {item.prefix} {item.suffix}
                          </span>
                          <span className="pill">{goalTarget(item.key)}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No daily goals set yet — tap to set some.</p>
                )}
              </Link>
            )}

            <Link href="/calendar" className="card block space-y-2">
              <p className="section-title">📅 Today&apos;s Calendar</p>
              {todayEvents.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing on your calendar today.</p>
              ) : (
                <div className="space-y-1.5">
                  {todayEvents.map((e) => (
                    <div key={e.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-200">{e.title}</span>
                      <span className="pill">{formatEventTime(e.event_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Link>

            {showPipeline && (
              <div className="card space-y-2">
                <Link href="/pipeline" className="block space-y-2">
                  <p className="section-title">📊 Today&apos;s Stats</p>
                  {todayStats.length === 0 && downlineStats.length === 0 ? (
                    <p className="text-sm text-slate-400">Nothing logged yet today.</p>
                  ) : (
                    <>
                      {todayStats.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {todayStats.map((s) => (
                            <span key={s.label} className="pill pill-amber">
                              {s.label}: {s.value}
                            </span>
                          ))}
                        </div>
                      )}
                      {downlineStats.length > 0 && (
                        <>
                          <p className="text-xs text-slate-500">Downline Today</p>
                          <div className="flex flex-wrap gap-1.5">
                            {downlineStats.map((s) => (
                              <span key={s.label} className="pill">
                                {s.label}: {s.value}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </Link>
                {(myActiveCount > 0 || downlineActiveCount > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {myActiveCount > 0 && (
                      <button className="pill" onClick={openMyActiveModal}>
                        My Active Pipeline: {myActiveCount}
                      </button>
                    )}
                    {downlineActiveCount > 0 && (
                      <button className="pill" onClick={openDownlineActiveModal}>
                        Downline Active: {downlineActiveCount}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-navy-lighter p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="section-title">
                {activeModal === "mine" ? "My Active Pipeline" : "Downline Active Pipeline"}
              </p>
              <button
                className="btn-icon !h-7 !w-7 text-sm"
                onClick={() => setActiveModal(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {modalLoading ? (
              <SkeletonRows rows={3} />
            ) : activeModal === "mine" ? (
              myActiveCandidates.length === 0 ? (
                <p className="text-sm text-slate-400">No active candidates.</p>
              ) : (
                <div className="space-y-1.5">
                  {myActiveCandidates.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg bg-navy px-2.5 py-2 text-sm"
                    >
                      <span className="text-slate-200">{c.name}</span>
                      <span className="pill">{stepLabel(c.current_step)}</span>
                    </div>
                  ))}
                </div>
              )
            ) : downlineActiveCandidates.length === 0 ? (
              <p className="text-sm text-slate-400">No active candidates in your downline.</p>
            ) : (
              <div className="space-y-3">
                {groupByRep(downlineActiveCandidates).map((group) => (
                  <div key={group.repName} className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {group.repName}
                    </p>
                    {group.items.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-lg bg-navy px-2.5 py-2 text-sm"
                      >
                        <span className="text-slate-200">{c.name}</span>
                        <span className="pill">{stepLabel(c.current_step)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
