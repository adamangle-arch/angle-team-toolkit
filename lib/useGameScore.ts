"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Shared best-score tracking for every mini-game that uses the generic
// game_scores table (everything after Diamond Run/Diamond Chase, which
// keep their own dedicated tables). Mirrors the load-best/submit-if-
// better/times-improved pattern those two already use, just against the
// shared table keyed by (user_id, game_key) instead of a per-game one.
export function useGameScore(userId: string, gameKey: string) {
  const [bestScore, setBestScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const bestScoreRef = useRef(0);
  const timesImprovedRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("game_scores")
        .select("best_score, times_improved")
        .eq("user_id", userId)
        .eq("game_key", gameKey)
        .maybeSingle();
      if (cancelled) return;
      bestScoreRef.current = data?.best_score ?? 0;
      timesImprovedRef.current = data?.times_improved ?? 0;
      setBestScore(bestScoreRef.current);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, gameKey]);

  // The very first score set (previous best was 0, meaning no real game
  // had been played yet) isn't really "beating" anything, so it doesn't
  // count toward times_improved - only a strictly higher score than a
  // real previous best does. Same rule Diamond Run/Diamond Chase use.
  async function submitScore(score: number) {
    if (score <= bestScoreRef.current) return;
    if (bestScoreRef.current > 0) timesImprovedRef.current += 1;
    bestScoreRef.current = score;
    setBestScore(score);
    await supabase.from("game_scores").upsert(
      {
        user_id: userId,
        game_key: gameKey,
        best_score: score,
        times_improved: timesImprovedRef.current,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,game_key" }
    );
  }

  return { bestScore, loading, submitScore };
}
