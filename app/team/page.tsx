"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_EMAIL, PIPELINE_STAGES, CANDIDATE_STEPS } from "@/lib/constants";
import { formatDateLabel } from "@/lib/dates";
import type {
  Profile,
  PipelinePeriod,
  Candidate,
  Contact,
  StreakDay,
  RecognitionEntry,
  Goals,
  QuarterlyGoal,
} from "@/lib/types";

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function qualifies(day: StreakDay): boolean {
  return (
    [day.read, day.listen, day.daily_update, day.story_share].filter(Boolean).length >= 3
  );
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function computeStreak(days: StreakDay[]): number {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const today = new Date().toISOString().slice(0, 10);
  let cursor = today;
  if (!(byDay.get(cursor) && qualifies(byDay.get(cursor)!))) {
    cursor = addDays(cursor, -1);
  }
  let count = 0;
  while (byDay.get(cursor) && qualifies(byDay.get(cursor)!)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

type MemberData = {
  pipeline: PipelinePeriod | null;
  candidates: Candidate[];
  contacts: Contact[];
  streakDays: StreakDay[];
  recognition: RecognitionEntry[];
  goals: Goals | null;
  quarterlyGoals: QuarterlyGoal[];
};

export default function TeamPage() {
  const { user } = useAuth();
  const isAdmin = user.email === ADMIN_EMAIL;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [loadingMember, setLoadingMember] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    async function load() {
      setLoadingProfiles(true);
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });
      setProfiles((data as Profile[]) ?? []);
      setLoadingProfiles(false);
    }
    load();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !selectedId) return;
    let cancelled = false;

    async function load() {
      setLoadingMember(true);
      const [
        { data: pipeline },
        { data: candidates },
        { data: contacts },
        { data: streakDays },
        { data: recognition },
        { data: goals },
        { data: quarterlyGoals },
      ] = await Promise.all([
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", selectedId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("candidates")
          .select("*")
          .eq("user_id", selectedId)
          .order("created_at", { ascending: false }),
        supabase
          .from("contacts")
          .select("*")
          .eq("user_id", selectedId)
          .order("created_at", { ascending: false }),
        supabase
          .from("streak_days")
          .select("*")
          .eq("user_id", selectedId)
          .order("day", { ascending: false })
          .limit(30),
        supabase
          .from("recognition_log")
          .select("*")
          .eq("user_id", selectedId)
          .order("event_date", { ascending: false }),
        supabase.from("goals").select("*").eq("user_id", selectedId).maybeSingle(),
        supabase
          .from("quarterly_goals")
          .select("*")
          .eq("user_id", selectedId)
          .order("quarter", { ascending: false })
          .order("sort_order"),
      ]);

      if (!cancelled) {
        setMemberData({
          pipeline: (pipeline as PipelinePeriod) ?? null,
          candidates: (candidates as Candidate[]) ?? [],
          contacts: (contacts as Contact[]) ?? [],
          streakDays: (streakDays as StreakDay[]) ?? [],
          recognition: (recognition as RecognitionEntry[]) ?? [],
          goals: (goals as Goals) ?? null,
          quarterlyGoals: (quarterlyGoals as QuarterlyGoal[]) ?? [],
        });
        setLoadingMember(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, selectedId]);

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Team" />
        <main className="page-main">
          <div className="empty-state">You don&apos;t have access to this page.</div>
        </main>
      </>
    );
  }

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null;

  return (
    <>
      <PageHeader title="Team" subtitle={`${profiles.length} member(s) signed up`} />
      <main className="page-main">
        <div className="card space-y-1.5">
          <p className="section-title">Members</p>
          {loadingProfiles ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-slate-400">No one has signed up yet.</p>
          ) : (
            profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition ${
                  selectedId === p.id ? "bg-amber/15 text-amber-light" : "text-slate-200 active:bg-white/5"
                }`}
              >
                <span className="truncate">{p.email}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  joined {formatDateLabel(p.created_at.slice(0, 10))}
                </span>
              </button>
            ))
          )}
        </div>

        {selectedId && (
          <>
            <p className="px-1 text-xs text-slate-500">
              Showing data for <span className="text-slate-300">{selectedProfile?.email}</span>
            </p>

            {loadingMember || !memberData ? (
              <div className="empty-state">Loading member data…</div>
            ) : (
              <>
                <div className="card space-y-2">
                  <p className="section-title">Pipeline</p>
                  {memberData.pipeline ? (
                    <>
                      <p className="text-xs text-slate-400">
                        {memberData.pipeline.period_type === "weekly" ? "Week of" : "Month of"}{" "}
                        {formatDateLabel(memberData.pipeline.period_start)} · Questions → Launches:{" "}
                        <span className="font-semibold text-amber-light">
                          {pct(memberData.pipeline.launches, memberData.pipeline.questions)}
                        </span>
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {PIPELINE_STAGES.map((stage) => (
                          <div
                            key={stage.key}
                            className="flex items-center justify-between rounded-lg bg-navy px-2 py-1.5 text-xs"
                          >
                            <span className="text-slate-400">{stage.label}</span>
                            <span className="font-semibold text-white">
                              {memberData.pipeline![stage.key]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">No pipeline activity yet.</p>
                  )}
                </div>

                <div className="card space-y-1.5">
                  <p className="section-title">Candidates ({memberData.candidates.length})</p>
                  {memberData.candidates.length === 0 ? (
                    <p className="text-sm text-slate-400">No candidates yet.</p>
                  ) : (
                    memberData.candidates.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">{c.name}</span>
                        <span className="pill">
                          {c.launched
                            ? "Launched"
                            : c.filtered_out
                              ? "Filtered Out"
                              : CANDIDATE_STEPS[c.current_step].label}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="card space-y-1.5">
                  <p className="section-title">Contacts ({memberData.contacts.length})</p>
                  {memberData.contacts.length === 0 ? (
                    <p className="text-sm text-slate-400">No contacts yet.</p>
                  ) : (
                    memberData.contacts.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">
                          {c.name} <span className="text-slate-500">({c.category})</span>
                        </span>
                        <span className="pill">{c.status}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="card flex items-center justify-between">
                  <p className="section-title">Core Run Streak</p>
                  <p className="text-2xl font-bold text-amber">
                    🔥 {computeStreak(memberData.streakDays)}
                  </p>
                </div>

                <div className="card space-y-1.5">
                  <p className="section-title">Recognition ({memberData.recognition.length})</p>
                  {memberData.recognition.length === 0 ? (
                    <p className="text-sm text-slate-400">No wins logged yet.</p>
                  ) : (
                    memberData.recognition.map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">{r.name}</span>
                        <span className="pill-amber">{r.type}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="card space-y-2">
                  <p className="section-title">Goals</p>
                  <p className="text-sm text-slate-300">
                    {memberData.goals?.vision || (
                      <span className="text-slate-500">No 10-year vision written yet.</span>
                    )}
                  </p>
                  {memberData.quarterlyGoals.length > 0 && (
                    <div className="space-y-1 border-t border-white/10 pt-2">
                      {memberData.quarterlyGoals.map((g) => (
                        <div key={g.id} className="flex items-center gap-2 text-sm">
                          <span
                            className={g.completed ? "text-slate-500 line-through" : "text-slate-200"}
                          >
                            {g.text}
                          </span>
                          <span className="pill shrink-0">{g.quarter}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
