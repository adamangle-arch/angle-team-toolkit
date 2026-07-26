"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryUser, PIPELINE_STAGES, CANDIDATE_STEPS, ONBOARDING_SESSIONS } from "@/lib/constants";
import { getMonthStart, getWeekStart, formatDateLabel } from "@/lib/dates";
import type {
  Profile,
  PipelinePeriod,
  Candidate,
  Contact,
  StreakDay,
  TeamTotals,
  AssistantMessage,
  CalendarEvent,
  CallRating,
} from "@/lib/types";

type ViewMode = "members" | "teams";
type PeriodType = "weekly" | "monthly";

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function qualifies(day: StreakDay): boolean {
  return day.read && day.listen && day.daily_update && day.story_share;
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
  assistantMessages: AssistantMessage[];
  calendarEvents: CalendarEvent[];
  callRatings: CallRating[];
};

export default function TeamPage() {
  const { user } = useAuth();
  const isAdmin = isPrimaryUser(user.email);

  const [viewMode, setViewMode] = useState<ViewMode>("members");
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const periodStart = periodType === "weekly" ? getWeekStart() : getMonthStart();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [loadingMember, setLoadingMember] = useState(false);

  const [teamTotals, setTeamTotals] = useState<TeamTotals[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);

  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [grantingOnboarding, setGrantingOnboarding] = useState(false);
  const [grantError, setGrantError] = useState("");

  const [expandedRatingId, setExpandedRatingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoadingProfiles(true);
      // RLS scopes this automatically: admins get everyone, everyone
      // else gets their own row plus anyone in their downline.
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });
      setProfiles((data as Profile[]) ?? []);
      setLoadingProfiles(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!isAdmin || viewMode !== "teams") return;
    let cancelled = false;

    async function load() {
      setLoadingTeams(true);
      const { data } = await supabase.rpc("get_team_pipeline_totals", {
        p_period_type: periodType,
        p_period_start: periodStart,
      });
      if (!cancelled) {
        const sorted = ((data as TeamTotals[]) ?? []).slice().sort((a, b) => b.qi1 - a.qi1);
        setTeamTotals(sorted);
        setLoadingTeams(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, viewMode, periodType, periodStart]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    // Pipeline/candidates/contacts are household-shareable — if this
    // person has linked to a spouse, their real rows live under the
    // spouse's id. Core Run Streak and Assistant chat stay individual
    // regardless, so those always use the selected person's own id.
    const selected = profiles.find((p) => p.id === selectedId);
    const ownerId = selected?.household_id ?? selectedId;

    async function load() {
      setLoadingMember(true);
      const [
        { data: pipeline },
        { data: candidates },
        { data: contacts },
        { data: streakDays },
        { data: assistantMessages },
        { data: calendarEvents },
        { data: callRatings },
      ] = await Promise.all([
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("candidates")
          .select("*")
          .eq("user_id", ownerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("contacts")
          .select("*")
          .eq("user_id", ownerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("streak_days")
          .select("*")
          .eq("user_id", selectedId)
          .order("day", { ascending: false })
          .limit(30),
        supabase
          .from("assistant_messages")
          .select("*")
          .eq("user_id", selectedId)
          .order("created_at", { ascending: true }),
        supabase
          .from("calendar_events")
          .select("*")
          .eq("user_id", selectedId)
          .gte("event_at", new Date().toISOString())
          .order("event_at", { ascending: true }),
        supabase
          .from("call_ratings")
          .select("*")
          .eq("user_id", selectedId)
          .order("created_at", { ascending: false }),
      ]);

      if (!cancelled) {
        setMemberData({
          pipeline: (pipeline as PipelinePeriod) ?? null,
          candidates: (candidates as Candidate[]) ?? [],
          contacts: (contacts as Contact[]) ?? [],
          streakDays: (streakDays as StreakDay[]) ?? [],
          assistantMessages: (assistantMessages as AssistantMessage[]) ?? [],
          calendarEvents: (calendarEvents as CalendarEvent[]) ?? [],
          callRatings: (callRatings as CallRating[]) ?? [],
        });
        setLoadingMember(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedId, profiles]);

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null;

  // Reset the delete-confirmation fields whenever the selected member
  // changes, adjusted during render rather than in an effect.
  const [syncedSelectedId, setSyncedSelectedId] = useState<string | null>(selectedId);
  if (syncedSelectedId !== selectedId) {
    setSyncedSelectedId(selectedId);
    setConfirmEmail("");
    setDeleteError("");
  }

  async function handleGrantOnboarding() {
    if (!selectedId) return;
    setGrantingOnboarding(true);
    setGrantError("");
    const { error } = await supabase.rpc("grant_next_onboarding_session", {
      p_user_id: selectedId,
    });
    if (error) {
      setGrantError(error.message);
      setGrantingOnboarding(false);
      return;
    }
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === selectedId
          ? { ...p, onboarding_unlocked_through: (p.onboarding_unlocked_through ?? 1) + 1 }
          : p
      )
    );
    setGrantingOnboarding(false);
  }

  // For someone who isn't actually new - skips straight to fully
  // unlocked instead of tapping "Unlock Next" through every session.
  async function handleGrantAllOnboarding() {
    if (!selectedId) return;
    setGrantingOnboarding(true);
    setGrantError("");
    const { error } = await supabase.rpc("grant_all_onboarding_sessions", {
      p_user_id: selectedId,
    });
    if (error) {
      setGrantError(error.message);
      setGrantingOnboarding(false);
      return;
    }
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === selectedId ? { ...p, onboarding_unlocked_through: ONBOARDING_SESSIONS.length } : p
      )
    );
    setGrantingOnboarding(false);
  }

  // Changed your mind about an unlock? Walks back down a session
  // (floored at 1 - Session 1 is always available from signup).
  async function handleLockPreviousOnboarding() {
    if (!selectedId) return;
    setGrantingOnboarding(true);
    setGrantError("");
    const { error } = await supabase.rpc("lock_previous_onboarding_session", {
      p_user_id: selectedId,
    });
    if (error) {
      setGrantError(error.message);
      setGrantingOnboarding(false);
      return;
    }
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === selectedId
          ? { ...p, onboarding_unlocked_through: Math.max(1, (p.onboarding_unlocked_through ?? 1) - 1) }
          : p
      )
    );
    setGrantingOnboarding(false);
  }

  async function handleDelete() {
    if (!selectedId) return;
    setDeleting(true);
    setDeleteError("");
    const { error } = await supabase.rpc("delete_downline_account", {
      p_user_id: selectedId,
    });
    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
      return;
    }
    setProfiles((prev) => prev.filter((p) => p.id !== selectedId));
    setSelectedId(null);
    setMemberData(null);
    setDeleting(false);
  }

  return (
    <FeatureGate minSession={5}>
      <PageHeader
        title="Team"
        subtitle={
          isAdmin
            ? `${profiles.length} member(s) signed up`
            : `${profiles.length} member(s) in your downline`
        }
      />
      <main className="page-main">
        {isAdmin && (
          <div className="card flex p-1">
            <button
              className={viewMode === "members" ? "toggle-pill-active" : "toggle-pill-inactive"}
              onClick={() => setViewMode("members")}
            >
              Members
            </button>
            <button
              className={viewMode === "teams" ? "toggle-pill-active" : "toggle-pill-inactive"}
              onClick={() => setViewMode("teams")}
            >
              Teams
            </button>
          </div>
        )}

        {viewMode === "teams" && isAdmin && (
          <>
            <div className="card flex p-1">
              <button
                className={periodType === "weekly" ? "toggle-pill-active" : "toggle-pill-inactive"}
                onClick={() => setPeriodType("weekly")}
              >
                Weekly
              </button>
              <button
                className={periodType === "monthly" ? "toggle-pill-active" : "toggle-pill-inactive"}
                onClick={() => setPeriodType("monthly")}
              >
                Monthly
              </button>
            </div>

            {loadingTeams ? (
              <div className="empty-state">Loading teams…</div>
            ) : teamTotals.length === 0 ? (
              <div className="empty-state">No one has a team set yet.</div>
            ) : (
              teamTotals.map((t) => (
                <div key={t.team} className="card space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="section-title">{t.team}</p>
                    <span className="text-xs text-slate-500">{t.member_count} member(s)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PIPELINE_STAGES.map((stage) => (
                      <div
                        key={stage.key}
                        className="flex items-center justify-between rounded-lg bg-navy px-2 py-1.5 text-xs"
                      >
                        <span className="text-slate-400">{stage.label}</span>
                        <span className="font-semibold text-white">{t[stage.key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {viewMode === "members" && (
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
                  <span className="truncate">
                    {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.email}
                    {p.team && <span className="text-xs text-slate-500"> · {p.team}</span>}
                    {p.household_id && (
                      <span className="text-xs text-slate-500"> · shared w/ spouse</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right text-xs text-slate-500">
                    {isAdmin && p.account_number && <>#{p.account_number} · </>}
                    joined {formatDateLabel(p.created_at.slice(0, 10))}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {viewMode === "members" && selectedId && (
          <>
            <div className="card flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Showing data for <span className="text-slate-300">{selectedProfile?.email}</span>
                {isAdmin && selectedProfile?.account_number && (
                  <>
                    {" "}
                    · Account #: <span className="text-slate-300">{selectedProfile.account_number}</span>
                  </>
                )}
              </p>
              <Link href={`/profile/${selectedId}`} className="btn-secondary shrink-0 px-3 text-xs">
                👤 View Profile
              </Link>
            </div>

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

                <div className="card space-y-2">
                  <p className="section-title">
                    Upcoming Calendar ({memberData.calendarEvents.length})
                  </p>
                  {memberData.calendarEvents.length === 0 ? (
                    <p className="text-sm text-slate-400">No upcoming events.</p>
                  ) : (
                    memberData.calendarEvents.map((e) => (
                      <div key={e.id} className="rounded-lg bg-navy p-2">
                        <p className="text-sm font-medium text-white">{e.title}</p>
                        <p className="text-xs text-amber-light">
                          {new Date(e.event_at).toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                        {e.notes && <p className="text-xs text-slate-400">{e.notes}</p>}
                      </div>
                    ))
                  )}
                </div>

                <div className="card space-y-1.5">
                  <p className="section-title">
                    QI1 Call Ratings ({memberData.callRatings.length})
                  </p>
                  {memberData.callRatings.length === 0 ? (
                    <p className="text-sm text-slate-400">No calls rated yet.</p>
                  ) : (
                    memberData.callRatings.map((r) => (
                      <div key={r.id} className="rounded-lg bg-navy p-2.5">
                        <button
                          className="flex w-full items-center justify-between gap-2 text-left"
                          onClick={() =>
                            setExpandedRatingId(expandedRatingId === r.id ? null : r.id)
                          }
                        >
                          <span className="truncate text-sm text-slate-200">
                            {r.call_type}
                            {r.candidate_name ? ` · ${r.candidate_name}` : ""}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                            {r.overall_score !== null && (
                              <span className="pill">{r.overall_score}/10</span>
                            )}
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </button>
                        {expandedRatingId === r.id && (
                          <p className="mt-2 whitespace-pre-wrap text-xs text-slate-300">
                            {r.analysis}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="card space-y-2">
                  <p className="section-title">
                    Assistant Conversations ({memberData.assistantMessages.length})
                  </p>
                  {memberData.assistantMessages.length === 0 ? (
                    <p className="text-sm text-slate-400">No Assistant conversations yet.</p>
                  ) : (
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {memberData.assistantMessages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs ${
                              m.role === "user"
                                ? "bg-amber text-navy"
                                : "bg-navy text-slate-200"
                            }`}
                          >
                            {m.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedId !== user.id && (
                  <div className="card space-y-2">
                    <div>
                      <p className="section-title">🎓 Onboarding</p>
                      <p className="text-xs text-slate-400">
                        {Math.min(
                          selectedProfile?.onboarding_unlocked_through ?? 1,
                          ONBOARDING_SESSIONS.length
                        )}
                        /{ONBOARDING_SESSIONS.length} sessions unlocked
                      </p>
                      {grantError && <p className="text-xs text-red-400">{grantError}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary flex-1 whitespace-nowrap px-2 text-xs"
                        onClick={handleLockPreviousOnboarding}
                        disabled={
                          grantingOnboarding || (selectedProfile?.onboarding_unlocked_through ?? 1) <= 1
                        }
                      >
                        {grantingOnboarding ? "…" : "🔒 Lock Previous"}
                      </button>
                      <button
                        className="btn-secondary flex-1 whitespace-nowrap px-2 text-xs"
                        onClick={handleGrantAllOnboarding}
                        disabled={
                          grantingOnboarding ||
                          (selectedProfile?.onboarding_unlocked_through ?? 1) >=
                            ONBOARDING_SESSIONS.length
                        }
                      >
                        {grantingOnboarding ? "…" : "Unlock All"}
                      </button>
                      <button
                        className="btn-primary flex-1 whitespace-nowrap px-2 text-xs"
                        onClick={handleGrantOnboarding}
                        disabled={
                          grantingOnboarding ||
                          (selectedProfile?.onboarding_unlocked_through ?? 1) >=
                            ONBOARDING_SESSIONS.length
                        }
                      >
                        {grantingOnboarding ? "…" : "Unlock Next"}
                      </button>
                    </div>
                  </div>
                )}

                {selectedId !== user.id && (
                  <div className="card space-y-2 !border-red-500/40">
                    <p className="section-title text-red-400">Danger Zone</p>
                    <p className="text-xs text-slate-400">
                      Permanently deletes this person&apos;s account and all of their data
                      (pipeline, candidates, contacts, Core Run Streak, PV, sales, Assistant
                      history). This cannot be undone. Only use this if they&apos;ve left the
                      business.
                    </p>
                    <p className="text-xs text-slate-400">
                      Type <span className="font-semibold text-slate-200">{selectedProfile?.email}</span>{" "}
                      to confirm.
                    </p>
                    <input
                      className="input"
                      placeholder="Confirm email"
                      value={confirmEmail}
                      onChange={(e) => setConfirmEmail(e.target.value)}
                    />
                    {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
                    <button
                      className="btn-danger w-full"
                      disabled={confirmEmail !== selectedProfile?.email || deleting}
                      onClick={handleDelete}
                    >
                      {deleting ? "Deleting…" : "Permanently Delete Account"}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </FeatureGate>
  );
}
