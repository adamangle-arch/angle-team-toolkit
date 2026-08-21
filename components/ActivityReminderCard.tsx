"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DollarSign, Target, Flame, Camera, ArrowUpRight, type LucideIcon } from "lucide-react";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { getToday } from "@/lib/dates";

type ReminderKey = "volume" | "goals" | "core_run" | "stories";

const REMINDERS: Record<ReminderKey, { icon: LucideIcon; title: string; body: string; href: string }> = {
  volume: {
    icon: DollarSign,
    title: "Log this month's volume",
    body: "No PV logged yet this month — head to Volume to catch up.",
    href: "/volume",
  },
  goals: {
    icon: Target,
    title: "Set your goals",
    body: "You haven't set any goals yet — a few minutes on Goals keeps you focused.",
    href: "/goals",
  },
  core_run: {
    icon: Flame,
    title: "Your Core Run has gone quiet",
    body: "Nothing logged in the last 3 days — open Core Run Streak to get back on track.",
    href: "/streak",
  },
  stories: {
    icon: Camera,
    title: "Post this week's story",
    body: "You haven't posted a story this week — Stories is waiting for today's prompt.",
    href: "/stories",
  },
};

const ORDER: ReminderKey[] = ["volume", "goals", "core_run", "stories"];

// Deterministic same-day pick (stable across re-renders/re-opens the same
// day, not a coin flip each time) - same hash-of-the-date-string
// technique getTodayStoryPrompt() already uses, applied here to whichever
// reminders currently apply instead of always surfacing every one at
// once. Rotates which single reminder shows day to day so falling behind
// on more than one thing doesn't stack a wall of nags on Home every time
// the app opens - and once the shown one is acted on, it naturally drops
// out of the applicable set on the next check.
function pickForToday<T>(items: T[], dateStr: string): T {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  return items[Math.abs(hash) % items.length];
}

type ReminderFlags = {
  needs_volume: boolean;
  needs_goals: boolean;
  needs_core_run: boolean;
  needs_stories: boolean;
};

// Home-page card pointing at whichever one of Volume/Goals/Core Run/
// Stories is currently behind, per get_activity_reminder_flags() -
// deliberately shows at most one at a time (see pickForToday above)
// rather than every applicable reminder simultaneously.
export default function ActivityReminderCard() {
  const { user } = useAuth();
  const [applicable, setApplicable] = useState<ReminderKey[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("get_activity_reminder_flags", { p_as_of_day: getToday() })
      .then(({ data }) => {
        if (cancelled) return;
        const row = (data as ReminderFlags[] | null)?.[0];
        if (!row) {
          setApplicable([]);
          return;
        }
        setApplicable(
          ORDER.filter(
            (key) => row[`needs_${key}` as keyof ReminderFlags]
          )
        );
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (!applicable || applicable.length === 0) return null;

  const key = pickForToday(applicable, getToday());
  const def = REMINDERS[key];
  const Icon = def.icon;

  return (
    <Link href={def.href} className="card flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amber">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{def.title}</p>
        <p className="text-xs text-slate-400">{def.body}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
    </Link>
  );
}
