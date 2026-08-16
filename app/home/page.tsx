"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Trophy,
  Flame,
  Bot,
  GraduationCap,
  Camera,
  Bell,
  Target,
  Contact,
  Package,
  Users,
  Library,
  TrendingUp,
  Gamepad2,
  Medal,
  PartyPopper,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import { minSessionFor } from "@/lib/onboarding-gate";
import { supabase } from "@/lib/supabaseClient";
import { getWeekStart } from "@/lib/dates";
import { ONBOARDING_SESSIONS } from "@/lib/constants";
import type { MyRankEntry } from "@/lib/types";

// Plain wording, not a status enum lookup like BottomNav's dot colors -
// this reads as a sentence in a big card, not a glanceable dot, so it
// can afford to spell out what to do next.
const CORE_RUN_STATUS_COPY: Record<string, string> = {
  done: "Today's Core Run is done",
  off_day: "Off Day — streak protected",
  at_risk: "At risk — log today or yesterday",
  pending: "Not logged yet today",
};

// Cycled per tile below, not tied to the account-wide colorway
// (profiles.theme_color) - this is just visual variety for the grid, same
// idea as the App Store's Browse tiles each getting their own color.
const TILE_COLORS: { from: string; to: string }[] = [
  { from: "#7dd3fc", to: "#0369a1" }, // sky
  { from: "#6ee7b7", to: "#047857" }, // emerald
  { from: "#c4b5fd", to: "#6d28d9" }, // violet
  { from: "#5eead4", to: "#0f766e" }, // teal
  { from: "#fda4af", to: "#be123c" }, // rose
  { from: "#fde68a", to: "#b45309" }, // amber
];

const HOME_ITEMS: { href: string; label: string; icon: LucideIcon; description: string }[] = [
  { href: "/stories", label: "Stories", icon: Camera, description: "Today's prompt - gone in 24h." },
  { href: "/notifications", label: "Notifications", icon: Bell, description: "Every push we've sent you." },
  { href: "/goals", label: "Goals", icon: Target, description: "Targets and your dreams." },
  { href: "/contacts", label: "Contacts", icon: Contact, description: "Your A/B/Customer list." },
  { href: "/volume", label: "Volume", icon: Package, description: "Personal PV and Ditto." },
  // Visible to everyone: admins see the whole company, everyone else
  // sees their own upline chain and downline (RLS scopes it either way).
  { href: "/team", label: "Team", icon: Users, description: "Downline, upline, totals." },
  { href: "/library", label: "Resources", icon: Library, description: "Process, scripts, leaders." },
  { href: "/insights", label: "Insights", icon: TrendingUp, description: "Trends, pace, and your funnel." },
  { href: "/games", label: "Games", icon: Gamepad2, description: "Diamond Run, Chase, Trivia." },
  { href: "/badges", label: "Badges", icon: Medal, description: "Achievements you've earned." },
  { href: "/events", label: "Team Events", icon: PartyPopper, description: "Photos and videos." },
  { href: "/ideas", label: "Innovation Box", icon: Lightbulb, description: "Submit and vote on ideas." },
];

function HeroCard({
  href,
  icon: Icon,
  label,
  subtitle,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="relative flex items-center gap-4 rounded-2xl border p-4 transition active:scale-[0.98]"
      style={{
        background: "rgb(var(--amber-rgb) / 0.1)",
        borderColor: "rgb(var(--amber-rgb) / 0.3)",
        boxShadow: "0 0 24px -8px rgb(var(--amber-rgb) / 0.4)",
      }}
    >
      <Icon className="h-9 w-9 shrink-0 text-amber-light" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-extrabold text-white">{label}</p>
        <p className="truncate text-sm text-slate-300">{subtitle}</p>
      </div>
      <span className="text-2xl text-amber-light" aria-hidden>
        ›
      </span>
    </Link>
  );
}

export default function HomePage() {
  const { user, unlockedThrough, coreRunStatus, unreadNotificationCount } = useAuth();
  const visibleItems = HOME_ITEMS.filter((item) => unlockedThrough >= minSessionFor(item.href));
  // Pipeline and Assistant are session-gated everywhere else (BottomNav,
  // the old More grid) - their hero cards follow the same rule rather
  // than teasing a page that isn't unlocked yet. Classroom (Onboarding)
  // isn't gated - it's available from signup - so its card always shows.
  const showPipeline = unlockedThrough >= minSessionFor("/pipeline");
  const showAssistant = unlockedThrough >= minSessionFor("/assistant");
  const classroomUnlocked = Math.min(unlockedThrough, ONBOARDING_SESSIONS.length);

  const [heroLoading, setHeroLoading] = useState(true);
  const [streakCount, setStreakCount] = useState(0);
  const [activePipelineCount, setActivePipelineCount] = useState(0);
  const [myRank, setMyRank] = useState<MyRankEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setHeroLoading(true);
      const [{ data: streak }, { data: pipelineSummary }, { data: rankRows }] = await Promise.all([
        supabase.rpc("get_current_streak", { p_user_id: user.id }),
        showPipeline
          ? supabase.rpc("get_my_active_pipeline_summary").maybeSingle()
          : Promise.resolve({ data: null }),
        // Fixed to this week's Questions, same call the Leaderboard page
        // itself makes for "Your Rank" - one clear number here too,
        // rather than a picker on a card meant to be a quick glance.
        supabase.rpc("get_my_rank", {
          p_period_type: "weekly",
          p_period_start: getWeekStart(),
          p_stage_key: "questions",
        }),
      ]);
      if (!cancelled) {
        setStreakCount((streak as number) ?? 0);
        setActivePipelineCount(
          (pipelineSummary as { my_active_count: number } | null)?.my_active_count ?? 0
        );
        setMyRank(((rankRows as MyRankEntry[]) ?? [])[0] ?? null);
        setHeroLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user.id, showPipeline]);

  return (
    <>
      <PageHeader title="Home" subtitle="Your most important numbers, plus everything else" />
      <main className="page-main">
        {heroLoading ? (
          <SkeletonList cards={3 + (showPipeline ? 1 : 0) + (showAssistant ? 1 : 0)} lines={1} />
        ) : (
          <div className="space-y-3">
            {showPipeline && (
              <HeroCard
                href="/pipeline"
                icon={BarChart3}
                label="Pipeline"
                subtitle={
                  activePipelineCount > 0
                    ? `${activePipelineCount} active candidate${activePipelineCount === 1 ? "" : "s"}`
                    : "No active candidates yet — let's fill it"
                }
              />
            )}

            <HeroCard
              href="/leaderboard"
              icon={Trophy}
              label="Leaderboard"
              subtitle={myRank ? `#${myRank.rank} of ${myRank.total} this week` : "Log Questions this week to rank"}
            />

            <HeroCard
              href="/streak"
              icon={Flame}
              label="Core Run"
              subtitle={`${streakCount}-day streak${coreRunStatus ? ` · ${CORE_RUN_STATUS_COPY[coreRunStatus]}` : ""}`}
            />

            {showAssistant && (
              <HeroCard href="/assistant" icon={Bot} label="Assistant" subtitle="Practice a role-play conversation" />
            )}

            <HeroCard
              href="/onboarding"
              icon={GraduationCap}
              label="Classroom"
              subtitle={`${classroomUnlocked}/${ONBOARDING_SESSIONS.length} sessions unlocked`}
            />
          </div>
        )}

        <p className="section-title">Everything else</p>
        <div className="grid grid-cols-2 gap-3">
          {visibleItems.map((item, i) => {
            const color = TILE_COLORS[i % TILE_COLORS.length];
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex min-h-[132px] flex-col justify-end overflow-hidden rounded-2xl p-3.5 transition active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${color.from}, ${color.to})`,
                  boxShadow: "0 10px 24px -12px rgba(0,0,0,0.55)",
                }}
              >
                <item.icon
                  className="pointer-events-none absolute -right-3 -top-3 h-24 w-24 text-white opacity-25"
                  strokeWidth={1.5}
                  aria-hidden
                />
                {item.href === "/notifications" && unreadNotificationCount > 0 && (
                  <span
                    className="absolute right-2 top-2 z-20 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-[0_2px_6px_-1px_rgba(0,0,0,0.5)]"
                    aria-label={`${unreadNotificationCount} unread notification${unreadNotificationCount === 1 ? "" : "s"}`}
                  >
                    {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                  </span>
                )}
                <div className="relative z-10">
                  <p className="text-base font-extrabold leading-tight text-white drop-shadow-sm">
                    {item.label}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-white/85">{item.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
