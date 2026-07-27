"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { minSessionFor } from "@/lib/onboarding-gate";
import { supabase } from "@/lib/supabaseClient";
import { getToday, formatDateLabel } from "@/lib/dates";
import { GOAL_ITEMS_BY_PERIOD, CANDIDATE_STEPS } from "@/lib/constants";
import type { StreakDay, Goal, CalendarEvent, PipelinePeriod } from "@/lib/types";

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
  const [myActiveCount, setMyActiveCount] = useState(0);
  const [downlineActiveCount, setDownlineActiveCount] = useState(0);

  const [activeModal, setActiveModal] = useState<"mine" | "downline" | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [myActiveCandidates, setMyActiveCandidates] = useState<ActiveCandidateRow[]>([]);
  const [downlineActiveCandidates, setDownlineActiveCandidates] = useState<DownlineActiveCandidateRow[]>([]);

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
      const tomorrow = new Date(`${today}T00:00:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [
        { data: streakRow },
        { data: streakCount },
        { data: goals },
        { data: events },
        { data: pipeline },
        { data: activeSummary },
      ] = await Promise.all([
        supabase.from("streak_days").select("*").eq("user_id", user.id).eq("day", today).maybeSingle(),
        supabase.rpc("get_current_streak", { p_user_id: user.id }),
        supabase.from("goals").select("*").eq("user_id", user.id).eq("period", "daily"),
        supabase
          .from("calendar_events")
          .select("*")
          .eq("user_id", user.id)
          .gte("event_at", `${today}T00:00:00`)
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
      ]);

      if (!cancelled) {
        setStreakToday((streakRow as StreakDay) ?? null);
        setCurrentStreak((streakCount as number) ?? 0);
        setDailyGoals((goals as Goal[]) ?? []);
        setTodayEvents((events as CalendarEvent[]) ?? []);
        setTodayPipeline((pipeline as PipelinePeriod) ?? null);
        const summary = activeSummary as { my_active_count: number; downline_active_count: number } | null;
        setMyActiveCount(summary?.my_active_count ?? 0);
        setDownlineActiveCount(summary?.downline_active_count ?? 0);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user.id, ownerId, today]);

  const goalTarget = (metric: string) => dailyGoals.find((g) => g.metric === metric)?.target ?? 0;
  const hasAnyDailyGoal = dailyGoals.some((g) => g.target > 0);
  const todayStats = [
    ...(todayPipeline
      ? [
          { label: "Questions", value: todayPipeline.questions },
          { label: "Yeses", value: todayPipeline.yeses },
          { label: "QI1", value: todayPipeline.qi1 },
          { label: "QI2", value: todayPipeline.qi2 },
          { label: "Launches", value: todayPipeline.launches },
        ]
      : []),
    // Meetings are logged on the Core Run Streak page, not the Pipeline
    // Tracker, but they belong on this "everything that happened today"
    // card too.
    { label: "Meetings", value: streakToday?.meetings ?? 0 },
  ].filter((s) => s.value > 0);

  return (
    <>
      <PageHeader title="Today" subtitle={formatDateLabel(today)} />
      <main className="page-main">
        {loading ? (
          <div className="empty-state">Loading today…</div>
        ) : (
          <>
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
                  {todayStats.length === 0 ? (
                    <p className="text-sm text-slate-400">Nothing logged yet today.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {todayStats.map((s) => (
                        <span key={s.label} className="pill pill-amber">
                          {s.label}: {s.value}
                        </span>
                      ))}
                    </div>
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
              <p className="text-sm text-slate-400">Loading…</p>
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
