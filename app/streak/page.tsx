"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import NotificationOptIn from "@/components/NotificationOptIn";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { getToday, getWeekStart, getMonthStart, formatDateLabel } from "@/lib/dates";
import { PIPELINE_STAGES } from "@/lib/constants";
import type { StreakDay, PipelinePeriod, MonthlyPv } from "@/lib/types";

function qualifies(day: StreakDay): boolean {
  return day.read && day.listen && day.daily_update && day.story_share;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function emptyDay(userId: string, day: string): StreakDay {
  return {
    id: "",
    user_id: userId,
    day,
    read: false,
    listen: false,
    daily_update: false,
    story_share: false,
    read_what: "",
    read_amount: "",
    listen_what: "",
    listen_count: 0,
    story_shares: 0,
    questions: 0,
    yeses: 0,
    meetings: 0,
  };
}

function withDerived(row: StreakDay): StreakDay {
  return {
    ...row,
    read: row.read_amount.trim() !== "",
    listen: row.listen_count > 0,
    story_share: row.story_shares > 0,
  };
}

function Counter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-navy px-2 py-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <button
          className="btn-icon !h-6 !w-6 text-xs"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <span className="w-5 text-center text-sm font-bold text-white">{value}</span>
        <button
          className="btn-icon !h-6 !w-6 text-xs"
          onClick={() => onChange(value + 1)}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function StreakPage() {
  const { user, ownerId } = useAuth();
  const [history, setHistory] = useState<Record<string, StreakDay>>({});
  const [loading, setLoading] = useState(true);
  const today = getToday();

  const [readWhat, setReadWhat] = useState("");
  const [readAmount, setReadAmount] = useState("");
  const [listenWhat, setListenWhat] = useState("");

  const [weekly, setWeekly] = useState<PipelinePeriod | null>(null);
  const [monthly, setMonthly] = useState<PipelinePeriod | null>(null);
  const [pv, setPv] = useState<MonthlyPv | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const since = addDays(today, -120);
      const { data } = await supabase
        .from("streak_days")
        .select("*")
        .eq("user_id", user.id)
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
  }, [user.id]);

  const todayRow: StreakDay = history[today] ?? emptyDay(user.id, today);

  // Adjust local input state during render (React's recommended pattern)
  // instead of in an effect, so it stays in sync whenever a fresh
  // todayRow loads without triggering an extra render pass.
  const [syncedId, setSyncedId] = useState(todayRow.id);
  if (syncedId !== todayRow.id) {
    setSyncedId(todayRow.id);
    setReadWhat(todayRow.read_what);
    setReadAmount(todayRow.read_amount);
    setListenWhat(todayRow.listen_what);
  }

  useEffect(() => {
    async function load() {
      const weekStart = getWeekStart();
      const monthStart = getMonthStart();
      const [{ data: w }, { data: m }, { data: p }] = await Promise.all([
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "weekly")
          .eq("period_start", weekStart)
          .maybeSingle(),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", "monthly")
          .eq("period_start", monthStart)
          .maybeSingle(),
        supabase
          .from("monthly_pv")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_start", monthStart)
          .maybeSingle(),
      ]);
      setWeekly((w as PipelinePeriod) ?? null);
      setMonthly((m as PipelinePeriod) ?? null);
      setPv((p as MonthlyPv) ?? null);
    }
    load();
  }, [ownerId]);

  async function saveToday(patch: Partial<StreakDay>) {
    const merged = withDerived({ ...todayRow, ...patch });
    setHistory((prev) => ({ ...prev, [today]: merged }));
    const { data } = await supabase
      .from("streak_days")
      .upsert(
        {
          user_id: user.id,
          day: today,
          read: merged.read,
          listen: merged.listen,
          daily_update: merged.daily_update,
          story_share: merged.story_share,
          read_what: merged.read_what,
          read_amount: merged.read_amount,
          listen_what: merged.listen_what,
          listen_count: merged.listen_count,
          story_shares: merged.story_shares,
          questions: merged.questions,
          yeses: merged.yeses,
          meetings: merged.meetings,
        },
        { onConflict: "user_id,day" }
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
  const doneCount = [todayRow.read, todayRow.listen, todayRow.daily_update, todayRow.story_share].filter(
    Boolean
  ).length;

  const summaryText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`📋 Daily Update — ${formatDateLabel(today)}`);
    lines.push("");
    lines.push("Today:");
    lines.push(`📖 Read: ${todayRow.read_what || "—"}${todayRow.read_amount ? ` — ${todayRow.read_amount}` : ""}`);
    lines.push(
      `🎧 Listened: ${todayRow.listen_what || "—"}${todayRow.listen_count ? ` — ${todayRow.listen_count} audio(s)` : ""}`
    );
    lines.push(`📝 Daily Update: ${todayRow.daily_update ? "Done" : "Not yet"}`);
    lines.push(
      `💬 Story Shares: ${todayRow.story_shares} | Questions: ${todayRow.questions} | Yeses: ${todayRow.yeses} | Meetings: ${todayRow.meetings}`
    );
    lines.push(`🔥 Current Streak: ${streak} day(s)`);
    lines.push("");
    lines.push("This Week:");
    lines.push(
      weekly
        ? PIPELINE_STAGES.map((s) => `${s.label}: ${weekly[s.key]}`).join(" | ")
        : "No pipeline activity logged yet."
    );
    lines.push("");
    lines.push("This Month:");
    lines.push(
      monthly
        ? PIPELINE_STAGES.map((s) => `${s.label}: ${monthly[s.key]}`).join(" | ")
        : "No pipeline activity logged yet."
    );
    lines.push("");
    lines.push(`💰 Current PV: ${pv?.pv ?? 0}`);
    return lines.join("\n");
  }, [today, todayRow, streak, weekly, monthly, pv]);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Core Run Streak"
        subtitle="Read • Listen • Daily Update • Story Share"
      />
      <main className="page-main">
        <NotificationOptIn />

        <div className="card flex items-center justify-between">
          <div>
            <p className="section-title">Current Streak</p>
            <p className="text-xs text-slate-400">All 4 done counts as a streak day</p>
          </div>
          <p className="text-3xl font-bold text-amber">🔥 {streak}</p>
        </div>

        <div className="card flex items-center justify-between">
          <p className="section-title">Today</p>
          <span className={todayQualifies ? "pill-amber" : "pill"}>{doneCount}/4 done</span>
        </div>

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <>
            <div className="card space-y-2">
              <p className="section-title">📖 Read</p>
              <input
                className="input"
                placeholder="What are you reading?"
                value={readWhat}
                onChange={(e) => setReadWhat(e.target.value)}
                onBlur={() => {
                  if (readWhat !== todayRow.read_what) saveToday({ read_what: readWhat });
                }}
              />
              <input
                className="input"
                placeholder="How much today? (e.g. 20 pages)"
                value={readAmount}
                onChange={(e) => setReadAmount(e.target.value)}
                onBlur={() => {
                  if (readAmount !== todayRow.read_amount) saveToday({ read_amount: readAmount });
                }}
              />
            </div>

            <div className="card space-y-2">
              <p className="section-title">🎧 Listen</p>
              <input
                className="input"
                placeholder="What audio(s)?"
                value={listenWhat}
                onChange={(e) => setListenWhat(e.target.value)}
                onBlur={() => {
                  if (listenWhat !== todayRow.listen_what) saveToday({ listen_what: listenWhat });
                }}
              />
              <Counter
                label="How many audios?"
                value={todayRow.listen_count}
                onChange={(next) => saveToday({ listen_count: next })}
              />
            </div>

            <button
              onClick={() => saveToday({ daily_update: !todayRow.daily_update })}
              className={`card flex items-center justify-between transition active:scale-95 ${
                todayRow.daily_update ? "!border-amber" : ""
              }`}
            >
              <span className="section-title">📝 Daily Update</span>
              <span className={todayRow.daily_update ? "pill-amber" : "pill"}>
                {todayRow.daily_update ? "Done" : "Not yet"}
              </span>
            </button>

            <div className="card space-y-1.5">
              <p className="section-title">Today&apos;s Activity</p>
              <Counter
                label="Story Shares"
                value={todayRow.story_shares}
                onChange={(next) => saveToday({ story_shares: next })}
              />
              <Counter
                label="Questions"
                value={todayRow.questions}
                onChange={(next) => saveToday({ questions: next })}
              />
              <Counter
                label="Yeses"
                value={todayRow.yeses}
                onChange={(next) => saveToday({ yeses: next })}
              />
              <Counter
                label="Meetings"
                value={todayRow.meetings}
                onChange={(next) => saveToday({ meetings: next })}
              />
            </div>
          </>
        )}

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

        <div className="card space-y-2">
          <p className="section-title">Daily Update Summary</p>
          <p className="text-xs text-slate-400">
            Copy/paste this into your LTD daily update to your upline.
          </p>
          <textarea
            readOnly
            className="textarea min-h-[220px] font-mono text-xs"
            value={summaryText}
          />
          <button className="btn-primary w-full" onClick={copySummary}>
            {copied ? "Copied!" : "Copy Daily Update"}
          </button>
        </div>
      </main>
    </>
  );
}
