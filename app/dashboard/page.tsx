"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { getToday, formatDateLabel } from "@/lib/dates";
import { GOAL_ITEMS_BY_PERIOD } from "@/lib/constants";
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

export default function DashboardPage() {
  const { user, ownerId } = useAuth();
  const today = getToday();

  const [loading, setLoading] = useState(true);
  const [streakToday, setStreakToday] = useState<StreakDay | null>(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [dailyGoals, setDailyGoals] = useState<Goal[]>([]);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [todayPipeline, setTodayPipeline] = useState<PipelinePeriod | null>(null);

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
      ]);

      if (!cancelled) {
        setStreakToday((streakRow as StreakDay) ?? null);
        setCurrentStreak((streakCount as number) ?? 0);
        setDailyGoals((goals as Goal[]) ?? []);
        setTodayEvents((events as CalendarEvent[]) ?? []);
        setTodayPipeline((pipeline as PipelinePeriod) ?? null);
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
  const pipelineActivity = todayPipeline
    ? [
        { label: "Questions", value: todayPipeline.questions },
        { label: "Yeses", value: todayPipeline.yeses },
        { label: "QI1", value: todayPipeline.qi1 },
        { label: "QI2", value: todayPipeline.qi2 },
        { label: "Launches", value: todayPipeline.launches },
      ].filter((s) => s.value > 0)
    : [];

  return (
    <>
      <PageHeader title="Today" subtitle={formatDateLabel(today)} />
      <main className="page-main">
        {loading ? (
          <div className="empty-state">Loading today…</div>
        ) : (
          <>
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

            <Link href="/pipeline" className="card block space-y-2">
              <p className="section-title">📊 Today&apos;s Pipeline</p>
              {pipelineActivity.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing logged in the pipeline yet today.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {pipelineActivity.map((s) => (
                    <span key={s.label} className="pill pill-amber">
                      {s.label}: {s.value}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          </>
        )}
      </main>
    </>
  );
}
