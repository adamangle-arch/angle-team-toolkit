"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthGate";
import { useGameScore } from "@/lib/useGameScore";
import GameLockGate from "@/components/games/GameLockGate";
import GameLeaderboard from "@/components/games/GameLeaderboard";

const GAME_KEY = "pv_pop";
const WIDTH = 350;
const HEIGHT = 500;
const GAME_DURATION_MS = 30000;
const SPAWN_INTERVAL_MS = 550;
const DIAMOND_CHANCE = 0.12;

type Bubble = { x: number; y: number; radius: number; speed: number; isDiamond: boolean };

export default function PvPopGame() {
  const { user } = useAuth();
  const { bestScore, submitScore } = useGameScore(user.id, GAME_KEY);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [score, setScore] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(GAME_DURATION_MS);
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const bubbles = useRef<Bubble[]>([]);
  const scoreRef = useRef(0);
  const lastSpawn = useRef(0);
  const startTime = useRef(0);
  const animFrame = useRef(0);
  const runningRef = useRef(false);

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const b of bubbles.current) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = b.isDiamond ? "rgba(245, 158, 11, 0.85)" : "rgba(96, 165, 250, 0.55)";
      ctx.fill();
      ctx.strokeStyle = b.isDiamond ? "#fbbf24" : "rgba(191, 219, 254, 0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (b.isDiamond) {
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("💎", b.x, b.y);
      }
    }
  }

  function tick(now: number) {
    if (!runningRef.current) return;
    const elapsed = now - startTime.current;
    const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
    setTimeLeftMs(remaining);

    if (now - lastSpawn.current > SPAWN_INTERVAL_MS) {
      lastSpawn.current = now;
      const isDiamond = Math.random() < DIAMOND_CHANCE;
      bubbles.current.push({
        x: 20 + Math.random() * (WIDTH - 40),
        y: HEIGHT + 20,
        radius: isDiamond ? 16 : 20 + Math.random() * 10,
        speed: 1 + Math.random() * 1.5,
        isDiamond,
      });
    }

    bubbles.current = bubbles.current.filter((b) => {
      b.y -= b.speed;
      return b.y + b.radius > 0;
    });

    draw();

    if (remaining <= 0) {
      endGame();
      return;
    }
    animFrame.current = requestAnimationFrame(tick);
  }

  async function endGame() {
    runningRef.current = false;
    setRunning(false);
    setGameOver(true);
    cancelAnimationFrame(animFrame.current);
    await submitScore(scoreRef.current);
    setRefreshKey((k) => k + 1);
  }

  function startGame() {
    bubbles.current = [];
    scoreRef.current = 0;
    setScore(0);
    setGameOver(false);
    setTimeLeftMs(GAME_DURATION_MS);
    setRunning(true);
    runningRef.current = true;
    startTime.current = performance.now();
    lastSpawn.current = 0;
    animFrame.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    draw();
    return () => cancelAnimationFrame(animFrame.current);
  }, []);

  function handlePop(e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) {
    if (!running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY : e.clientY;
    if (clientX === undefined || clientY === undefined) return;
    const x = ((clientX - rect.left) / rect.width) * WIDTH;
    const y = ((clientY - rect.top) / rect.height) * HEIGHT;

    for (let i = bubbles.current.length - 1; i >= 0; i--) {
      const b = bubbles.current[i];
      const dx = x - b.x;
      const dy = y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) <= b.radius) {
        bubbles.current.splice(i, 1);
        scoreRef.current += b.isDiamond ? 5 : 1;
        setScore(scoreRef.current);
        break;
      }
    }
  }

  return (
    <GameLockGate gameLabel="PV Pop">
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
        onClick={handlePop}
        onTouchStart={handlePop}
      >
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-navy/70 px-4 text-center">
            {gameOver ? (
              <>
                <p className="text-lg font-bold text-white">Time&apos;s up!</p>
                <p className="text-sm text-slate-300">You popped {score} bubbles.</p>
              </>
            ) : (
              <p className="text-sm text-slate-300">
                Pop as many bubbles as you can in 30 seconds. Gold 💎 bubbles are worth 5x.
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
        {running && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-navy/80 px-2 py-0.5 text-xs font-semibold text-white">
            {Math.ceil(timeLeftMs / 1000)}s
          </div>
        )}
      </div>

      <GameLeaderboard gameKey={GAME_KEY} refreshKey={refreshKey} />
    </GameLockGate>
  );
}
