"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import FirstVisitTip from "@/components/FirstVisitTip";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { pointsForBadgeKeys, levelForPoints } from "@/lib/levels";
import { fireNotifyEvent } from "@/lib/notifyClient";
import LevelAvatar from "@/components/LevelAvatar";
import {
  getWeekStart,
  getMonthStart,
  getMonthStartOffset,
  formatDateLabel,
  formatMonthLabel,
  getToday,
} from "@/lib/dates";
import { PIPELINE_STAGES, STREAK_MILESTONES, type PipelineStageKey } from "@/lib/constants";
import type {
  TeamTotals,
  IndividualLeaderEntry,
  StreakLeaderboardEntry,
  Core300Entry,
  ActiveCandidatesEntry,
  Qi1RhythmEntry,
  DittoEntry,
  DailySaleEntry,
  NewMember,
  Liker,
  MilestoneEntry,
} from "@/lib/types";

type PeriodType = "daily" | "weekly" | "monthly";
type LikeInfo = { count: number; likedByMe: boolean; names: string[] };
const NO_LIKES: LikeInfo = { count: 0, likedByMe: false, names: [] };

const CATEGORIES = PIPELINE_STAGES.filter((s) => s.key !== "questions");

// The old layout was ten-plus individually-collapsed accordions in one
// long scroll - picking a category tab up front instead means whatever's
// visible is always fully expanded, and the page reads as four focused
// screens instead of one undifferentiated stack. Volume only ever applies
// to the monthly period (Core 300/Ditto are calendar-month numbers), so
// it's the one tab that can disappear depending on periodType.
type CategoryTab = "activity" | "leaders" | "consistency" | "volume";
const CATEGORY_TABS: { key: CategoryTab; label: string; icon: string }[] = [
  { key: "activity", label: "Activity", icon: "📣" },
  { key: "leaders", label: "Leaders", icon: "🏆" },
  { key: "consistency", label: "Consistency", icon: "🔥" },
  { key: "volume", label: "Volume", icon: "💰" },
];

function personName(entry: { first_name: string | null; last_name: string | null }): string {
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(" ");
  return name || "Unnamed";
}

// Set once at page level (see the fetch in LeaderboardPage) from two bulk
// RPCs (get_all_public_photos, get_all_earned_badge_keys) - PersonLink is
// used from a couple dozen call sites across every leaderboard section
// below, so a context avoids threading these two maps through every one
// of them individually.
type LevelData = {
  photoByUserId: Map<string, string>;
  levelByUserId: Map<string, number>;
};
const LevelDataContext = createContext<LevelData>({
  photoByUserId: new Map(),
  levelByUserId: new Map(),
});

// showAvatar defaults on for the many "one row = one person/couple" list
// sections, but gets turned off wherever several tied winners can render
// inline in the same wrapping paragraph (Individual Leaders' comma list) -
// a photo doesn't reflow with the text the way a word does, so more than
// one per line looked broken rather than just busy.
function PersonLink({
  entry,
  showAvatar = true,
}: {
  entry: { user_id: string; first_name: string | null; last_name: string | null };
  showAvatar?: boolean;
}) {
  const { photoByUserId, levelByUserId } = useContext(LevelDataContext);
  if (!showAvatar) {
    return (
      <Link href={`/profile/${entry.user_id}`} className="underline decoration-dotted underline-offset-2">
        {personName(entry)}
      </Link>
    );
  }
  return (
    <Link href={`/profile/${entry.user_id}`} className="inline-flex items-center gap-1 align-middle">
      <LevelAvatar
        photoUrl={photoByUserId.get(entry.user_id) ?? null}
        level={levelByUserId.get(entry.user_id) ?? 1}
        size="xs"
        showLevelChip={false}
      />
      <span className="underline decoration-dotted underline-offset-2">{personName(entry)}</span>
    </Link>
  );
}

// For household-shareable data, a linked spouse shows up as two names,
// each linking to their own profile — the shared numbers are one entity,
// but the profiles stay individual. Both halves get their own avatar
// when shown at all: badges (and therefore level) are household-merged,
// so they're always the same tier for both spouses - showing only one
// avatar made it look like just one of them had "a badge account,"
// which isn't the case.
function CoupleLink({
  entry,
  showAvatar = true,
}: {
  entry: {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    partner_user_id: string | null;
    partner_first_name: string | null;
    partner_last_name: string | null;
  };
  showAvatar?: boolean;
}) {
  if (!entry.partner_user_id) {
    return <PersonLink entry={entry} showAvatar={showAvatar} />;
  }
  return (
    <>
      <PersonLink entry={entry} showAvatar={showAvatar} /> &{" "}
      <PersonLink
        entry={{
          user_id: entry.partner_user_id,
          first_name: entry.partner_first_name,
          last_name: entry.partner_last_name,
        }}
        showAvatar={showAvatar}
      />
    </>
  );
}

function LikeButton({
  entryKey,
  targetUserId,
  likes,
  onToggle,
}: {
  entryKey: string;
  // Absent for team-level rankings (no single person to notify) and for
  // an individual-category tie (ambiguous which of several winners) -
  // liking still works, it just doesn't trigger a push in those cases.
  targetUserId?: string;
  likes: LikeInfo;
  onToggle: (entryKey: string, targetUserId?: string) => void;
}) {
  // Names used to render permanently under every single row (truncated,
  // hover-title as the only way to see the rest - useless on mobile),
  // which turned a page with several rows each having a handful of
  // likers into a wall of clipped text. Collapsed behind an on-demand
  // "who?" tap instead - the heart button's own like/unlike behavior is
  // unchanged, this is a separate tap target next to it.
  const [showNames, setShowNames] = useState(false);
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onToggle(entryKey, targetUserId)}
          className={`flex items-center gap-1 text-xs transition active:scale-90 ${
            likes.likedByMe ? "text-amber-light" : "text-slate-500"
          }`}
          aria-label={likes.likedByMe ? "Unlike" : "Like"}
        >
          <span>{likes.likedByMe ? "❤️" : "🤍"}</span>
          {likes.count > 0 && <span>{likes.count}</span>}
        </button>
        {likes.names.length > 0 && (
          <button
            onClick={() => setShowNames((v) => !v)}
            className="text-[10px] text-slate-500 underline"
            aria-label={showNames ? "Hide who liked this" : "Show who liked this"}
          >
            who?
          </button>
        )}
      </div>
      {showNames && likes.names.length > 0 && (
        <p className="max-w-[160px] text-right text-[10px] text-slate-400">
          {likes.names.join(", ")}
        </p>
      )}
    </div>
  );
}

// A titled card, always fully expanded - previously every section on this
// page was a dropdown defaulting closed, so seeing anything meant tapping
// through ten-plus individual accordions one at a time. Now the page is
// split into a handful of category tabs (see CATEGORY_TABS below) instead,
// so whatever's on screen inside the active tab is always all the way
// open - no second tap needed once you've already picked a category.
function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card space-y-1.5">
      <p className="section-title">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function leadingTeams(teams: TeamTotals[], key: PipelineStageKey): TeamTotals[] {
  const max = teams.reduce((best, t) => Math.max(best, t[key]), 0);
  if (max === 0) return [];
  return teams.filter((t) => t[key] === max);
}

function teamEntryKey(periodType: PeriodType, periodStart: string, stageKey: PipelineStageKey) {
  return `team:${periodType}:${periodStart}:${stageKey}`;
}
function individualEntryKey(periodType: PeriodType, periodStart: string, stageKey: PipelineStageKey) {
  return `individual:${periodType}:${periodStart}:${stageKey}`;
}
function qi1RhythmEntryKey(periodType: PeriodType, periodStart: string, userId: string) {
  return `qi1_rhythm:${periodType}:${periodStart}:${userId}`;
}
function streakEntryKey(userId: string) {
  return `streak:${userId}`;
}
function activeCandidatesEntryKey(userId: string) {
  return `active_candidates:${userId}`;
}
function core300EntryKey(periodStart: string, userId: string) {
  return `core300:${periodStart}:${userId}`;
}
function dittoEntryKey(periodStart: string, userId: string) {
  return `ditto:${periodStart}:${userId}`;
}
function milestoneEntryKey(userId: string, milestoneDays: number) {
  return `milestone:${userId}:${milestoneDays}`;
}
function dailySaleEntryKey(saleId: string) {
  return `daily_sale:${saleId}`;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [monthsBack, setMonthsBack] = useState(0);
  const [activeTab, setActiveTab] = useState<CategoryTab>("leaders");

  const periodStart =
    periodType === "daily"
      ? getToday()
      : periodType === "weekly"
        ? getWeekStart()
        : getMonthStartOffset(monthsBack);

  // Core 300/Day 1 Ditto are real calendar-month numbers, shown on the
  // Volume tab regardless of which period toggle is active - on Monthly
  // itself they track whatever month is being paged to (periodStart,
  // respecting monthsBack), but Daily/Weekly have no month picker of
  // their own, so they always show the current month's numbers instead
  // of whatever day/week happens to be selected.
  const volumeMonthStart = periodType === "monthly" ? periodStart : getMonthStart();

  const [teamTotals, setTeamTotals] = useState<TeamTotals[]>([]);
  const [individualLeaders, setIndividualLeaders] = useState<IndividualLeaderEntry[]>([]);
  const [streakLeaders, setStreakLeaders] = useState<StreakLeaderboardEntry[]>([]);
  const [core300, setCore300] = useState<Core300Entry[]>([]);
  const [activeCandidates, setActiveCandidates] = useState<ActiveCandidatesEntry[]>([]);
  const [qi1Rhythm, setQi1Rhythm] = useState<Qi1RhythmEntry[]>([]);
  const [ditto, setDitto] = useState<DittoEntry[]>([]);
  const [newMembers, setNewMembers] = useState<NewMember[]>([]);
  const [milestones, setMilestones] = useState<MilestoneEntry[]>([]);
  const [salesFeed, setSalesFeed] = useState<DailySaleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [myName, setMyName] = useState("You");
  const [likesMap, setLikesMap] = useState<Map<string, LikeInfo>>(new Map());

  const [photoByUserId, setPhotoByUserId] = useState<Map<string, string>>(new Map());
  const [levelByUserId, setLevelByUserId] = useState<Map<string, number>>(new Map());

  const qi1RhythmThreshold = periodType === "daily" ? 1 : periodType === "weekly" ? 2 : 8;

  // Independent of periodType/periodStart - a person's avatar/level don't
  // change per period, so this only needs to run once per page visit,
  // not on every period toggle.
  useEffect(() => {
    let cancelled = false;
    async function loadLevels() {
      const [{ data: photos }, { data: badgeRows }] = await Promise.all([
        supabase.rpc("get_all_public_photos"),
        supabase.rpc("get_all_earned_badge_keys"),
      ]);
      if (cancelled) return;

      const photoMap = new Map<string, string>();
      for (const row of (photos as { user_id: string; photo_url: string }[]) ?? []) {
        photoMap.set(row.user_id, row.photo_url);
      }

      const keysByUser = new Map<string, string[]>();
      for (const row of (badgeRows as { individual_id: string; badge_key: string }[]) ?? []) {
        const list = keysByUser.get(row.individual_id) ?? [];
        list.push(row.badge_key);
        keysByUser.set(row.individual_id, list);
      }
      const levelMap = new Map<string, number>();
      for (const [uid, keys] of keysByUser) {
        levelMap.set(uid, levelForPoints(pointsForBadgeKeys(keys)));
      }

      setPhotoByUserId(photoMap);
      setLevelByUserId(levelMap);
    }
    loadLevels();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [{ data: teams }, { data: individuals }, { data: rhythm }] = await Promise.all([
        supabase.rpc("get_team_pipeline_totals", {
          p_period_type: periodType,
          p_period_start: periodStart,
        }),
        supabase.rpc("get_individual_leaders", {
          p_period_type: periodType,
          p_period_start: periodStart,
        }),
        supabase.rpc("get_qi1_rhythm_leaderboard", {
          p_period_type: periodType,
          p_period_start: periodStart,
          p_min_qi1: qi1RhythmThreshold,
        }),
      ]);

      if (!cancelled) {
        setTeamTotals((teams as TeamTotals[]) ?? []);
        setIndividualLeaders((individuals as IndividualLeaderEntry[]) ?? []);
        setQi1Rhythm((rhythm as Qi1RhythmEntry[]) ?? []);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [periodType, periodStart, qi1RhythmThreshold]);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_streak_leaderboard").then(({ data }) => {
      if (!cancelled) setStreakLeaders((data as StreakLeaderboardEntry[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_active_candidates_leaderboard").then(({ data }) => {
      if (!cancelled) setActiveCandidates((data as ActiveCandidatesEntry[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_new_members").then(({ data }) => {
      if (!cancelled) setNewMembers((data as NewMember[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_recent_milestones").then(({ data }) => {
      if (!cancelled) setMilestones((data as MilestoneEntry[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Backs the Volume tab's sales feed card, which shows the period-
  // appropriate slice ("Today's"/"This Week's"/"This Month's Sales") -
  // refetches whenever the period toggle changes, unlike the other
  // Activity spotlights above which are always "today" regardless of
  // periodType.
  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_sales_feed", { p_period_start: periodStart }).then(({ data }) => {
      if (!cancelled) setSalesFeed((data as DailySaleEntry[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [periodStart]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("profiles")
      .select("first_name,last_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const n = [data.first_name, data.last_name].filter(Boolean).join(" ");
        if (n) setMyName(n);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: core }, { data: dittoData }] = await Promise.all([
        supabase.rpc("get_core300_leaderboard", { p_period_start: volumeMonthStart }),
        supabase.rpc("get_ditto_leaderboard", { p_period_start: volumeMonthStart }),
      ]);
      if (!cancelled) {
        setCore300((core as Core300Entry[]) ?? []);
        setDitto((dittoData as DittoEntry[]) ?? []);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [volumeMonthStart]);

  const individualsByCategory = useMemo(() => {
    const map = new Map<PipelineStageKey, IndividualLeaderEntry[]>();
    for (const entry of individualLeaders) {
      const list = map.get(entry.category) ?? [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return map;
  }, [individualLeaders]);

  // Volume now has content on every period (the sales feed card always
  // renders something for whichever period is selected, on top of Core
  // 300/Ditto for Monthly specifically), so all four tabs are always
  // visible - no more bouncing back to Leaders or hiding a tab depending
  // on periodType.
  const displayTab = activeTab;

  // The grid below sizes its columns off this list's length so the tabs
  // always fill the row evenly instead of needing horizontal scrolling to
  // reach an off-screen tab.
  const visibleTabs = CATEGORY_TABS;

  // Small counts shown on each tab button, so switching categories is an
  // informed choice ("Consistency has 6 things in it") rather than a blind
  // tap - the numbers below match exactly what the tab body actually
  // renders (each participating list's length, or 1 per category with at
  // least one team/individual winner).
  const tabCounts: Record<CategoryTab, number> = useMemo(
    () => ({
      activity: (periodType === "daily" ? newMembers.length : 0) + milestones.length,
      leaders:
        CATEGORIES.filter((c) => leadingTeams(teamTotals, c.key).length > 0).length +
        CATEGORIES.filter((c) => (individualsByCategory.get(c.key) ?? []).length > 0).length +
        qi1Rhythm.length,
      consistency: streakLeaders.length + activeCandidates.length,
      // Core 300/Ditto always count (shown on every period); the sales
      // feed only counts toward Volume on Daily/Weekly - Monthly already
      // has Core 300/Ditto as its volume picture, so the sales feed card
      // itself is Daily/Weekly-only (see the JSX below).
      volume: core300.length + ditto.length + (periodType === "monthly" ? 0 : salesFeed.length),
    }),
    [
      periodType,
      newMembers,
      milestones,
      salesFeed,
      teamTotals,
      individualsByCategory,
      qi1Rhythm,
      streakLeaders,
      activeCandidates,
      core300,
      ditto,
    ]
  );

  const allEntryKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const c of CATEGORIES) {
      if (leadingTeams(teamTotals, c.key).length > 0) {
        keys.add(teamEntryKey(periodType, periodStart, c.key));
      }
      if ((individualsByCategory.get(c.key) ?? []).length > 0) {
        keys.add(individualEntryKey(periodType, periodStart, c.key));
      }
    }
    for (const e of qi1Rhythm) keys.add(qi1RhythmEntryKey(periodType, periodStart, e.user_id));
    for (const s of streakLeaders) keys.add(streakEntryKey(s.user_id));
    for (const e of activeCandidates) keys.add(activeCandidatesEntryKey(e.user_id));
    for (const e of core300) keys.add(core300EntryKey(volumeMonthStart, e.user_id));
    for (const e of ditto) keys.add(dittoEntryKey(volumeMonthStart, e.user_id));
    for (const m of milestones) keys.add(milestoneEntryKey(m.user_id, m.milestone_days));
    for (const e of salesFeed) keys.add(dailySaleEntryKey(e.sale_id));
    return Array.from(keys);
  }, [
    teamTotals,
    individualsByCategory,
    qi1Rhythm,
    streakLeaders,
    activeCandidates,
    core300,
    ditto,
    milestones,
    salesFeed,
    periodType,
    periodStart,
    volumeMonthStart,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const map = new Map<string, LikeInfo>();
      if (allEntryKeys.length > 0) {
        const { data } = await supabase.rpc("get_likers", { p_entry_keys: allEntryKeys });
        for (const l of (data as Liker[]) ?? []) {
          const existing = map.get(l.entry_key) ?? { count: 0, likedByMe: false, names: [] };
          existing.count += 1;
          if (l.user_id === user.id) existing.likedByMe = true;
          existing.names.push([l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed");
          map.set(l.entry_key, existing);
        }
      }
      if (!cancelled) setLikesMap(map);
    }

    load();

    // Live counts via Supabase Realtime - re-runs the same load() on any
    // insert/delete on leaderboard_likes rather than trying to patch the
    // map from the event payload directly (a delete payload only
    // includes the row's primary key by default, not entry_key, without
    // also setting REPLICA IDENTITY FULL on the table). A full refetch
    // is simple and correct; this table is low-volume enough that the
    // extra round trip doesn't matter. Also fires on our own optimistic
    // toggle's own insert/delete - a harmless redundant refetch, not a
    // bug.
    const channel = supabase
      .channel("leaderboard_likes_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaderboard_likes" },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [allEntryKeys, user.id]);

  async function toggleLike(entryKey: string, targetUserId?: string) {
    const current = likesMap.get(entryKey) ?? NO_LIKES;
    const optimistic = new Map(likesMap);
    if (current.likedByMe) {
      optimistic.set(entryKey, {
        count: Math.max(0, current.count - 1),
        likedByMe: false,
        names: current.names.filter((n) => n !== myName),
      });
      setLikesMap(optimistic);
      await supabase
        .from("leaderboard_likes")
        .delete()
        .eq("entry_key", entryKey)
        .eq("liker_id", user.id);
    } else {
      optimistic.set(entryKey, {
        count: current.count + 1,
        likedByMe: true,
        names: [...current.names, myName],
      });
      setLikesMap(optimistic);
      await supabase.from("leaderboard_likes").insert({ entry_key: entryKey, liker_id: user.id });
      // Only the actual liked person gets pinged, never on unliking (that'd
      // just be confusing), never for liking your own row, and never for a
      // team-level or tied ranking with no single target (targetUserId
      // absent in both cases).
      if (targetUserId && targetUserId !== user.id) {
        fireNotifyEvent({ kind: "leaderboard_liked", targetUserId });
      }
    }
  }

  return (
    <LevelDataContext.Provider value={{ photoByUserId, levelByUserId }}>
      <PageHeader
        title="Leaderboard"
        subtitle={
          periodType === "daily"
            ? `Today, ${formatDateLabel(periodStart)}`
            : periodType === "weekly"
              ? `Week of ${formatDateLabel(periodStart)}`
              : formatMonthLabel(periodStart)
        }
      />
      <main className="page-main">
        <FirstVisitTip id="leaderboard">
          💡 Rankings reset for each period — Daily, Weekly, Monthly — and cover the whole team,
          not just your downline. Use the ← → arrows to look back at a previous period.
        </FirstVisitTip>

        <div className="card flex p-1">
          <button
            className={periodType === "daily" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setPeriodType("daily")}
          >
            Daily
          </button>
          <button
            className={periodType === "weekly" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setPeriodType("weekly")}
          >
            Weekly
          </button>
          <button
            className={periodType === "monthly" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setPeriodType("monthly")}
          >
            Monthly
          </button>
        </div>

        {periodType === "monthly" && (
          <div className="card flex items-center justify-between">
            <button
              className="btn-icon"
              onClick={() => setMonthsBack((m) => Math.min(11, m + 1))}
              disabled={monthsBack >= 11}
              aria-label="Previous month"
            >
              ←
            </button>
            <span className="text-sm font-medium text-white">{formatMonthLabel(periodStart)}</span>
            <button
              className="btn-icon"
              onClick={() => setMonthsBack((m) => Math.max(0, m - 1))}
              disabled={monthsBack <= 0}
              aria-label="Next month"
            >
              →
            </button>
          </div>
        )}

        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
        >
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold leading-tight transition ${
                displayTab === t.key
                  ? "bg-amber text-navy"
                  : "bg-white/5 text-slate-300 active:bg-white/10"
              }`}
            >
              <span className="text-base leading-none">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {displayTab === "activity" && periodType === "daily" && newMembers.length > 0 && (
          <Card title="🎉 New to the Team">
            {newMembers.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between text-sm">
                <span className="text-slate-200">
                  <Link
                    href={`/profile/${m.user_id}`}
                    className="text-amber-light underline decoration-dotted underline-offset-2"
                  >
                    {[m.first_name, m.last_name].filter(Boolean).join(" ") || "Unnamed"}
                  </Link>{" "}
                  <span className="text-xs text-slate-500">({m.team})</span>
                </span>
                <span className="pill">{formatDateLabel(m.created_at.slice(0, 10))}</span>
              </div>
            ))}
          </Card>
        )}

        {displayTab === "activity" && milestones.length > 0 && (
          <Card title="🏅 Milestone Alerts">
            {milestones.map((m) => {
              const label =
                STREAK_MILESTONES.find((s) => s.days === m.milestone_days)?.label ??
                `${m.milestone_days} Days`;
              const key = milestoneEntryKey(m.user_id, m.milestone_days);
              return (
                <div
                  key={key}
                  className="flex items-start justify-between gap-2 text-sm"
                >
                  <span className="text-slate-200">
                    <PersonLink entry={m} /> just hit{" "}
                    <span className="text-amber-light">{label}</span>{" "}
                    <span className="text-xs text-slate-500">({m.team})</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="pill pill-amber">🔥 {m.current_streak}d</span>
                    <LikeButton
                      entryKey={key}
                      targetUserId={m.user_id}
                      likes={likesMap.get(key) ?? NO_LIKES}
                      onToggle={toggleLike}
                    />
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        {displayTab === "activity" && tabCounts.activity === 0 && !loading && (
          <div className="empty-state">Nothing to report yet for this period.</div>
        )}

        {loading ? (
          <SkeletonList cards={4} />
        ) : (
          <>
            {displayTab === "leaders" && (
              <>
            <Card title="Team Leaders">
              {CATEGORIES.every((c) => leadingTeams(teamTotals, c.key).length === 0) ? (
                <p className="text-sm text-slate-400">Nothing logged for this period yet.</p>
              ) : (
                CATEGORIES.map((c) => {
                  const winners = leadingTeams(teamTotals, c.key);
                  if (winners.length === 0) return null;
                  const key = teamEntryKey(periodType, periodStart, c.key);
                  return (
                    <div key={c.key} className="flex items-start justify-between gap-2 text-sm">
                      <span className="text-slate-200">
                        {c.label}:{" "}
                        <span className="text-amber-light">
                          {winners.map((t) => t.team).join(", ")}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="pill pill-amber">{winners[0][c.key]}</span>
                        <LikeButton
                          entryKey={key}
                          likes={likesMap.get(key) ?? NO_LIKES}
                          onToggle={toggleLike}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </Card>

            <Card title="Individual Leaders">
              {individualLeaders.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing logged for this period yet.</p>
              ) : (
                CATEGORIES.map((c) => {
                  const winners = individualsByCategory.get(c.key) ?? [];
                  if (winners.length === 0) return null;
                  const key = individualEntryKey(periodType, periodStart, c.key);
                  // A single winner stays on one line with the label; a tie
                  // gets its own stacked row per winner underneath instead
                  // of cramming every tied name (and its avatar) into one
                  // wrapping paragraph - that's what made an avatar land
                  // mid-sentence wherever the line happened to break.
                  return (
                    <div key={c.key} className="space-y-1 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-200">
                          {c.label}
                          {winners.length === 1 && (
                            <>
                              : <CoupleLink entry={winners[0]} showAvatar />{" "}
                              <span className="text-xs text-slate-500">({winners[0].team})</span>
                            </>
                          )}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="pill pill-amber">{winners[0].value}</span>
                          <LikeButton
                            entryKey={key}
                            targetUserId={winners.length === 1 ? winners[0].user_id : undefined}
                            likes={likesMap.get(key) ?? NO_LIKES}
                            onToggle={toggleLike}
                          />
                        </div>
                      </div>
                      {winners.length > 1 && (
                        <div className="space-y-1 pl-2">
                          {winners.map((w) => (
                            <div key={w.user_id} className="text-xs text-amber-light">
                              <CoupleLink entry={w} showAvatar />{" "}
                              <span className="text-slate-500">({w.team})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </Card>

            <Card
              title={
                <>
                  🔁 {qi1RhythmThreshold}+ QI1s{" "}
                  {periodType === "daily" ? "Today" : periodType === "weekly" ? "This Week" : "This Month"}
                </>
              }
            >
              {qi1Rhythm.length === 0 ? (
                <p className="text-sm text-slate-400">No one&apos;s hit that rhythm yet.</p>
              ) : (
                qi1Rhythm.map((entry, i) => {
                  const key = qi1RhythmEntryKey(periodType, periodStart, entry.user_id);
                  return (
                    <div
                      key={`${entry.user_id}-${i}`}
                      className="flex items-start justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-200">
                        {i + 1}. <CoupleLink entry={entry} />{" "}
                        <span className="text-xs text-slate-500">({entry.team})</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="pill pill-amber">{entry.qi1} QI1</span>
                        <LikeButton
                          entryKey={key}
                          targetUserId={entry.user_id}
                          likes={likesMap.get(key) ?? NO_LIKES}
                          onToggle={toggleLike}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </Card>
              </>
            )}

            {displayTab === "consistency" && (
              <>
            <Card title="🔥 Core Run Streaks">
              {streakLeaders.length === 0 ? (
                <p className="text-sm text-slate-400">No one&apos;s on a streak right now.</p>
              ) : (
                streakLeaders.map((s, i) => {
                  const key = streakEntryKey(s.user_id);
                  return (
                    <div
                      key={`${s.user_id}-${i}`}
                      className="flex items-start justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-200">
                        <PersonLink entry={s} /> <span className="text-xs text-slate-500">({s.team})</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="pill pill-amber">{s.streak_days}d</span>
                        <LikeButton
                          entryKey={key}
                          targetUserId={s.user_id}
                          likes={likesMap.get(key) ?? NO_LIKES}
                          onToggle={toggleLike}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </Card>

            <Card title="🎯 5+ Active Candidates">
              {activeCandidates.length === 0 ? (
                <p className="text-sm text-slate-400">No one&apos;s running 5+ active candidates right now.</p>
              ) : (
                activeCandidates.map((entry, i) => {
                  const key = activeCandidatesEntryKey(entry.user_id);
                  return (
                    <div
                      key={`${entry.user_id}-${i}`}
                      className="flex items-start justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-200">
                        <CoupleLink entry={entry} /> <span className="text-xs text-slate-500">({entry.team})</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="pill pill-amber">{entry.active_count}</span>
                        <LikeButton
                          entryKey={key}
                          targetUserId={entry.user_id}
                          likes={likesMap.get(key) ?? NO_LIKES}
                          onToggle={toggleLike}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </Card>
              </>
            )}

            {displayTab === "volume" && (
              <>
                <Card title="Core 300">
                  {core300.length === 0 ? (
                    <p className="text-sm text-slate-400">No one&apos;s hit Core 300 yet this month.</p>
                  ) : (
                    core300.map((entry, i) => {
                      const key = core300EntryKey(volumeMonthStart, entry.user_id);
                      return (
                        <div
                          key={`${entry.user_id}-${i}`}
                          className="flex items-start justify-between gap-2 text-sm"
                        >
                          <span className="text-slate-200">
                            {i + 1}. <CoupleLink entry={entry} />{" "}
                            <span className="text-xs text-slate-500">({entry.team})</span>
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="pill pill-amber">{entry.pv} PV</span>
                            <LikeButton
                              entryKey={key}
                              targetUserId={entry.user_id}
                              likes={likesMap.get(key) ?? NO_LIKES}
                              onToggle={toggleLike}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </Card>

                <Card title="📦 Day 1 Ditto 100+">
                  {ditto.length === 0 ? (
                    <p className="text-sm text-slate-400">No one&apos;s over 100 PV on a day 1 Ditto yet.</p>
                  ) : (
                    ditto.map((entry, i) => {
                      const key = dittoEntryKey(volumeMonthStart, entry.user_id);
                      return (
                        <div
                          key={`${entry.user_id}-${i}`}
                          className="flex items-start justify-between gap-2 text-sm"
                        >
                          <span className="text-slate-200">
                            {i + 1}. <CoupleLink entry={entry} />{" "}
                            <span className="text-xs text-slate-500">({entry.team})</span>
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="pill pill-amber">{entry.day1_ditto_pv} PV</span>
                            <LikeButton
                              entryKey={key}
                              targetUserId={entry.user_id}
                              likes={likesMap.get(key) ?? NO_LIKES}
                              onToggle={toggleLike}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </Card>

                {periodType !== "monthly" && (
                  <Card title={periodType === "daily" ? "🛍️ Today's Sales" : "🛍️ This Week's Sales"}>
                    {salesFeed.length === 0 ? (
                      <p className="text-sm text-slate-400">
                        No customer sales logged {periodType === "daily" ? "yet today" : "yet this week"}.
                      </p>
                    ) : (
                      salesFeed.map((entry) => {
                        const key = dailySaleEntryKey(entry.sale_id);
                        const time = new Date(entry.created_at).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        });
                        return (
                          <div
                            key={entry.sale_id}
                            className="space-y-1 border-b border-white/5 pb-2 text-sm last:border-0 last:pb-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-slate-200">
                                <CoupleLink entry={entry} />{" "}
                                <span className="text-xs text-slate-500">
                                  ({entry.team}) — {time}
                                </span>
                              </span>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="pill pill-amber">{entry.amount} PV</span>
                                <LikeButton
                                  entryKey={key}
                                  targetUserId={entry.user_id}
                                  likes={likesMap.get(key) ?? NO_LIKES}
                                  onToggle={toggleLike}
                                />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {entry.categories.map((cat) => (
                                <span key={cat} className="pill">
                                  {cat}
                                </span>
                              ))}
                            </div>
                            {entry.notes && <p className="text-xs text-slate-400">{entry.notes}</p>}
                          </div>
                        );
                      })
                    )}
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </main>
    </LevelDataContext.Provider>
  );
}
