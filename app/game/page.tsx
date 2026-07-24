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
const PIPE_GAP = 150;
const PIPE_WIDTH = 60;
const PIPE_SPEED = 3;
const PIPE_INTERVAL_MS = 1500;
const DIAMOND_SIZE = 24;
const DIAMOND_X = 70;

type Pipe = { x: number; gapY: number; passed: boolean };

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
  const pipes = useRef<Pipe[]>([]);
  const lastPipeTime = useRef(0);
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
    const w = DIAMOND_SIZE;
    const h = DIAMOND_SIZE;
    const cx = x + w / 2;
    const cy = y + h / 2;

    ctx.save();
    ctx.translate(cx, cy);

    const top = -h / 2;
    const bottom = h / 2;
    const tableHalf = w * 0.32;
    const girdleHalf = w * 0.5;
    const girdleY = -h * 0.12;

    const pTopL = { x: -tableHalf, y: top };
    const pTopR = { x: tableHalf, y: top };
    const pGirdleR = { x: girdleHalf, y: girdleY };
    const pBottom = { x: 0, y: bottom };
    const pGirdleL = { x: -girdleHalf, y: girdleY };

    function poly(points: { x: number; y: number }[]) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
    }

    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, "#cdeeff");
    grad.addColorStop(0.35, "#4fa8e8");
    grad.addColorStop(0.7, "#1c5fc7");
    grad.addColorStop(1, "#0b3a8f");
    poly([pTopL, pTopR, pGirdleR, pBottom, pGirdleL]);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ffffff";
    poly([pTopL, pTopR, pGirdleR, pGirdleL]);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(pGirdleL.x, pGirdleL.y);
    ctx.lineTo(0, top + 1);
    ctx.moveTo(pGirdleR.x, pGirdleR.y);
    ctx.lineTo(0, top + 1);
    ctx.moveTo(0, top);
    ctx.lineTo(0, bottom);
    ctx.stroke();

    poly([pTopL, pTopR, pGirdleR, pBottom, pGirdleL]);
    ctx.strokeStyle = "#08296b";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.moveTo(-tableHalf * 0.4, top + 2);
    ctx.lineTo(-tableHalf * 0.1, top + 2);
    ctx.lineTo(-tableHalf * 0.25, girdleY * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawPipe(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    height: number,
    dir: "down" | "up"
  ) {
    if (height <= 0) return;
    const w = PIPE_WIDTH;
    const capHeight = 26;
    const capOverhang = 6;

    const bodyGrad = ctx.createLinearGradient(x, 0, x + w, 0);
    bodyGrad.addColorStop(0, "#1f7a3d");
    bodyGrad.addColorStop(0.15, "#5bcf82");
    bodyGrad.addColorStop(0.45, "#2fa855");
    bodyGrad.addColorStop(0.85, "#1f7a3d");
    bodyGrad.addColorStop(1, "#0e4a20");

    ctx.fillStyle = bodyGrad;
    ctx.fillRect(x, y, w, height);
    ctx.strokeStyle = "#0a3517";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y, w - 2, height);

    const capY = dir === "down" ? y + height - capHeight : y;
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(x - capOverhang, capY, w + capOverhang * 2, capHeight);
    ctx.strokeRect(x - capOverhang + 1, capY, w + capOverhang * 2 - 2, capHeight);
  }

  function resetGame() {
    diamondY.current = HEIGHT / 2;
    velocity.current = 0;
    pipes.current = [];
    lastPipeTime.current = 0;
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

    if (lastPipeTime.current === 0) lastPipeTime.current = time;
    if (time - lastPipeTime.current > PIPE_INTERVAL_MS) {
      lastPipeTime.current = time;
      const gapY = 60 + Math.random() * (HEIGHT - 120 - PIPE_GAP);
      pipes.current.push({ x: WIDTH, gapY, passed: false });
    }

    for (const p of pipes.current) p.x -= PIPE_SPEED;
    pipes.current = pipes.current.filter((p) => p.x + PIPE_WIDTH > 0);

    let collided = diamondY.current < 0 || diamondY.current > HEIGHT - DIAMOND_SIZE;

    for (const p of pipes.current) {
      if (!p.passed && p.x + PIPE_WIDTH < DIAMOND_X) {
        p.passed = true;
        scoreRef.current += 1;
        setScore(scoreRef.current);
      }
      const withinX = DIAMOND_X + DIAMOND_SIZE > p.x && DIAMOND_X < p.x + PIPE_WIDTH;
      if (withinX) {
        const withinGap =
          diamondY.current > p.gapY && diamondY.current + DIAMOND_SIZE < p.gapY + PIPE_GAP;
        if (!withinGap) collided = true;
      }
    }

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, "#0a0f1e");
    bg.addColorStop(1, "#16213c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (const p of pipes.current) {
      drawPipe(ctx, p.x, 0, p.gapY, "down");
      drawPipe(ctx, p.x, p.gapY + PIPE_GAP, HEIGHT - (p.gapY + PIPE_GAP), "up");
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
      <PageHeader title="Diamond Run" subtitle="Tap to flap — dodge the pipes" />
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
