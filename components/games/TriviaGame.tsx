"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { getToday } from "@/lib/dates";
import { useCoreRunUnlock } from "@/lib/useCoreRunUnlock";
import { TRIVIA_QUESTIONS, type TriviaQuestion } from "@/lib/trivia-data";
import type { GameLeaderEntry } from "@/lib/types";

const QUESTIONS_PER_DAY = 5;

// Deterministic per-day shuffle so every user gets the same set of
// questions on a given calendar day (fair for the streak/leaderboard),
// without needing any server-side "today's questions" state.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let s = seed;
  return function random() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dailyQuestionIndices(day: string, poolSize: number, count: number): number[] {
  const random = mulberry32(hashString(day));
  const indices = Array.from({ length: poolSize }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, Math.min(count, poolSize));
}

type DailyResult = { correct_count: number; total_count: number };

export default function TriviaGame() {
  const { user } = useAuth();
  const today = getToday();

  const {
    unlocked,
    loading: loadingUnlock,
    coreRunDoneToday,
    streak: coreRunStreak,
  } = useCoreRunUnlock(user.id, user.email);

  const [todayResult, setTodayResult] = useState<DailyResult | null>(null);
  const [loadingResult, setLoadingResult] = useState(true);

  const [streak, setStreak] = useState(0);
  const [leaders, setLeaders] = useState<GameLeaderEntry[]>([]);

  const [playing, setPlaying] = useState(false);
  const [questionOrder] = useState(() =>
    dailyQuestionIndices(today, TRIVIA_QUESTIONS.length, QUESTIONS_PER_DAY)
  );
  const [step, setStep] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);
  // The one question that ended today's attempt, kept around just for
  // this session so the result card can point to where its answer
  // actually lives - trivia_daily_results only stores a score, not which
  // question was missed, so this doesn't survive a page reload.
  const [missedQuestion, setMissedQuestion] = useState<TriviaQuestion | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadResult() {
      const { data } = await supabase
        .from("trivia_daily_results")
        .select("correct_count,total_count")
        .eq("user_id", user.id)
        .eq("day", today)
        .maybeSingle();
      if (cancelled) return;
      setTodayResult(data ?? null);
      setLoadingResult(false);
    }

    loadResult();
    return () => {
      cancelled = true;
    };
  }, [user.id, today]);

  async function loadStreakAndLeaders() {
    const [{ data: streakData }, { data: leaderData }] = await Promise.all([
      supabase.rpc("get_trivia_streak", { p_user_id: user.id }),
      supabase.rpc("get_trivia_streak_leaderboard"),
    ]);
    setStreak((streakData as number) ?? 0);
    setLeaders((leaderData as GameLeaderEntry[]) ?? []);
  }

  useEffect(() => {
    async function load() {
      await loadStreakAndLeaders();
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startQuiz() {
    setPlaying(true);
    setStep(0);
    setCorrectCount(0);
    setSelected(null);
    setRevealed(false);
    setFailed(false);
    setMissedQuestion(null);
  }

  async function finishAttempt(finalCorrect: number) {
    setPlaying(false);
    const result = { correct_count: finalCorrect, total_count: questionOrder.length };
    setTodayResult(result);
    await supabase.from("trivia_daily_results").insert({
      user_id: user.id,
      day: today,
      correct_count: result.correct_count,
      total_count: result.total_count,
    });
    loadStreakAndLeaders();
  }

  function selectAnswer(optionIndex: number) {
    if (revealed) return;
    setSelected(optionIndex);
    setRevealed(true);

    const q = TRIVIA_QUESTIONS[questionOrder[step]];
    const correct = optionIndex === q.correctIndex;

    if (correct) {
      const nextCorrect = correctCount + 1;
      setCorrectCount(nextCorrect);
      setTimeout(() => {
        if (step + 1 >= questionOrder.length) {
          finishAttempt(nextCorrect);
        } else {
          setStep((s) => s + 1);
          setSelected(null);
          setRevealed(false);
        }
      }, 900);
    } else {
      setFailed(true);
      setMissedQuestion(q);
      setTimeout(() => {
        finishAttempt(correctCount);
      }, 1600);
    }
  }

  const loading = loadingUnlock || loadingResult;
  const alreadyPlayedToday = todayResult !== null;
  const question = playing ? TRIVIA_QUESTIONS[questionOrder[step]] : null;

  return (
    <>
      <div className="card flex items-center justify-between">
        <span className="text-sm text-slate-400">
          Today:{" "}
          <span className="font-bold text-white">
            {todayResult
              ? `${todayResult.correct_count}/${todayResult.total_count}`
              : playing
                ? `${correctCount}/${questionOrder.length}`
                : "—"}
          </span>
        </span>
        <span className="text-sm text-slate-400">
          Streak: <span className="font-bold text-amber-light">🔥 {streak}</span>
        </span>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : !unlocked ? (
        <div className="card space-y-2">
          <p className="section-title">🔒 Locked for Today</p>
          <p className="text-sm text-slate-400">
            Complete today&apos;s Core Run - or keep an active streak going - to unlock today&apos;s 5
            trivia questions.
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-200">Core Run complete today</span>
            <span className={coreRunDoneToday ? "pill-amber" : "pill"}>
              {coreRunDoneToday ? "Done" : "Not yet"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-200">Active streak</span>
            <span className={coreRunStreak > 0 ? "pill-amber" : "pill"}>
              {coreRunStreak > 0 ? `🔥 ${coreRunStreak}` : "None"}
            </span>
          </div>
          <Link href="/streak" className="btn-primary block w-full text-center">
            Go to Core Run Streak
          </Link>
        </div>
      ) : alreadyPlayedToday && !playing ? (
        <div className="card space-y-2 text-center">
          <p className="text-lg font-bold text-white">
            {todayResult!.correct_count === todayResult!.total_count
              ? "🎉 Perfect!"
              : "Come back tomorrow"}
          </p>
          <p className="text-sm text-slate-300">
            You got {todayResult!.correct_count}/{todayResult!.total_count} today.
          </p>
          <p className="text-xs text-slate-500">
            A new set unlocks after you complete tomorrow&apos;s Core Run.
          </p>
          {missedQuestion && (
            <div className="rounded-lg bg-navy p-2.5 text-left">
              <p className="text-xs font-medium text-slate-300">{missedQuestion.question}</p>
              <p className="mt-1 text-xs text-amber-light">💡 {missedQuestion.source}</p>
            </div>
          )}
        </div>
      ) : !playing ? (
        <div className="card space-y-3 text-center">
          <p className="text-lg font-bold text-white">🧠 Today&apos;s 5 Questions</p>
          <p className="text-xs text-slate-400">
            This is a fun way to test your LTD knowledge — honor system, no looking up or
            asking someone for the answer. One attempt per day: get a question wrong and
            you&apos;ll try again tomorrow.
          </p>
          <p className="text-xs text-slate-500">
            Struggling to get 5 in a row correct? No pressure — just continue to plug into your
            audios, books, and team events and it will continue to get easier!
          </p>
          <button className="btn-primary w-full" onClick={startQuiz}>
            Start
          </button>
        </div>
      ) : question ? (
        <div className="card space-y-2">
          <p className="text-xs text-slate-500">
            Question {step + 1} of {questionOrder.length}
          </p>
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
          {revealed && failed && (
            <>
              <p className="text-sm text-red-300">
                Not quite — that&apos;s it for today. Come back tomorrow for a new set.
              </p>
              {missedQuestion && (
                <p className="text-xs text-amber-light">💡 {missedQuestion.source}</p>
              )}
            </>
          )}
        </div>
      ) : null}

      <div className="card space-y-1.5">
        <p className="section-title">🔥 Trivia Streak Leaderboard</p>
        {leaders.length === 0 ? (
          <p className="text-sm text-slate-400">No one&apos;s gone 5/5 yet — be the first!</p>
        ) : (
          leaders.map((l, i) => (
            <div key={l.user_id} className="flex items-center justify-between text-sm">
              <span className="text-slate-200">
                {i + 1}. {[l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed"}
              </span>
              <span className="pill pill-amber">🔥 {l.best_score}d</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
