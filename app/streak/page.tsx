"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import { getToday } from "@/lib/dates";
import type { StreakDay } from "@/lib/types";

const ACTIVITIES: { key: keyof Pick<StreakDay, "read" | "listen" | "associate" | "events">; label: string; icon: string }[] = [
  { key: "read", label: "Read", icon: "📖" },
  { key: "listen", label: "Listen", icon: "🎧" },
  { key: "associate", label: "Associate", icon: "🤝" },
  { key: "events", label: "Events", icon: "🎤" },
];

function qualifies(day: StreakDay): boolean {
  return (
    [day.read, day.listen, day.associate, day.events].filter(Boolean).length >= 3
  );
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function StreakPage() {
  const [history, setHistory] = useState<Record<string, StreakDay>>({});
  const [loading, setLoading] = useState(true);
  const today = getToday();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const since = addDays(today, -120);
      const { data } = await supabase
        .from("streak_days")
        .select("*")
        .gte("day", since)
        .order("day", { ascending: false });
      const map: Record<string, StreakDay> = {};
      for (const row of (data as StreakDay[]) ?? []) {
        map[row.day] = row;
      }
      setHistory(map);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayRow: StreakDay =
    history[today] ??
    ({ id: "", day: today, read: false, listen: false, associate: false, events: false } as StreakDay);

  async function toggle(key: (typeof ACTIVITIES)[number]["key"]) {
    const updated = { ...todayRow, [key]: !todayRow[key] };
    setHistory((prev) => ({ ...prev, [today]: updated }));
    const { data } = await supabase
      .from("streak_days")
      .upsert(
        {
          day: today,
          read: updated.read,
          listen: updated.listen,
          associate: updated.associate,
          events: updated.events,
        },
        { onConflict: "day" }
      )
      .select("*")
      .single();
    if (data) setHistory((prev) => ({ ...prev, [today]: data as StreakDay }));
  }

  const streak = useMemo(() => {
    let count = 0;
    let cursor = today;
    if (!(history[cursor] && qualifies(history[cursor]))) {
      cursor = addDays(cursor, -1);
    }
    while (history[cursor] && qualifies(history[cursor])) {
      count++;
      cursor = addDays(cursor, -1);
    }
    return count;
  }, [history, today]);

  const todayQualifies = qualifies(todayRow);
  const doneCount = ACTIVITIES.filter((a) => todayRow[a.key]).length;

  return (
    <>
      <PageHeader title="Self-Education Streak" subtitle="Read • Listen • Associate • Events" />
      <main className="page-main">
        <div className="card flex items-center justify-between">
          <div>
            <p className="section-title">Current Streak</p>
            <p className="text-xs text-slate-400">3+ of 4 done counts as a streak day</p>
          </div>
          <p className="text-3xl font-bold text-amber">🔥 {streak}</p>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="section-title">Today</p>
            <span className={todayQualifies ? "pill-amber" : "pill"}>
              {doneCount}/4 done
            </span>
          </div>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {ACTIVITIES.map((activity) => {
                const active = Boolean(todayRow[activity.key]);
                return (
                  <button
                    key={activity.key}
                    onClick={() => toggle(activity.key)}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-4 transition active:scale-95 ${
                      active
                        ? "border-amber bg-amber/15 text-amber-light"
                        : "border-white/10 bg-navy text-slate-400"
                    }`}
                  >
                    <span className="text-2xl">{activity.icon}</span>
                    <span className="text-sm font-semibold">{activity.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card space-y-2">
          <p className="section-title">Last 14 Days</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 14 }, (_, i) => addDays(today, -13 + i)).map((day) => {
              const row = history[day];
              const done = row ? qualifies(row) : false;
              return (
                <div
                  key={day}
                  title={day}
                  className={`h-7 w-7 rounded-md text-center text-[10px] leading-7 ${
                    done ? "bg-amber text-navy font-bold" : "bg-white/10 text-slate-500"
                  }`}
                >
                  {Number(day.slice(8, 10))}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
