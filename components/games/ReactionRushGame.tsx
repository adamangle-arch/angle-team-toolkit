"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthGate";
import { useGameScore } from "@/lib/useGameScore";
import GameLockGate from "@/components/games/GameLockGate";
import GameLeaderboard from "@/components/games/GameLeaderboard";

const GAME_KEY = "reaction_rush";
const ROUNDS = 5;
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 4000;

type Phase = "idle" | "waiting" | "ready" | "early" | "finished";

// Points are the inverse of average reaction time (faster = more points)
// so this still fits the shared game_scores table's "higher is better"
// leaderboard ordering, rather than needing its own ms-ascending sort.
function pointsFromMs(avgMs: number): number {
  return Math.max(0, Math.round(1000 - avgMs));
}

export default function ReactionRushGame() {
  const { user } = useAuth();
  const { bestScore, submitScore } = useGameScore(user.id, GAME_KEY);

  const [phase, setPhase] = useState<Phase>("idle");
  const [roundTimes, setRoundTimes] = useState<number[]>([]);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [finalPoints, setFinalPoints] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const readyAt = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function startRound() {
    setPhase("waiting");
    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
    timeoutRef.current = setTimeout(() => {
      readyAt.current = performance.now();
      setPhase("ready");
    }, delay);
  }

  function startGame() {
    setRoundTimes([]);
    setLastMs(null);
    setFinalPoints(null);
    startRound();
  }

  async function handleTap() {
    if (phase === "waiting") {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setPhase("early");
      return;
    }
    if (phase === "ready") {
      const ms = Math.round(performance.now() - readyAt.current);
      setLastMs(ms);
      const next = [...roundTimes, ms];
      setRoundTimes(next);
      if (next.length >= ROUNDS) {
        const avg = next.reduce((a, b) => a + b, 0) / next.length;
        const points = pointsFromMs(avg);
        setFinalPoints(points);
        setPhase("finished");
        await submitScore(points);
        setRefreshKey((k) => k + 1);
      } else {
        startRound();
      }
      return;
    }
    if (phase === "early") {
      startRound();
      return;
    }
  }

  const boxLabel =
    phase === "idle"
      ? "Tap Start"
      : phase === "waiting"
        ? "Wait for green…"
        : phase === "ready"
          ? "TAP NOW!"
          : phase === "early"
            ? "Too soon! Tap to retry"
            : "Round complete";

  const boxColor =
    phase === "ready" ? "bg-green-500" : phase === "early" ? "bg-red-500" : "bg-white/10";

  return (
    <GameLockGate gameLabel="Reaction Rush">
      <div className="card flex items-center justify-between">
        <span className="text-sm text-slate-400">
          Round: <span className="font-bold text-white">{Math.min(roundTimes.length + 1, ROUNDS)}/{ROUNDS}</span>
        </span>
        <span className="text-sm text-slate-400">
          Best: <span className="font-bold text-amber-light">{bestScore}</span>
        </span>
      </div>

      {phase === "idle" || phase === "finished" ? (
        <div className="card space-y-2 text-center">
          {phase === "finished" && (
            <>
              <p className="text-lg font-bold text-white">
                Average: {Math.round(roundTimes.reduce((a, b) => a + b, 0) / roundTimes.length)}ms
              </p>
              <p className="text-sm text-slate-300">Points: {finalPoints}</p>
            </>
          )}
          <p className="text-sm text-slate-400">
            {ROUNDS} rounds. Tap the instant the box turns green — tapping too early resets the
            round.
          </p>
          <button className="btn-primary w-full" onClick={startGame}>
            {phase === "finished" ? "Play Again" : "Start"}
          </button>
        </div>
      ) : (
        <div
          className={`flex h-48 cursor-pointer items-center justify-center rounded-2xl border border-white/10 text-center text-lg font-bold text-white transition-colors ${boxColor}`}
          onClick={handleTap}
        >
          {boxLabel}
          {lastMs !== null && phase === "waiting" && (
            <span className="ml-2 text-sm font-normal text-slate-300">(last: {lastMs}ms)</span>
          )}
        </div>
      )}

      <GameLeaderboard gameKey={GAME_KEY} refreshKey={refreshKey} />
    </GameLockGate>
  );
}
