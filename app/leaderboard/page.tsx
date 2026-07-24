"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import {
  getWeekStart,
  getMonthStartOffset,
  formatDateLabel,
  formatMonthLabel,
} from "@/lib/dates";
import { PIPELINE_STAGES, type PipelineStageKey } from "@/lib/constants";
import type {
  TeamTotals,
  IndividualLeaderEntry,
  StreakLeaderboardEntry,
  Core300Entry,
  ActiveCandidatesEntry,
  Qi1RhythmEntry,
  DittoEntry,
} from "@/lib/types";

type PeriodType = "weekly" | "monthly";

const CATEGORIES = PIPELINE_STAGES.filter((s) => s.key !== "questions");

function personName(entry: { first_name: string | null; last_name: string | null }): string {
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(" ");
  return name || "Unnamed";
}

function PersonLink({
  entry,
}: {
  entry: { user_id: string; first_name: string | null; last_name: string | null };
}) {
  return (
    <Link href={`/profile/${entry.user_id}`} className="underline decoration-dotted underline-offset-2">
      {personName(entry)}
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

function leadingTeams(teams: TeamTotals[], key: PipelineStageKey): TeamTotals[] {
  const max = teams.reduce((best, t) => Math.max(best, t[key]), 0);
  if (max === 0) return [];
  return teams.filter((t) => t[key] === max);
}

export default function LeaderboardPage() {
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [monthsBack, setMonthsBack] = useState(0);

  const periodStart =
    periodType === "weekly" ? getWeekStart() : getMonthStartOffset(monthsBack);

  const [teamTotals, setTeamTotals] = useState<TeamTotals[]>([]);
  const [individualLeaders, setIndividualLeaders] = useState<IndividualLeaderEntry[]>([]);
  const [streakLeaders, setStreakLeaders] = useState<StreakLeaderboardEntry[]>([]);
  const [core300, setCore300] = useState<Core300Entry[]>([]);
  const [activeCandidates, setActiveCandidates] = useState<ActiveCandidatesEntry[]>([]);
  const [qi1Rhythm, setQi1Rhythm] = useState<Qi1RhythmEntry[]>([]);
  const [ditto, setDitto] = useState<DittoEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const qi1RhythmThreshold = periodType === "weekly" ? 2 : 8;

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

  const individualsByCategory = new Map<PipelineStageKey, IndividualLeaderEntry[]>();
  for (const entry of individualLeaders) {
    const list = individualsByCategory.get(entry.category) ?? [];
    list.push(entry);
    individualsByCategory.set(entry.category, list);
  }

  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle={
          periodType === "weekly"
            ? `Week of ${formatDateLabel(periodStart)}`
            : formatMonthLabel(periodStart)
        }
      />
      <main className="page-main">
        <div className="card flex p-1">
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

        {loading ? (
          <div className="empty-state">Loading leaderboard…</div>
        ) : (
          <>
            <div className="card space-y-1.5">
              <p className="section-title">Team Leaders</p>
              {CATEGORIES.every((c) => leadingTeams(teamTotals, c.key).length === 0) ? (
                <p className="text-sm text-slate-400">Nothing logged for this period yet.</p>
              ) : (
                CATEGORIES.map((c) => {
                  const winners = leadingTeams(teamTotals, c.key);
                  if (winners.length === 0) return null;
                  return (
                    <div key={c.key} className="flex items-center justify-between text-sm">
                      <span className="text-slate-200">
                        {c.label}:{" "}
                        <span className="text-amber-light">
                          {winners.map((t) => t.team).join(", ")}
                        </span>
                      </span>
                      <span className="pill pill-amber">{winners[0][c.key]}</span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="card space-y-1.5">
              <p className="section-title">Individual Leaders</p>
              {individualLeaders.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing logged for this period yet.</p>
              ) : (
                CATEGORIES.map((c) => {
                  const winners = individualsByCategory.get(c.key) ?? [];
                  if (winners.length === 0) return null;
                  return (
                    <div key={c.key} className="flex items-center justify-between text-sm">
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
                      <span className="pill pill-amber">{winners[0].value}</span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="card space-y-1.5">
              <p className="section-title">
                🔁 {qi1RhythmThreshold}+ QI1s {periodType === "weekly" ? "This Week" : "This Month"}
              </p>
              {qi1Rhythm.length === 0 ? (
                <p className="text-sm text-slate-400">No one&apos;s hit that rhythm yet.</p>
              ) : (
                qi1Rhythm.map((entry, i) => (
                  <div key={`${entry.user_id}-${i}`} className="flex items-center justify-between text-sm">
                    <span className="text-slate-200">
                      {i + 1}. <CoupleLink entry={entry} />{" "}
                      <span className="text-xs text-slate-500">({entry.team})</span>
                    </span>
                    <span className="pill pill-amber">{entry.qi1} QI1</span>
                  </div>
                ))
              )}
            </div>

            <div className="card space-y-1.5">
              <p className="section-title">🔥 Core Run Streaks</p>
              {streakLeaders.length === 0 ? (
                <p className="text-sm text-slate-400">No one&apos;s on a streak right now.</p>
              ) : (
                streakLeaders.map((s, i) => (
                  <div key={`${s.user_id}-${i}`} className="flex items-center justify-between text-sm">
                    <span className="text-slate-200">
                      <PersonLink entry={s} /> <span className="text-xs text-slate-500">({s.team})</span>
                    </span>
                    <span className="pill pill-amber">{s.streak_days}d</span>
                  </div>
                ))
              )}
            </div>

            <div className="card space-y-1.5">
              <p className="section-title">🎯 5+ Active Candidates</p>
              {activeCandidates.length === 0 ? (
                <p className="text-sm text-slate-400">No one&apos;s running 5+ active candidates right now.</p>
              ) : (
                activeCandidates.map((entry, i) => (
                  <div key={`${entry.user_id}-${i}`} className="flex items-center justify-between text-sm">
                    <span className="text-slate-200">
                      <CoupleLink entry={entry} /> <span className="text-xs text-slate-500">({entry.team})</span>
                    </span>
                    <span className="pill pill-amber">{entry.active_count}</span>
                  </div>
                ))
              )}
            </div>

            {periodType === "monthly" && (
              <>
                <div className="card space-y-1.5">
                  <p className="section-title">Core 300</p>
                  {core300.length === 0 ? (
                    <p className="text-sm text-slate-400">No one&apos;s hit Core 300 yet this month.</p>
                  ) : (
                    core300.map((entry, i) => (
                      <div key={`${entry.user_id}-${i}`} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">
                          {i + 1}. <CoupleLink entry={entry} />{" "}
                          <span className="text-xs text-slate-500">({entry.team})</span>
                        </span>
                        <span className="pill pill-amber">{entry.pv} PV</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="card space-y-1.5">
                  <p className="section-title">📦 Day 1 Ditto 100+</p>
                  {ditto.length === 0 ? (
                    <p className="text-sm text-slate-400">No one&apos;s over 100 PV on a day 1 Ditto yet.</p>
                  ) : (
                    ditto.map((entry, i) => (
                      <div key={`${entry.user_id}-${i}`} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">
                          {i + 1}. <CoupleLink entry={entry} />{" "}
                          <span className="text-xs text-slate-500">({entry.team})</span>
                        </span>
                        <span className="pill pill-amber">{entry.day1_ditto_pv} PV</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
