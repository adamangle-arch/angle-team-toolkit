"use client";

import { useEffect, useRef, useState } from "react";
import { PartyPopper } from "lucide-react";
import { useAuth } from "@/components/AuthGate";
import { useGameScore } from "@/lib/useGameScore";
import GameLockGate from "@/components/games/GameLockGate";
import GameLeaderboard from "@/components/games/GameLeaderboard";

const GAME_KEY = "diamond_match";
const SYMBOLS = ["💎", "🔥", "🏆", "📅", "🎯", "📖", "🎧", "📈"];

type Card = { id: number; symbol: string; matched: boolean };

function shuffledDeck(): Card[] {
  const deck = [...SYMBOLS, ...SYMBOLS].map((symbol, i) => ({ id: i, symbol, matched: false }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Points reward fewer moves and less time, floored at 50 for anyone who
// finishes at all - keeps the shared game_scores table's "higher is
// better" ordering without needing a separate ascending-sort convention.
function pointsFromRun(moves: number, seconds: number): number {
  return Math.max(50, Math.round(1000 - moves * 20 - seconds * 5));
}

export default function DiamondMatchGame() {
  const { user } = useAuth();
  const { bestScore, submitScore } = useGameScore(user.id, GAME_KEY);

  const [cards, setCards] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [finalPoints, setFinalPoints] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const startTime = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startGame() {
    setCards(shuffledDeck());
    setFlipped([]);
    setMoves(0);
    setFinished(false);
    setFinalPoints(null);
    setElapsedSeconds(0);
    setPlaying(true);
    lockRef.current = false;
    startTime.current = performance.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((performance.now() - startTime.current) / 1000));
    }, 1000);
  }

  async function finishGame(finalMoves: number, seconds: number) {
    const points = pointsFromRun(finalMoves, seconds);
    setPlaying(false);
    setFinished(true);
    if (timerRef.current) clearInterval(timerRef.current);
    setFinalPoints(points);
    await submitScore(points);
    setRefreshKey((k) => k + 1);
  }

  function handleCardClick(id: number) {
    if (!playing || lockRef.current) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.matched || flipped.includes(id)) return;

    const nextFlipped = [...flipped, id];
    setFlipped(nextFlipped);

    if (nextFlipped.length === 2) {
      lockRef.current = true;
      const nextMoves = moves + 1;
      setMoves(nextMoves);
      const [firstId, secondId] = nextFlipped;
      const first = cards.find((c) => c.id === firstId);
      const second = cards.find((c) => c.id === secondId);

      if (first && second && first.symbol === second.symbol) {
        const updated = cards.map((c) =>
          c.id === firstId || c.id === secondId ? { ...c, matched: true } : c
        );
        setCards(updated);
        setFlipped([]);
        lockRef.current = false;
        if (updated.every((c) => c.matched)) {
          finishGame(nextMoves, elapsedSeconds);
        }
      } else {
        setTimeout(() => {
          setFlipped([]);
          lockRef.current = false;
        }, 700);
      }
    }
  }

  return (
    <GameLockGate gameLabel="Diamond Match">
      <div className="card flex items-center justify-between">
        <span className="text-sm text-slate-400">
          Moves: <span className="font-bold text-white">{moves}</span> · Time:{" "}
          <span className="font-bold text-white">{elapsedSeconds}s</span>
        </span>
        <span className="text-sm text-slate-400">
          Best: <span className="font-bold text-amber-light">{bestScore}</span>
        </span>
      </div>

      {!playing ? (
        <div className="card space-y-2 text-center">
          {finished && (
            <>
              <p className="flex items-center justify-center gap-1.5 text-lg font-bold text-white">
                <PartyPopper className="h-5 w-5" aria-hidden />
                Matched!
              </p>
              <p className="text-sm text-slate-300">
                {moves} moves in {elapsedSeconds}s — {finalPoints} points.
              </p>
            </>
          )}
          <p className="text-sm text-slate-400">
            Flip two cards at a time and find all 8 pairs — fewer moves and less time means more
            points.
          </p>
          <button className="btn-primary w-full" onClick={startGame}>
            {finished ? "Play Again" : "Start"}
          </button>
        </div>
      ) : (
        <div className="mx-auto grid max-w-xs grid-cols-4 gap-2">
          {cards.map((card) => {
            const isFaceUp = card.matched || flipped.includes(card.id);
            return (
              <button
                key={card.id}
                onClick={() => handleCardClick(card.id)}
                className={`flex aspect-square items-center justify-center rounded-lg border text-2xl transition-colors ${
                  card.matched
                    ? "border-amber/50 bg-amber/10"
                    : isFaceUp
                      ? "border-white/20 bg-white/10"
                      : "border-white/10 bg-navy-light"
                }`}
              >
                {isFaceUp ? card.symbol : "❔"}
              </button>
            );
          })}
        </div>
      )}

      <GameLeaderboard gameKey={GAME_KEY} refreshKey={refreshKey} />
    </GameLockGate>
  );
}
