"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import DiamondRunGame from "@/components/games/DiamondRunGame";
import DiamondChaseGame from "@/components/games/DiamondChaseGame";
import TriviaGame from "@/components/games/TriviaGame";

type GameKey = "diamond-run" | "diamond-chase" | "trivia";

const GAMES: { key: GameKey; label: string }[] = [
  { key: "diamond-run", label: "Diamond Run" },
  { key: "diamond-chase", label: "Diamond Chase" },
  { key: "trivia", label: "Trivia" },
];

export default function GamesPage() {
  const [game, setGame] = useState<GameKey>("diamond-run");

  return (
    <>
      <PageHeader title="Games" subtitle="Take a break and have some fun" />
      <main className="page-main">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {GAMES.map((g) => (
            <button
              key={g.key}
              onClick={() => setGame(g.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
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
      </main>
    </>
  );
}
