"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthGate";
import { useGameScore } from "@/lib/useGameScore";
import { CANDIDATE_STEPS } from "@/lib/constants";
import GameLockGate from "@/components/games/GameLockGate";
import GameLeaderboard from "@/components/games/GameLeaderboard";

const GAME_KEY = "speed_sort";
const GAME_DURATION_MS = 45000;
const STAGE_LABELS = CANDIDATE_STEPS.map((s) => s.label);

function randomQuestion(): { prompt: string; answer: string; options: string[] } {
  const index = Math.floor(Math.random() * (STAGE_LABELS.length - 1));
  const current = STAGE_LABELS[index];
  const answer = STAGE_LABELS[index + 1];
  const distractors = STAGE_LABELS.filter((s) => s !== answer && s !== current);
  const shuffled = [...distractors].sort(() => Math.random() - 0.5).slice(0, 3);
  const options = [...shuffled, answer].sort(() => Math.random() - 0.5);
  return { prompt: `What comes right after ${current}?`, answer, options };
}

export default function SpeedSortGame() {
  const { user } = useAuth();
  const { bestScore, submitScore } = useGameScore(user.id, GAME_KEY);

  const [question, setQuestion] = useState(() => randomQuestion());
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(GAME_DURATION_MS);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const scoreRef = useRef(0);
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    };
  }, []);

  async function endGame() {
    runningRef.current = false;
    setRunning(false);
    setGameOver(true);
    if (timerRef.current) clearInterval(timerRef.current);
    await submitScore(scoreRef.current);
    setRefreshKey((k) => k + 1);
  }

  function startGame() {
    scoreRef.current = 0;
    setScore(0);
    setGameOver(false);
    setFeedback(null);
    setQuestion(randomQuestion());
    setTimeLeftMs(GAME_DURATION_MS);
    setRunning(true);
    runningRef.current = true;

    const endAt = Date.now() + GAME_DURATION_MS;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, endAt - Date.now());
      setTimeLeftMs(remaining);
      if (remaining <= 0) endGame();
    }, 200);
  }

  function answer(choice: string) {
    if (!runningRef.current) return;
    const correct = choice === question.answer;
    setFeedback(correct ? "correct" : "wrong");
    if (correct) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
    }
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(() => {
      setFeedback(null);
      setQuestion(randomQuestion());
    }, 350);
  }

  return (
    <GameLockGate gameLabel="Speed Sort">
      <div className="card flex items-center justify-between">
        <span className="text-sm text-slate-400">
          Score: <span className="font-bold text-white">{score}</span>
        </span>
        <span className="text-sm text-slate-400">
          Best: <span className="font-bold text-amber-light">{bestScore}</span>
        </span>
      </div>

      {!running ? (
        <div className="card space-y-2 text-center">
          {gameOver && (
            <>
              <p className="text-lg font-bold text-white">Time&apos;s up!</p>
              <p className="text-sm text-slate-300">{score} correct.</p>
            </>
          )}
          <p className="text-sm text-slate-400">
            45 seconds. Pick what comes next in the Candidate Roadmap sequence as fast as you can.
          </p>
          <button className="btn-primary w-full" onClick={startGame}>
            {gameOver ? "Play Again" : "Start"}
          </button>
        </div>
      ) : (
        <div className="card space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{question.prompt}</span>
            <span>{Math.ceil(timeLeftMs / 1000)}s</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {question.options.map((opt) => (
              <button
                key={opt}
                onClick={() => answer(opt)}
                disabled={feedback !== null}
                className={`rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                  feedback && opt === question.answer
                    ? "border-green-500 bg-green-500/20 text-white"
                    : feedback === "wrong" && opt !== question.answer
                      ? "border-white/10 bg-white/5 text-slate-500"
                      : "border-white/20 bg-white/10 text-white"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      <GameLeaderboard gameKey={GAME_KEY} refreshKey={refreshKey} />
    </GameLockGate>
  );
}
