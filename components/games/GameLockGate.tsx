"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthGate";
import { useCoreRunUnlock } from "@/lib/useCoreRunUnlock";

// Shared lock screen for every game added after Diamond Run/Diamond
// Chase/Trivia (which each wire useCoreRunUnlock directly, before this
// wrapper existed) - same unlock rule (today's Core Run done, or an
// active streak already), just factored out so a new game doesn't have
// to repeat the "Locked for Today" card each time.
export default function GameLockGate({ gameLabel, children }: { gameLabel: string; children: ReactNode }) {
  const { user } = useAuth();
  const { unlocked, loading, coreRunDoneToday, streak } = useCoreRunUnlock(user.id, user.email);

  if (loading) return <div className="empty-state">Loading…</div>;

  if (!unlocked) {
    return (
      <div className="card space-y-2">
        <p className="section-title">🔒 Locked for Today</p>
        <p className="text-sm text-slate-400">
          Complete today&apos;s Core Run - or keep an active streak going - to unlock {gameLabel}.
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-200">Core Run complete today</span>
          <span className={coreRunDoneToday ? "pill-amber" : "pill"}>{coreRunDoneToday ? "Done" : "Not yet"}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-200">Active streak</span>
          <span className={streak > 0 ? "pill-amber" : "pill"}>{streak > 0 ? `🔥 ${streak}` : "None"}</span>
        </div>
        <Link href="/streak" className="btn-primary block w-full text-center">
          Go to Core Run Streak
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
