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
  DollarSign,
  Users,
  Library,
  TrendingUp,
  Gamepad2,
  Medal,
  PartyPopper,
  Lightbulb,
  Star,
  Snowflake,
  Egg,
  Wallet,
  Flag,
  Sparkles,
  TreePine,
  Gift,
  Heart,
  HeartHandshake,
  Rabbit,
  Cross,
  Flower2,
  Clover,
  Rainbow,
  Coins,
  Wheat,
  Leaf,
  Sprout,
  Clock,
  type LucideIcon,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { SkeletonList } from "@/components/Skeleton";
import WelcomeVideoLockCard from "@/components/WelcomeVideoLockCard";
import { useAuth } from "@/components/AuthGate";
import { minSessionFor } from "@/lib/onboarding-gate";
import { supabase } from "@/lib/supabaseClient";
import { getWeekStart } from "@/lib/dates";
import { ONBOARDING_SESSIONS, type ThemeColor } from "@/lib/constants";
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

// Flavor palettes for the "decked out" App Colors - every holiday
// colorway, not just a plain accent pick. Unlike the solid colorways
// (Amber, Sky Blue, Gold, ...), which stay a single from-light-to-dark
// gradient across every tile via the theme-reactive --color-amber-*
// variables, these cycle each tile through a small on-brand palette
// (e.g. USA alternates red/white/blue) AND a small decorative corner
// icon that itself cycles through several motifs (a flag on one tile, a
// star on the next, a firework burst on the one after) rather than the
// same single icon repeated everywhere - a scatter of different
// ornaments/hearts/eggs reads as "decked out" in a way one repeated
// glyph doesn't. `decor` cycles independently of `gradients` (different
// lengths are fine and intentional - it keeps the icon/color pairing
// from repeating in lockstep across the grid). Deliberately hardcoded
// hex, not CSS variables - these colors ARE the theme, not a tint of it.
const FLAVOR_TILES: Partial<
  Record<ThemeColor, { gradients: { from: string; to: string; onLight?: boolean }[]; decor: LucideIcon[] }>
> = {
  usa: {
    gradients: [
      { from: "#ef4444", to: "#7f1d1d" },
      { from: "#f8fafc", to: "#cbd5e1", onLight: true },
      { from: "#60a5fa", to: "#1e3a8a" },
    ],
    decor: [Flag, Star, Sparkles],
  },
  christmas: {
    gradients: [
      { from: "#ef4444", to: "#991b1b" },
      { from: "#4ade80", to: "#166534" },
      { from: "#fde68a", to: "#92400e" },
    ],
    decor: [TreePine, Gift, Snowflake, Bell],
  },
  valentines: {
    gradients: [
      { from: "#f9a8d4", to: "#be123c" },
      { from: "#fecdd3", to: "#9f1239" },
      { from: "#f472b6", to: "#831843" },
    ],
    decor: [Heart, HeartHandshake, Sparkles],
  },
  easter: {
    gradients: [
      { from: "#f9a8d4", to: "#db2777" },
      { from: "#c4b5fd", to: "#7c3aed" },
      { from: "#fde68a", to: "#ca8a04", onLight: true },
      { from: "#93c5fd", to: "#2563eb" },
    ],
    decor: [Egg, Rabbit, Cross, Flower2],
  },
  stpatricks: {
    gradients: [
      { from: "#86efac", to: "#166534" },
      { from: "#4ade80", to: "#14532d" },
      { from: "#fde047", to: "#78350f" },
    ],
    decor: [Clover, Rainbow, Coins],
  },
  harvest: {
    gradients: [
      { from: "#fb923c", to: "#7c2d12" },
      { from: "#fbbf24", to: "#92400e" },
      { from: "#fca5a5", to: "#7f1d1d" },
    ],
    decor: [Wheat, Leaf, Sprout],
  },
  hanukkah: {
    gradients: [
      { from: "#93c5fd", to: "#1e3a8a" },
      { from: "#bfdbfe", to: "#1e40af" },
      { from: "#e0e7ff", to: "#3730a3" },
    ],
    decor: [Star, Flame, Sparkles],
  },
  newyears: {
    gradients: [
      { from: "#fde047", to: "#1e293b" },
      { from: "#fbbf24", to: "#0f172a" },
      { from: "#facc15", to: "#334155" },
    ],
    decor: [PartyPopper, Sparkles, Clock],
  },
  fireworks: {
    gradients: [
      { from: "#fbbf24", to: "#7f1d1d" },
      { from: "#f472b6", to: "#581c87" },
      { from: "#67e8f9", to: "#1e3a8a" },
    ],
    decor: [Sparkles, PartyPopper, Star],
  },
};

// Every theme here keeps the normal single (theme-reactive) gradient
// tile but gets a moving diagonal shine sweep on top (see .tile-shine in
// globals.css) - the thing a flat gradient alone can't sell as "metal"
// or "gem." Cheap to extend (just adding a key here, no palette/icon
// design work like FLAVOR_TILES above needs), so every metal/gem/
// sparkle-coded colorway from the batch-2 rollout got added too, not
// just the original three.
const SHINE_THEMES: ThemeColor[] = [
  "gold",
  "silver",
  "metallic",
  "ruby",
  "sapphire",
  "amethyst",
  "rosegold",
  "platinum",
  "copper",
  "obsidian",
  "opal",
  "pearl",
  "diamond",
  "foundersdiamond",
  "newyears",
];

const HOME_ITEMS: { href: string; label: string; icon: LucideIcon; description: string }[] = [
  { href: "/stories", label: "Stories", icon: Camera, description: "Today's prompt - gone in 24h." },
  { href: "/notifications", label: "Notifications", icon: Bell, description: "Every push we've sent you." },
  { href: "/goals", label: "Goals", icon: Target, description: "Targets and your dreams." },
  { href: "/budget", label: "Budget", icon: Wallet, description: "Your Session 1 budget worksheet." },
  { href: "/contacts", label: "Contacts", icon: Contact, description: "Your A/B/Customer list." },
  { href: "/volume", label: "PV", icon: DollarSign, description: "Personal PV and Ditto." },
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
  const { user, unlockedThrough, coreRunStatus, unreadNotificationCount, themeColor, welcomeVideoWatchedAt, refreshProfile } =
    useAuth();
  // Local so watching it hides the card immediately instead of waiting
  // on refreshProfile's round trip - refreshProfile is still called (see
  // onWatched below) so the AuthGate-level value (and everything else
  // derived from it, like Onboarding Session 1's own lock) catches up too.
  const [videoWatched, setVideoWatched] = useState(Boolean(welcomeVideoWatchedAt));
  const visibleItems = HOME_ITEMS.filter((item) => unlockedThrough >= minSessionFor(item.href));
  const flavorTiles = FLAVOR_TILES[themeColor];
  const shineTiles = SHINE_THEMES.includes(themeColor);
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
        {!videoWatched && (
          <WelcomeVideoLockCard
            userId={user.id}
            onWatched={() => {
              setVideoWatched(true);
              refreshProfile();
            }}
          />
        )}

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
            const tile = flavorTiles?.gradients[i % flavorTiles.gradients.length];
            const background = tile
              ? `linear-gradient(135deg, ${tile.from}, ${tile.to})`
              : "linear-gradient(135deg, var(--color-amber-light), var(--color-amber-dark))";
            const onLight = tile?.onLight ?? false;
            const Decor = flavorTiles?.decor[i % flavorTiles.decor.length];
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex min-h-[132px] flex-col justify-end overflow-hidden rounded-2xl p-3.5 transition active:scale-95"
                style={{ background, boxShadow: "0 10px 24px -12px rgba(0,0,0,0.55)" }}
              >
                {shineTiles && <span className="tile-shine" aria-hidden />}
                <item.icon
                  className={`pointer-events-none absolute -right-3 -top-3 h-24 w-24 opacity-25 ${
                    onLight ? "text-ink" : "text-paper"
                  }`}
                  strokeWidth={1.5}
                  aria-hidden
                />
                {Decor && (
                  <Decor
                    className={`pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 ${
                      onLight ? "text-ink/45" : "text-paper/70"
                    }`}
                    strokeWidth={2}
                    aria-hidden
                  />
                )}
                {item.href === "/notifications" && unreadNotificationCount > 0 && (
                  <span
                    className="absolute right-2 top-2 z-20 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-paper shadow-[0_2px_6px_-1px_rgba(0,0,0,0.5)]"
                    aria-label={`${unreadNotificationCount} unread notification${unreadNotificationCount === 1 ? "" : "s"}`}
                  >
                    {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                  </span>
                )}
                <div className="relative z-10">
                  <p
                    className={`text-base font-extrabold leading-tight drop-shadow-sm ${
                      onLight ? "text-ink" : "text-paper"
                    }`}
                  >
                    {item.label}
                  </p>
                  <p className={`mt-1 text-[11px] leading-snug ${onLight ? "text-ink/70" : "text-paper/85"}`}>
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
