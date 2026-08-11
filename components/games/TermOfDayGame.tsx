"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthGate";
import { getToday } from "@/lib/dates";
import { useGameScore } from "@/lib/useGameScore";
import { GAME_TERMS } from "@/lib/games-terms";
import GameLockGate from "@/components/games/GameLockGate";
import GameLeaderboard from "@/components/games/GameLeaderboard";

const GAME_KEY = "term_of_day";
const MAX_GUESSES = 6;

// Same deterministic per-day pick TriviaGame uses, so everyone gets the
// same term on a given calendar day without any server-side state.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function todaysTerm(day: string): string {
  const index = hashString(day) % GAME_TERMS.length;
  return GAME_TERMS[index];
}

type LetterState = "correct" | "present" | "absent";

function evaluateGuess(guess: string, answer: string): LetterState[] {
  const result: LetterState[] = new Array(guess.length).fill("absent");
  const answerLetters = answer.split("");
  const used = new Array(answer.length).fill(false);

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answerLetters[i]) {
      result[i] = "correct";
      used[i] = true;
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === "correct") continue;
    const idx = answerLetters.findIndex((l, j) => l === guess[i] && !used[j]);
    if (idx !== -1) {
      result[i] = "present";
      used[idx] = true;
    }
  }
  return result;
}

function pointsFromGuesses(guessCount: number, won: boolean): number {
  if (!won) return 0;
  return Math.max(100, (MAX_GUESSES - guessCount + 1) * 150);
}

export default function TermOfDayGame() {
  const { user } = useAuth();
  const { bestScore, submitScore } = useGameScore(user.id, GAME_KEY);
  const answer = useMemo(() => todaysTerm(getToday()), []);

  const [current, setCurrent] = useState("");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [refreshKey, setRefreshKey] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  function tapLetter(letter: string) {
    if (status !== "playing" || current.length >= answer.length) return;
    setCurrent((c) => c + letter);
  }

  function backspace() {
    setCurrent((c) => c.slice(0, -1));
  }

  async function submitGuess() {
    if (status !== "playing" || current.length !== answer.length) return;
    const nextGuesses = [...guesses, current];
    setGuesses(nextGuesses);
    setCurrent("");

    if (current === answer) {
      setStatus("won");
      if (!submitted) {
        setSubmitted(true);
        await submitScore(pointsFromGuesses(nextGuesses.length, true));
        setRefreshKey((k) => k + 1);
      }
    } else if (nextGuesses.length >= MAX_GUESSES) {
      setStatus("lost");
    }
  }

  const letterStates: LetterState[][] = guesses.map((g) => evaluateGuess(g, answer));

  return (
    <GameLockGate gameLabel="Term of the Day">
      <div className="card flex items-center justify-between">
        <span className="text-sm text-slate-400">
          Guess: <span className="font-bold text-white">{guesses.length}/{MAX_GUESSES}</span>
        </span>
        <span className="text-sm text-slate-400">
          Best: <span className="font-bold text-amber-light">{bestScore}</span>
        </span>
      </div>

      <div className="card space-y-2 text-center">
        <p className="text-sm text-slate-400">
          Guess today&apos;s {answer.length}-letter term in {MAX_GUESSES} tries. Same term for
          everyone today.
        </p>

        <div className="space-y-1.5">
          {guesses.map((g, i) => (
            <div key={i} className="flex justify-center gap-1">
              {g.split("").map((letter, j) => (
                <span
                  key={j}
                  className={`flex h-9 w-9 items-center justify-center rounded-md text-sm font-bold text-white ${
                    letterStates[i][j] === "correct"
                      ? "bg-green-600"
                      : letterStates[i][j] === "present"
                        ? "bg-amber/70"
                        : "bg-white/10"
                  }`}
                >
                  {letter}
                </span>
              ))}
            </div>
          ))}
          {status === "playing" && (
            <div className="flex justify-center gap-1">
              {Array.from({ length: answer.length }).map((_, i) => (
                <span
                  key={i}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-white/20 text-sm font-bold text-white"
                >
                  {current[i] ?? ""}
                </span>
              ))}
            </div>
          )}
        </div>

        {status === "won" && <p className="text-lg font-bold text-white">🎉 Solved it!</p>}
        {status === "lost" && (
          <p className="text-sm text-slate-300">The term was {answer}. Come back tomorrow!</p>
        )}
      </div>

      {status === "playing" && (
        <div className="card space-y-2">
          <div className="flex flex-wrap justify-center gap-1.5">
            {"QWERTYUIOPASDFGHJKLZXCVBNM".split("").map((letter) => (
              <button
                key={letter}
                onClick={() => tapLetter(letter)}
                className="flex h-9 w-8 items-center justify-center rounded-md bg-white/10 text-sm font-semibold text-white"
              >
                {letter}
              </button>
            ))}
          </div>
          <div className="flex justify-center gap-2">
            <button className="btn-secondary" onClick={backspace}>
              ⌫ Delete
            </button>
            <button
              className="btn-primary"
              onClick={submitGuess}
              disabled={current.length !== answer.length}
            >
              Enter
            </button>
          </div>
        </div>
      )}

      <GameLeaderboard gameKey={GAME_KEY} refreshKey={refreshKey} />
    </GameLockGate>
  );
}
