"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import { SkeletonList } from "@/components/Skeleton";
import DiamondRunGame from "@/components/games/DiamondRunGame";
import DiamondChaseGame from "@/components/games/DiamondChaseGame";
import TriviaGame from "@/components/games/TriviaGame";

type GameKey = "diamond-run" | "diamond-chase" | "trivia";

const GAMES: { key: GameKey; label: string }[] = [
  { key: "diamond-run", label: "Diamond Run" },
  { key: "diamond-chase", label: "Diamond Chase" },
  { key: "trivia", label: "Trivia" },
];

function isGameKey(value: string | null): value is GameKey {
  return value === "diamond-run" || value === "diamond-chase" || value === "trivia";
}

function GamesTabs() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [game, setGame] = useState<GameKey>(isGameKey(initialTab) ? initialTab : "diamond-run");

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {GAMES.map((g) => (
          <button
            key={g.key}
            onClick={() => setGame(g.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              game === g.key ? "bg-amber text-navy" : "bg-white/10 text-slate-300"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {game === "diamond-run" && <DiamondRunGame />}
      {game === "diamond-chase" && <DiamondChaseGame />}
      {game === "trivia" && <TriviaGame />}
    </>
  );
}

export default function GamesPage() {
  return (
    <FeatureGate minSession={5}>
      <PageHeader title="Games" subtitle="Take a break and have some fun" />
      <main className="page-main">
        <Suspense fallback={<SkeletonList cards={1} lines={4} />}>
          <GamesTabs />
        </Suspense>
      </main>
    </FeatureGate>
  );
}
