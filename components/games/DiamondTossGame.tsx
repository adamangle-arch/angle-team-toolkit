"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthGate";
import { useGameScore } from "@/lib/useGameScore";
import GameLockGate from "@/components/games/GameLockGate";
import GameLeaderboard from "@/components/games/GameLeaderboard";

const GAME_KEY = "diamond_toss";
const THROWS = 5;
const CYCLE_MS = 1400;

type Zone = { start: number; end: number }; // percent 0-100

function randomZone(): Zone {
  const width = 12 + Math.random() * 8; // 12-20% wide
  const start = Math.random() * (100 - width);
  return { start, end: start + width };
}

// Points per throw: 100 for a bullseye at the zone's center, tapering to
// 0 at its edges and beyond - same "higher is better" convention as
// every other game on the shared leaderboard.
function pointsForToss(markerPct: number, zone: Zone): number {
  const center = (zone.start + zone.end) / 2;
  const halfWidth = (zone.end - zone.start) / 2;
  const distance = Math.abs(markerPct - center);
  if (distance > halfWidth * 2.5) return 0;
  return Math.max(0, Math.round(100 * (1 - distance / (halfWidth * 2.5))));
}

export default function DiamondTossGame() {
  const { user } = useAuth();
  const { bestScore, submitScore } = useGameScore(user.id, GAME_KEY);

  const [throwNum, setThrowNum] = useState(0);
  const [zone, setZone] = useState<Zone>(() => randomZone());
  const [markerPct, setMarkerPct] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const startAt = useRef(0);
  const animFrame = useRef(0);
  const runningRef = useRef(false);

  function tick(now: number) {
    if (!runningRef.current) return;
    const elapsed = now - startAt.current;
    const phase = (elapsed % CYCLE_MS) / CYCLE_MS;
    const pct = 50 * (1 - Math.cos(phase * Math.PI * 2));
    setMarkerPct(pct);
    animFrame.current = requestAnimationFrame(tick);
  }

  function startThrow() {
    setRunning(true);
    runningRef.current = true;
    startAt.current = performance.now();
    animFrame.current = requestAnimationFrame(tick);
  }

  function startGame() {
    setThrowNum(0);
    setTotalPoints(0);
    setLastPoints(null);
    setFinished(false);
    setZone(randomZone());
    startThrow();
  }

  async function handleTap() {
    if (!running) return;
    runningRef.current = false;
    setRunning(false);
    cancelAnimationFrame(animFrame.current);
    const points = pointsForToss(markerPct, zone);
    setLastPoints(points);
    const newTotal = totalPoints + points;
    setTotalPoints(newTotal);

    const nextThrowNum = throwNum + 1;
    setThrowNum(nextThrowNum);

    if (nextThrowNum >= THROWS) {
      setFinished(true);
      await submitScore(newTotal);
      setRefreshKey((k) => k + 1);
    } else {
      setTimeout(() => {
        setZone(randomZone());
        startThrow();
      }, 900);
    }
  }

  useEffect(() => {
    return () => cancelAnimationFrame(animFrame.current);
  }, []);

  return (
    <GameLockGate gameLabel="Diamond Toss">
      <div className="card flex items-center justify-between">
        <span className="text-sm text-slate-400">
          Throw: <span className="font-bold text-white">{Math.min(throwNum + 1, THROWS)}/{THROWS}</span>
        </span>
        <span className="text-sm text-slate-400">
          Best: <span className="font-bold text-amber-light">{bestScore}</span>
        </span>
      </div>

      {throwNum === 0 && !running && !finished ? (
        <div className="card space-y-2 text-center">
          <p className="text-sm text-slate-400">
            {THROWS} throws. Tap when the diamond lines up with the gold zone — closer to the
            center scores more.
          </p>
          <button className="btn-primary w-full" onClick={startGame}>
            Start
          </button>
        </div>
      ) : finished ? (
        <div className="card space-y-2 text-center">
          <p className="text-lg font-bold text-white">🎉 {totalPoints} points</p>
          <p className="text-sm text-slate-300">Last throw: {lastPoints}pts</p>
          <button className="btn-primary w-full" onClick={startGame}>
            Play Again
          </button>
        </div>
      ) : (
        <div className="card space-y-3">
          <div className="relative h-8 overflow-hidden rounded-full border border-white/10 bg-white/5">
            <div
              className="absolute inset-y-0 rounded-full bg-amber/40"
              style={{ left: `${zone.start}%`, width: `${zone.end - zone.start}%` }}
            />
            <div
              className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white text-center text-sm leading-6"
              style={{ left: `${markerPct}%` }}
            >
              💎
            </div>
          </div>
          <button className="btn-primary w-full" onClick={handleTap}>
            Toss
          </button>
          {lastPoints !== null && (
            <p className="text-center text-sm text-slate-400">Last: {lastPoints}pts</p>
          )}
        </div>
      )}

      <GameLeaderboard gameKey={GAME_KEY} refreshKey={refreshKey} />
    </GameLockGate>
  );
}
