"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { pointsForBadgeKeys, levelForPoints } from "@/lib/levels";
import LevelAvatar from "@/components/LevelAvatar";
import {
  getWeekStart,
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
  GameLeaderEntry,
} from "@/lib/types";

type PeriodType = "daily" | "weekly" | "monthly";
type LikeInfo = { count: number; likedByMe: boolean; names: string[] };
const NO_LIKES: LikeInfo = { count: 0, likedByMe: false, names: [] };

const CATEGORIES = PIPELINE_STAGES.filter((s) => s.key !== "questions");

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

function PersonLink({
  entry,
}: {
  entry: { user_id: string; first_name: string | null; last_name: string | null };
}) {
  const { photoByUserId, levelByUserId } = useContext(LevelDataContext);
  return (
    <Link href={`/profile/${entry.user_id}`} className="inline-flex items-center gap-1">
      <LevelAvatar
        photoUrl={photoByUserId.get(entry.user_id) ?? null}
        level={levelByUserId.get(entry.user_id) ?? 1}
        size="sm"
        showLevelChip={false}
      />
      <span className="underline decoration-dotted underline-offset-2">{personName(entry)}</span>
    </Link>
  );
}

// For household-shareable data, a linked spouse shows up as two names,
// each linking to their own profile — the shared numbers are one entity,
// but the profiles stay individual.
function CoupleLink({
  entry,
}: {
  entry: {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    partner_user_id: string | null;
    partner_first_name: string | null;
    partner_last_name: string | null;
  };
}) {
  if (!entry.partner_user_id) {
    return <PersonLink entry={entry} />;
  }
  const partnerName =
    [entry.partner_first_name, entry.partner_last_name].filter(Boolean).join(" ") || "Unnamed";
  return (
    <>
      <PersonLink entry={entry} /> &{" "}
      <Link
        href={`/profile/${entry.partner_user_id}`}
        className="underline decoration-dotted underline-offset-2"
      >
        {partnerName}
      </Link>
    </>
  );
}

function LikeButton({
  entryKey,
  likes,
  onToggle,
}: {
  entryKey: string;
  likes: LikeInfo;
  onToggle: (entryKey: string) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <button
        onClick={() => onToggle(entryKey)}
        className={`flex items-center gap-1 text-xs transition active:scale-90 ${
          likes.likedByMe ? "text-amber-light" : "text-slate-500"
        }`}
        aria-label={likes.likedByMe ? "Unlike" : "Like"}
      >
        <span>{likes.likedByMe ? "❤️" : "🤍"}</span>
        {likes.count > 0 && <span>{likes.count}</span>}
      </button>
      {likes.names.length > 0 && (
        <p
          className="max-w-[120px] truncate text-right text-[10px] text-slate-500"
          title={likes.names.join(", ")}
        >
          {likes.names.join(", ")}
        </p>
      )}
    </div>
  );
}

// Collapsible card - this page has ten-plus sections in one scroll, so
// most default closed (just the title + a chevron) and only the couple
// most core ones default open, instead of every section always being
// fully expanded regardless of whether anyone's actually looking at it.
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card space-y-1.5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="section-title">{title}</span>
        <span className="shrink-0 text-xs text-slate-500">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
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
function gameEntryKey(userId: string) {
  return `game:${userId}`;
}
function dailySaleEntryKey(saleId: string) {
  return `daily_sale:${saleId}`;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [monthsBack, setMonthsBack] = useState(0);

  const periodStart =
    periodType === "daily"
      ? getToday()
      : periodType === "weekly"
        ? getWeekStart()
        : getMonthStartOffset(monthsBack);

  const [teamTotals, setTeamTotals] = useState<TeamTotals[]>([]);
  const [individualLeaders, setIndividualLeaders] = useState<IndividualLeaderEntry[]>([]);
  const [streakLeaders, setStreakLeaders] = useState<StreakLeaderboardEntry[]>([]);
  const [core300, setCore300] = useState<Core300Entry[]>([]);
  const [activeCandidates, setActiveCandidates] = useState<ActiveCandidatesEntry[]>([]);
  const [qi1Rhythm, setQi1Rhythm] = useState<Qi1RhythmEntry[]>([]);
  const [ditto, setDitto] = useState<DittoEntry[]>([]);
  const [newMembers, setNewMembers] = useState<NewMember[]>([]);
  const [milestones, setMilestones] = useState<MilestoneEntry[]>([]);
  const [gameLeaders, setGameLeaders] = useState<GameLeaderEntry[]>([]);
  const [dailySales, setDailySales] = useState<DailySaleEntry[]>([]);
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

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_game_leaderboard").then(({ data }) => {
      if (!cancelled) setGameLeaders((data as GameLeaderEntry[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_daily_sales_feed").then(({ data }) => {
      if (!cancelled) setDailySales((data as DailySaleEntry[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (periodType !== "monthly") return;
    let cancelled = false;

    async function load() {
      const [{ data: core }, { data: dittoData }] = await Promise.all([
        supabase.rpc("get_core300_leaderboard", { p_period_start: periodStart }),
        supabase.rpc("get_ditto_leaderboard", { p_period_start: periodStart }),
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
  }, [periodType, periodStart]);

  const individualsByCategory = useMemo(() => {
    const map = new Map<PipelineStageKey, IndividualLeaderEntry[]>();
    for (const entry of individualLeaders) {
      const list = map.get(entry.category) ?? [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return map;
  }, [individualLeaders]);

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
    for (const e of core300) keys.add(core300EntryKey(periodStart, e.user_id));
    for (const e of ditto) keys.add(dittoEntryKey(periodStart, e.user_id));
    for (const m of milestones) keys.add(milestoneEntryKey(m.user_id, m.milestone_days));
    for (const g of gameLeaders) keys.add(gameEntryKey(g.user_id));
    for (const e of dailySales) keys.add(dailySaleEntryKey(e.sale_id));
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
    gameLeaders,
    dailySales,
    periodType,
    periodStart,
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
    return () => {
      cancelled = true;
    };
  }, [allEntryKeys, user.id]);

  async function toggleLike(entryKey: string) {
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

        {periodType === "daily" && newMembers.length > 0 && (
          <Section title="🎉 New to the Team">
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
          </Section>
        )}

        {milestones.length > 0 && (
          <Section title="🏅 Milestone Alerts">
            {milestones.map((m) => {
              const label =
                STREAK_MILESTONES.find((s) => s.days === m.milestone_days)?.label ??
                `${m.milestone_days} Days`;
              const key = milestoneEntryKey(m.user_id, m.milestone_days);
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 text-sm"
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
                      likes={likesMap.get(key) ?? NO_LIKES}
                      onToggle={toggleLike}
                    />
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        {dailySales.length > 0 && (
          <Section title="🛍️ Today's Sales">
            {dailySales.map((entry) => {
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
                      <PersonLink entry={entry} />{" "}
                      <span className="text-xs text-slate-500">
                        ({entry.team}) — {time}
                      </span>
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="pill pill-amber">{entry.amount} PV</span>
                      <LikeButton
                        entryKey={key}
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
                </div>
              );
            })}
          </Section>
        )}

        {loading ? (
          <div className="empty-state">Loading leaderboard…</div>
        ) : (
          <>
            <Section title="Team Leaders" defaultOpen>
              {CATEGORIES.every((c) => leadingTeams(teamTotals, c.key).length === 0) ? (
                <p className="text-sm text-slate-400">Nothing logged for this period yet.</p>
              ) : (
                CATEGORIES.map((c) => {
                  const winners = leadingTeams(teamTotals, c.key);
                  if (winners.length === 0) return null;
                  const key = teamEntryKey(periodType, periodStart, c.key);
                  return (
                    <div key={c.key} className="flex items-center justify-between gap-2 text-sm">
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
            </Section>

            <Section title="Individual Leaders" defaultOpen>
              {individualLeaders.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing logged for this period yet.</p>
              ) : (
                CATEGORIES.map((c) => {
                  const winners = individualsByCategory.get(c.key) ?? [];
                  if (winners.length === 0) return null;
                  const key = individualEntryKey(periodType, periodStart, c.key);
                  return (
                    <div key={c.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-200">
                        {c.label}:{" "}
                        <span className="text-amber-light">
                          {winners.map((w, i) => (
                            <span key={w.user_id}>
                              <CoupleLink entry={w} /> ({w.team})
                              {i < winners.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="pill pill-amber">{winners[0].value}</span>
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
            </Section>

            <Section
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
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-200">
                        {i + 1}. <CoupleLink entry={entry} />{" "}
                        <span className="text-xs text-slate-500">({entry.team})</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="pill pill-amber">{entry.qi1} QI1</span>
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
            </Section>

            <Section title="🔥 Core Run Streaks">
              {streakLeaders.length === 0 ? (
                <p className="text-sm text-slate-400">No one&apos;s on a streak right now.</p>
              ) : (
                streakLeaders.map((s, i) => {
                  const key = streakEntryKey(s.user_id);
                  return (
                    <div
                      key={`${s.user_id}-${i}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-200">
                        <PersonLink entry={s} /> <span className="text-xs text-slate-500">({s.team})</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="pill pill-amber">{s.streak_days}d</span>
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
            </Section>

            <Section title="🎯 5+ Active Candidates">
              {activeCandidates.length === 0 ? (
                <p className="text-sm text-slate-400">No one&apos;s running 5+ active candidates right now.</p>
              ) : (
                activeCandidates.map((entry, i) => {
                  const key = activeCandidatesEntryKey(entry.user_id);
                  return (
                    <div
                      key={`${entry.user_id}-${i}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-200">
                        <CoupleLink entry={entry} /> <span className="text-xs text-slate-500">({entry.team})</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="pill pill-amber">{entry.active_count}</span>
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
            </Section>

            <Section title="💎 Diamond Run High Scores">
              {gameLeaders.length === 0 ? (
                <p className="text-sm text-slate-400">No one&apos;s played Diamond Run yet.</p>
              ) : (
                gameLeaders.map((entry, i) => {
                  const key = gameEntryKey(entry.user_id);
                  return (
                    <div
                      key={`${entry.user_id}-${i}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-200">
                        {i === 0 ? "👑 " : `${i + 1}. `}
                        <PersonLink entry={entry} />
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="pill pill-amber">{entry.best_score}</span>
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
            </Section>

            {periodType === "monthly" && (
              <>
                <Section title="Core 300">
                  {core300.length === 0 ? (
                    <p className="text-sm text-slate-400">No one&apos;s hit Core 300 yet this month.</p>
                  ) : (
                    core300.map((entry, i) => {
                      const key = core300EntryKey(periodStart, entry.user_id);
                      return (
                        <div
                          key={`${entry.user_id}-${i}`}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-slate-200">
                            {i + 1}. <CoupleLink entry={entry} />{" "}
                            <span className="text-xs text-slate-500">({entry.team})</span>
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="pill pill-amber">{entry.pv} PV</span>
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
                </Section>

                <Section title="📦 Day 1 Ditto 100+">
                  {ditto.length === 0 ? (
                    <p className="text-sm text-slate-400">No one&apos;s over 100 PV on a day 1 Ditto yet.</p>
                  ) : (
                    ditto.map((entry, i) => {
                      const key = dittoEntryKey(periodStart, entry.user_id);
                      return (
                        <div
                          key={`${entry.user_id}-${i}`}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-slate-200">
                            {i + 1}. <CoupleLink entry={entry} />{" "}
                            <span className="text-xs text-slate-500">({entry.team})</span>
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="pill pill-amber">{entry.day1_ditto_pv} PV</span>
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
                </Section>
              </>
            )}
          </>
        )}
      </main>
    </LevelDataContext.Provider>
  );
}
