"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { GameLeaderEntry } from "@/lib/types";

// Shared leaderboard card for every game on the generic game_scores table
// (get_misc_game_leaderboard) - Diamond Run/Diamond Chase keep their own
// inline version since they read from their own dedicated tables/RPCs.
export default function GameLeaderboard({ gameKey, refreshKey }: { gameKey: string; refreshKey: number }) {
  const [leaders, setLeaders] = useState<GameLeaderEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.rpc("get_misc_game_leaderboard", { p_game_key: gameKey });
      if (!cancelled) setLeaders((data as GameLeaderEntry[]) ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [gameKey, refreshKey]);

  return (
    <div className="card space-y-1.5">
      <p className="section-title">💎 High Scores</p>
      {leaders.length === 0 ? (
        <p className="text-sm text-slate-400">No scores yet — be the first!</p>
      ) : (
        leaders.map((l, i) => (
          <div key={l.user_id} className="flex items-center justify-between text-sm">
            <span className="text-slate-200">
              {i + 1}. {[l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed"}
            </span>
            <span className="pill pill-amber">{l.best_score}</span>
          </div>
        ))
      )}
    </div>
  );
}
