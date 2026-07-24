"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import { getMonthStart, getWeekStart, formatDateLabel } from "@/lib/dates";
import type { TeamTotals, Qi1LeaderboardEntry } from "@/lib/types";

type PeriodType = "weekly" | "monthly";

const MEDALS = ["🥇", "🥈", "🥉"];

function displayName(entry: Qi1LeaderboardEntry): string {
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(" ");
  return name || "Unnamed";
}

export default function LeaderboardPage() {
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [teamTotals, setTeamTotals] = useState<TeamTotals[]>([]);
  const [topIndividuals, setTopIndividuals] = useState<Qi1LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const periodStart = periodType === "weekly" ? getWeekStart() : getMonthStart();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [{ data: teams }, { data: individuals }] = await Promise.all([
        supabase.rpc("get_team_pipeline_totals", {
          p_period_type: periodType,
          p_period_start: periodStart,
        }),
        supabase.rpc("get_qi1_leaderboard", {
          p_period_type: periodType,
          p_period_start: periodStart,
          p_limit: 3,
        }),
      ]);

      if (!cancelled) {
        const sortedTeams = ((teams as TeamTotals[]) ?? []).slice().sort((a, b) => b.qi1 - a.qi1);
        setTeamTotals(sortedTeams);
        setTopIndividuals((individuals as Qi1LeaderboardEntry[]) ?? []);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [periodType, periodStart]);

  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle={`${periodType === "weekly" ? "Week of" : "Month of"} ${formatDateLabel(periodStart)} · QI1s`}
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

        {loading ? (
          <div className="empty-state">Loading leaderboard…</div>
        ) : (
          <>
            <div className="card space-y-1.5">
              <p className="section-title">Top Teams</p>
              {teamTotals.length === 0 || teamTotals.every((t) => t.qi1 === 0) ? (
                <p className="text-sm text-slate-400">No QI1s logged for this period yet.</p>
              ) : (
                teamTotals
                  .filter((t) => t.qi1 > 0)
                  .map((t, i) => (
                    <div key={t.team} className="flex items-center justify-between text-sm">
                      <span className="text-slate-200">
                        {i < 3 ? `${MEDALS[i]} ` : `${i + 1}. `}
                        {t.team}{" "}
                        <span className="text-xs text-slate-500">({t.member_count} members)</span>
                      </span>
                      <span className="pill pill-amber">{t.qi1} QI1</span>
                    </div>
                  ))
              )}
            </div>

            <div className="card space-y-1.5">
              <p className="section-title">Top 3 Individuals</p>
              {topIndividuals.length === 0 ? (
                <p className="text-sm text-slate-400">No QI1s logged for this period yet.</p>
              ) : (
                topIndividuals.map((entry, i) => (
                  <div
                    key={`${entry.first_name}-${entry.last_name}-${i}`}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-slate-200">
                      {MEDALS[i] ?? `${i + 1}.`} {displayName(entry)}{" "}
                      <span className="text-xs text-slate-500">({entry.team})</span>
                    </span>
                    <span className="pill pill-amber">{entry.qi1} QI1</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
