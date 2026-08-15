"use client";

import { useEffect, useRef, useState } from "react";
import { PartyPopper } from "lucide-react";
import { useAuth } from "@/components/AuthGate";
import { useGameScore } from "@/lib/useGameScore";
import { GAME_TERMS } from "@/lib/games-terms";
import GameLockGate from "@/components/games/GameLockGate";
import GameLeaderboard from "@/components/games/GameLeaderboard";

const GAME_KEY = "word_scramble";
const ROUNDS = 8;

function scramble(word: string): string {
  const letters = word.split("");
  let attempt = letters.join("");
  // Re-shuffle until it actually differs from the original - a shuffle
  // that happens to land back on the real word would just look broken.
  while (attempt === word) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    attempt = letters.join("");
  }
  return attempt;
}

function pickWords(count: number): string[] {
  const pool = [...GAME_TERMS];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

function pointsFromRun(seconds: number, mistakes: number): number {
  return Math.max(0, Math.round(1000 - seconds * 8 - mistakes * 15));
}

export default function WordScrambleGame() {
  const { user } = useAuth();
  const { bestScore, submitScore } = useGameScore(user.id, GAME_KEY);

  const [words, setWords] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const [tiles, setTiles] = useState<{ letter: string; used: boolean }[]>([]);
  const [guess, setGuess] = useState<number[]>([]); // indices into tiles
  const [mistakes, setMistakes] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [finalPoints, setFinalPoints] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const startTime = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function setupRound(word: string) {
    const scrambled = scramble(word);
    setTiles(scrambled.split("").map((letter) => ({ letter, used: false })));
    setGuess([]);
  }

  function startGame() {
    const w = pickWords(ROUNDS);
    setWords(w);
    setRound(0);
    setMistakes(0);
    setFinished(false);
    setFinalPoints(null);
    setElapsedSeconds(0);
    setPlaying(true);
    setupRound(w[0]);
    startTime.current = performance.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((performance.now() - startTime.current) / 1000));
    }, 1000);
  }

  async function finishGame(finalMistakes: number, seconds: number) {
    setPlaying(false);
    setFinished(true);
    if (timerRef.current) clearInterval(timerRef.current);
    const points = pointsFromRun(seconds, finalMistakes);
    setFinalPoints(points);
    await submitScore(points);
    setRefreshKey((k) => k + 1);
  }

  function tapTile(index: number) {
    if (!playing || tiles[index].used) return;
    const nextTiles = tiles.map((t, i) => (i === index ? { ...t, used: true } : t));
    const nextGuess = [...guess, index];
    setTiles(nextTiles);
    setGuess(nextGuess);

    const currentWord = words[round];
    if (nextGuess.length === currentWord.length) {
      const attempt = nextGuess.map((i) => tiles[i].letter).join("");
      const nextRound = round + 1;
      if (attempt === currentWord) {
        if (nextRound >= words.length) {
          finishGame(mistakes, elapsedSeconds);
        } else {
          setRound(nextRound);
          setupRound(words[nextRound]);
        }
      } else {
        setMistakes((m) => m + 1);
        // Wrong order - reset this round's tiles so they can try again.
        setTimeout(() => setupRound(currentWord), 500);
      }
    }
  }

  function clearGuess() {
    setTiles((prev) => prev.map((t) => ({ ...t, used: false })));
    setGuess([]);
  }

  return (
    <GameLockGate gameLabel="Word Scramble">
      <div className="card flex items-center justify-between">
        <span className="text-sm text-slate-400">
          Word: <span className="font-bold text-white">{Math.min(round + 1, ROUNDS)}/{ROUNDS}</span> ·
          Time: <span className="font-bold text-white">{elapsedSeconds}s</span>
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
                Unscrambled!
              </p>
              <p className="text-sm text-slate-300">
                {elapsedSeconds}s, {mistakes} mistake{mistakes === 1 ? "" : "s"} — {finalPoints} points.
              </p>
            </>
          )}
          <p className="text-sm text-slate-400">
            Tap letters in order to unscramble {ROUNDS} business terms — faster and fewer mistakes
            means more points.
          </p>
          <button className="btn-primary w-full" onClick={startGame}>
            {finished ? "Play Again" : "Start"}
          </button>
        </div>
      ) : (
        <div className="card space-y-4 text-center">
          <div className="flex min-h-[2.5rem] flex-wrap justify-center gap-1.5">
            {guess.map((i) => (
              <span
                key={i}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber/40 bg-amber/10 text-lg font-bold text-white"
              >
                {tiles[i].letter}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {tiles.map((t, i) => (
              <button
                key={i}
                disabled={t.used}
                onClick={() => tapTile(i)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border text-lg font-bold transition-colors ${
                  t.used
                    ? "border-white/5 bg-white/5 text-transparent"
                    : "border-white/20 bg-white/10 text-white"
                }`}
              >
                {t.letter}
              </button>
            ))}
          </div>
          <button className="text-xs text-slate-400 underline" onClick={clearGuess}>
            Clear
          </button>
        </div>
      )}

      <GameLeaderboard gameKey={GAME_KEY} refreshKey={refreshKey} />
    </GameLockGate>
  );
}
