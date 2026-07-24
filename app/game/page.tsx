"use client";

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import type { GameLeaderEntry } from "@/lib/types";

const WIDTH = 350;
const HEIGHT = 500;
const GRAVITY = 0.5;
const FLAP_VELOCITY = -8;
const CAN_GAP = 150;
const CAN_WIDTH = 60;
const CAN_SPEED = 3;
const CAN_INTERVAL_MS = 1500;
const DIAMOND_SIZE = 24;
const DIAMOND_X = 70;

type Can = { x: number; gapY: number; passed: boolean };

export default function GamePage() {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [leaders, setLeaders] = useState<GameLeaderEntry[]>([]);

  const diamondY = useRef(HEIGHT / 2);
  const velocity = useRef(0);
  const cans = useRef<Can[]>([]);
  const lastCanTime = useRef(0);
  const animFrame = useRef(0);
  const scoreRef = useRef(0);
  const bestScoreRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadBest() {
      const { data } = await supabase
        .from("game_high_scores")
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
    const { data } = await supabase.rpc("get_game_leaderboard");
    setLeaders((data as GameLeaderEntry[]) ?? []);
  }

  useEffect(() => {
    async function load() {
      await loadLeaders();
    }
    load();
  }, []);

  function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const r = DIAMOND_SIZE / 2;
    ctx.save();
    ctx.translate(x + r, y + r);
    ctx.rotate(Math.PI / 4);
    const grad = ctx.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, "#fbbf24");
    grad.addColorStop(1, "#f59e0b");
    ctx.fillStyle = grad;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  function drawCan(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    height: number,
    dir: "down" | "up"
  ) {
    if (height <= 0) return;
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(x, y, CAN_WIDTH, height);
    ctx.fillStyle = "#f59e0b";
    const bandY = dir === "down" ? y + height - 28 : y + 6;
    ctx.fillRect(x, bandY, CAN_WIDTH, 22);
    ctx.fillStyle = "#0a0f1e";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("XS", x + CAN_WIDTH / 2, bandY + 16);
  }

  function resetGame() {
    diamondY.current = HEIGHT / 2;
    velocity.current = 0;
    cans.current = [];
    lastCanTime.current = 0;
    scoreRef.current = 0;
    setScore(0);
    setGameOver(false);
  }

  async function endGame() {
    runningRef.current = false;
    setRunning(false);
    setGameOver(true);
    cancelAnimationFrame(animFrame.current);
    if (scoreRef.current > bestScoreRef.current) {
      bestScoreRef.current = scoreRef.current;
      setBestScore(scoreRef.current);
      await supabase.from("game_high_scores").upsert(
        { user_id: user.id, best_score: scoreRef.current, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      loadLeaders();
    }
  }

  function loop(time: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    velocity.current += GRAVITY;
    diamondY.current += velocity.current;

    if (lastCanTime.current === 0) lastCanTime.current = time;
    if (time - lastCanTime.current > CAN_INTERVAL_MS) {
      lastCanTime.current = time;
      const gapY = 60 + Math.random() * (HEIGHT - 120 - CAN_GAP);
      cans.current.push({ x: WIDTH, gapY, passed: false });
    }

    for (const c of cans.current) c.x -= CAN_SPEED;
    cans.current = cans.current.filter((c) => c.x + CAN_WIDTH > 0);

    let collided = diamondY.current < 0 || diamondY.current > HEIGHT - DIAMOND_SIZE;

    for (const c of cans.current) {
      if (!c.passed && c.x + CAN_WIDTH < DIAMOND_X) {
        c.passed = true;
        scoreRef.current += 1;
        setScore(scoreRef.current);
      }
      const withinX = DIAMOND_X + DIAMOND_SIZE > c.x && DIAMOND_X < c.x + CAN_WIDTH;
      if (withinX) {
        const withinGap =
          diamondY.current > c.gapY && diamondY.current + DIAMOND_SIZE < c.gapY + CAN_GAP;
        if (!withinGap) collided = true;
      }
    }

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, "#0a0f1e");
    bg.addColorStop(1, "#16213c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (const c of cans.current) {
      drawCan(ctx, c.x, 0, c.gapY, "down");
      drawCan(ctx, c.x, c.gapY + CAN_GAP, HEIGHT - (c.gapY + CAN_GAP), "up");
    }

    drawDiamond(ctx, DIAMOND_X, diamondY.current);

    if (collided) {
      endGame();
      return;
    }

    animFrame.current = requestAnimationFrame(loop);
  }

  function startGame() {
    resetGame();
    runningRef.current = true;
    setRunning(true);
    animFrame.current = requestAnimationFrame(loop);
  }

  function flap() {
    if (!runningRef.current) {
      startGame();
    }
    velocity.current = FLAP_VELOCITY;
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        flap();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(animFrame.current);
  }, []);

  return (
    <>
      <PageHeader title="Diamond Run" subtitle="Tap to flap — dodge the XS cans" />
      <main className="page-main">
        <div className="card flex items-center justify-between">
          <span className="text-sm text-slate-400">
            Score: <span className="font-bold text-white">{score}</span>
          </span>
          <span className="text-sm text-slate-400">
            Best: <span className="font-bold text-amber-light">{bestScore}</span>
          </span>
        </div>

        <div
          className="relative mx-auto overflow-hidden rounded-2xl border border-white/10"
          style={{ width: WIDTH, height: HEIGHT }}
          onClick={flap}
        >
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
          {!running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-navy/70 px-4 text-center">
              {gameOver ? (
                <>
                  <p className="text-lg font-bold text-white">Game Over</p>
                  <p className="text-sm text-slate-300">Score: {score}</p>
                </>
              ) : (
                <p className="text-lg font-bold text-white">💎 Tap to Start</p>
              )}
              <button
                className="btn-primary mt-2"
                onClick={(e) => {
                  e.stopPropagation();
                  flap();
                }}
              >
                {gameOver ? "Play Again" : "Start"}
              </button>
            </div>
          )}
        </div>

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
      </main>
    </>
  );
}
