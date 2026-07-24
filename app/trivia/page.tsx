"use client";

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { TRIVIA_QUESTIONS } from "@/lib/trivia-data";
import type { GameLeaderEntry } from "@/lib/types";

function shuffledIndices(length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function TriviaPage() {
  const { user } = useAuth();

  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [running, setRunning] = useState(false);
  const [roundOver, setRoundOver] = useState(false);
  const [leaders, setLeaders] = useState<GameLeaderEntry[]>([]);

  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const queue = useRef<number[]>([]);
  const bestScoreRef = useRef(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBest() {
      const { data } = await supabase
        .from("trivia_high_scores")
        .select("best_score")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const best = data?.best_score ?? 0;
      bestScoreRef.current = best;
      setBestScore(best);
    }

    loadBest();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  async function loadLeaders() {
    const { data } = await supabase.rpc("get_trivia_leaderboard");
    setLeaders((data as GameLeaderEntry[]) ?? []);
  }

  useEffect(() => {
    async function load() {
      await loadLeaders();
    }
    load();
  }, []);

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  function nextQuestion() {
    if (queue.current.length === 0) {
      queue.current = shuffledIndices(TRIVIA_QUESTIONS.length);
    }
    const index = queue.current.shift();
    if (index === undefined) return;
    setCurrentIndex(index);
    setSelected(null);
    setRevealed(false);
  }

  function startGame() {
    setScore(0);
    setRoundOver(false);
    setRunning(true);
    queue.current = shuffledIndices(TRIVIA_QUESTIONS.length);
    nextQuestion();
  }

  async function endRound(finalScore: number) {
    setRunning(false);
    setRoundOver(true);
    if (finalScore > bestScoreRef.current) {
      bestScoreRef.current = finalScore;
      setBestScore(finalScore);
      await supabase.from("trivia_high_scores").upsert(
        { user_id: user.id, best_score: finalScore, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      loadLeaders();
    }
  }

  function selectAnswer(optionIndex: number) {
    if (revealed || currentIndex === null) return;
    setSelected(optionIndex);
    setRevealed(true);

    const question = TRIVIA_QUESTIONS[currentIndex];
    const correct = optionIndex === question.correctIndex;

    if (correct) {
      const nextScore = score + 1;
      setScore(nextScore);
      advanceTimer.current = setTimeout(() => {
        nextQuestion();
      }, 900);
    } else {
      advanceTimer.current = setTimeout(() => {
        endRound(score);
      }, 1400);
    }
  }

  const question = currentIndex !== null ? TRIVIA_QUESTIONS[currentIndex] : null;
  const noQuestions = TRIVIA_QUESTIONS.length === 0;

  return (
    <>
      <PageHeader title="Trivia" subtitle="How many can you get in a row?" />
      <main className="page-main">
        <div className="card flex items-center justify-between">
          <span className="text-sm text-slate-400">
            Streak: <span className="font-bold text-white">{score}</span>
          </span>
          <span className="text-sm text-slate-400">
            Best: <span className="font-bold text-amber-light">{bestScore}</span>
          </span>
        </div>

        {!running ? (
          <div className="card space-y-3 text-center">
            {roundOver ? (
              <>
                <p className="text-lg font-bold text-white">Round Over</p>
                <p className="text-sm text-slate-300">You got {score} in a row.</p>
              </>
            ) : (
              <p className="text-lg font-bold text-white">🧠 Ready?</p>
            )}
            <button className="btn-primary w-full" onClick={startGame} disabled={noQuestions}>
              {roundOver ? "Play Again" : "Start"}
            </button>
            {noQuestions && (
              <p className="text-xs text-slate-500">No trivia questions loaded yet.</p>
            )}
          </div>
        ) : question ? (
          <div className="card space-y-2">
            <p className="text-base font-medium text-white">{question.question}</p>
            <div className="space-y-1.5">
              {question.options.map((option, i) => {
                let extra = "";
                if (revealed) {
                  if (i === question.correctIndex) extra = "!border-amber bg-amber/15";
                  else if (i === selected) extra = "!border-red-500/60 bg-red-500/10";
                }
                return (
                  <button
                    key={i}
                    className={`input w-full text-left ${extra}`}
                    onClick={() => selectAnswer(i)}
                    disabled={revealed}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="card space-y-1.5">
          <p className="section-title">🧠 High Scores</p>
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
      </main>
    </>
  );
}
