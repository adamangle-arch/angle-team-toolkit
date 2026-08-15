"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, Flame, Gem } from "lucide-react";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { useCoreRunUnlock } from "@/lib/useCoreRunUnlock";
import type { GameLeaderEntry } from "@/lib/types";

const COLS = 15;
const ROWS = 20;
const CELL = 20;
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL;
const INITIAL_TICK_MS = 200;
const MIN_TICK_MS = 90;
const SPEED_STEP_MS = 3;

type Point = { x: number; y: number };
type Direction = "up" | "down" | "left" | "right";

const DELTAS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export default function DiamondChaseGame() {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [leaders, setLeaders] = useState<GameLeaderEntry[]>([]);
  const { unlocked, loading: loadingUnlock, coreRunDoneToday, streak: coreRunStreak } = useCoreRunUnlock(
    user.id,
    user.email
  );

  const snake = useRef<Point[]>([]);
  const direction = useRef<Direction>("right");
  const pendingDirection = useRef<Direction>("right");
  const food = useRef<Point>({ x: 0, y: 0 });
  const tickIntervalRef = useRef(INITIAL_TICK_MS);
  const lastTickTime = useRef(0);
  const animFrame = useRef(0);
  const scoreRef = useRef(0);
  const bestScoreRef = useRef(0);
  const timesImprovedRef = useRef(0);
  const runningRef = useRef(false);
  const touchStart = useRef<Point | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBest() {
      const { data } = await supabase
        .from("snake_high_scores")
        .select("best_score, times_improved")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const best = data?.best_score ?? 0;
      bestScoreRef.current = best;
      setBestScore(best);
      timesImprovedRef.current = data?.times_improved ?? 0;
    }

    loadBest();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  async function loadLeaders() {
    const { data } = await supabase.rpc("get_snake_leaderboard");
    setLeaders((data as GameLeaderEntry[]) ?? []);
  }

  useEffect(() => {
    async function load() {
      await loadLeaders();
    }
    load();
  }, []);

  function drawDiamondSegment(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    isHead: boolean
  ) {
    const pad = isHead ? 1 : 2;
    const w = CELL - pad * 2;
    const h = CELL - pad * 2;
    const cx = px + CELL / 2;
    const cy = py + CELL / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grad.addColorStop(0, "#cdeeff");
    grad.addColorStop(0.5, "#4fa8e8");
    grad.addColorStop(1, "#1c5fc7");
    ctx.fillStyle = grad;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    if (isHead) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }

  function drawBook(ctx: CanvasRenderingContext2D, px: number, py: number) {
    const pad = 3;
    const w = CELL - pad * 2;
    const h = CELL - pad * 2;
    const x = px + pad;
    const y = py + pad;

    ctx.fillStyle = "#c0392b";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#f5e9da";
    ctx.fillRect(x + w * 0.3, y + h * 0.1, w * 0.6, h * 0.8);
    ctx.fillStyle = "#8e2a1f";
    ctx.fillRect(x, y, w * 0.22, h);
  }

  function render() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, "#0a0f1e");
    bg.addColorStop(1, "#16213c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawBook(ctx, food.current.x * CELL, food.current.y * CELL);

    snake.current.forEach((seg, i) => {
      drawDiamondSegment(ctx, seg.x * CELL, seg.y * CELL, i === 0);
    });
  }

  function spawnFood() {
    let point: Point;
    do {
      point = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS),
      };
    } while (snake.current.some((s) => s.x === point.x && s.y === point.y));
    food.current = point;
  }

  function resetGame() {
    const startX = Math.floor(COLS / 2);
    const startY = Math.floor(ROWS / 2);
    snake.current = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ];
    direction.current = "right";
    pendingDirection.current = "right";
    tickIntervalRef.current = INITIAL_TICK_MS;
    lastTickTime.current = 0;
    scoreRef.current = 0;
    setScore(0);
    setGameOver(false);
    spawnFood();
  }

  async function endGame() {
    runningRef.current = false;
    setRunning(false);
    setGameOver(true);
    cancelAnimationFrame(animFrame.current);
    if (scoreRef.current > bestScoreRef.current) {
      // Same reasoning as Diamond Run: the very first score set (no real
      // previous best yet) doesn't count as "beating" anything.
      if (bestScoreRef.current > 0) {
        timesImprovedRef.current += 1;
      }
      bestScoreRef.current = scoreRef.current;
      setBestScore(scoreRef.current);
      await supabase.from("snake_high_scores").upsert(
        {
          user_id: user.id,
          best_score: scoreRef.current,
          times_improved: timesImprovedRef.current,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      loadLeaders();
    }
  }

  function loop(time: number) {
    animFrame.current = requestAnimationFrame(loop);
    if (lastTickTime.current === 0) lastTickTime.current = time;
    if (time - lastTickTime.current < tickIntervalRef.current) return;
    lastTickTime.current = time;

    direction.current = pendingDirection.current;
    const head = snake.current[0];
    const d = DELTAS[direction.current];
    const newHead = { x: head.x + d.x, y: head.y + d.y };

    const hitWall =
      newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS;
    const willEat = newHead.x === food.current.x && newHead.y === food.current.y;
    const bodyToCheck = willEat ? snake.current : snake.current.slice(0, -1);
    const hitSelf = bodyToCheck.some((s) => s.x === newHead.x && s.y === newHead.y);

    if (hitWall || hitSelf) {
      endGame();
      return;
    }

    const newSnake = [newHead, ...snake.current];
    if (!willEat) {
      newSnake.pop();
    } else {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      tickIntervalRef.current = Math.max(MIN_TICK_MS, tickIntervalRef.current - SPEED_STEP_MS);
      spawnFood();
    }
    snake.current = newSnake;

    render();
  }

  function startGame() {
    resetGame();
    runningRef.current = true;
    setRunning(true);
    render();
    animFrame.current = requestAnimationFrame(loop);
  }

  function setDirection(next: Direction) {
    if (!runningRef.current) {
      startGame();
      return;
    }
    if (OPPOSITE[direction.current] === next) return;
    pendingDirection.current = next;
  }

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      if (!runningRef.current) startGame();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      setDirection(dx > 0 ? "right" : "left");
    } else {
      setDirection(dy > 0 ? "down" : "up");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const map: Record<string, Direction> = {
        ArrowUp: "up",
        w: "up",
        W: "up",
        ArrowDown: "down",
        s: "down",
        S: "down",
        ArrowLeft: "left",
        a: "left",
        A: "left",
        ArrowRight: "right",
        d: "right",
        D: "right",
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        setDirection(dir);
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
      {loadingUnlock ? (
        <div className="empty-state">Loading…</div>
      ) : !unlocked ? (
        <div className="card space-y-2">
          <p className="section-title flex items-center gap-1.5">
            <Lock className="h-4 w-4" aria-hidden />
            Locked for Today
          </p>
          <p className="text-sm text-slate-400">
            Complete today&apos;s Core Run - or keep an active streak going - to unlock Diamond Chase.
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-200">Core Run complete today</span>
            <span className={coreRunDoneToday ? "pill-amber" : "pill"}>
              {coreRunDoneToday ? "Done" : "Not yet"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-200">Active streak</span>
            <span className={coreRunStreak > 0 ? "pill-amber gap-1" : "pill"}>
              {coreRunStreak > 0 ? (
                <>
                  <Flame className="h-3 w-3" aria-hidden />
                  {coreRunStreak}
                </>
              ) : (
                "None"
              )}
            </span>
          </div>
          <Link href="/streak" className="btn-primary block w-full text-center">
            Go to Core Run Streak
          </Link>
        </div>
      ) : (
        <>
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
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
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
                  <p className="flex items-center gap-1.5 text-lg font-bold text-white">
                    <Gem className="h-5 w-5" aria-hidden />
                    Tap to Start
                  </p>
                )}
                <button
                  className="btn-primary mt-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    startGame();
                  }}
                >
                  {gameOver ? "Play Again" : "Start"}
                </button>
              </div>
            )}
          </div>

          <div className="mx-auto grid w-48 grid-cols-3 grid-rows-3 gap-2">
            <div />
            <button
              className="btn-icon !h-14 !w-14 text-2xl"
              onClick={() => setDirection("up")}
              aria-label="Up"
            >
              ▲
            </button>
            <div />
            <button
              className="btn-icon !h-14 !w-14 text-2xl"
              onClick={() => setDirection("left")}
              aria-label="Left"
            >
              ◀
            </button>
            <div />
            <button
              className="btn-icon !h-14 !w-14 text-2xl"
              onClick={() => setDirection("right")}
              aria-label="Right"
            >
              ▶
            </button>
            <div />
            <button
              className="btn-icon !h-14 !w-14 text-2xl"
              onClick={() => setDirection("down")}
              aria-label="Down"
            >
              ▼
            </button>
            <div />
          </div>
        </>
      )}

      <div className="card space-y-1.5">
        <p className="section-title flex items-center gap-1.5">
          <Gem className="h-4 w-4" aria-hidden />
          High Scores
        </p>
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
    </>
  );
}
