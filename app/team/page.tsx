"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  User,
  Droplet,
  ScrollText,
  Lock,
  Link2,
  Check,
  Circle,
  Wrench,
  Play,
  FolderOpen,
  Rocket,
  Flame,
  CheckCircle2,
  X,
  Wallet,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import { supabase } from "@/lib/supabaseClient";
import { computeBudgetTotals } from "@/lib/budget";
import {
  isPrimaryUser,
  isGeminiGroupOwner,
  PIPELINE_STAGES,
  CANDIDATE_STEPS,
  ONBOARDING_SESSIONS,
  SESSION_4_CONTACT_MINIMUM,
  SESSION_4_READING_REQUIREMENT,
  GOAL_ITEMS_BY_PERIOD,
  GOAL_PERIODS,
  NOTIFICATION_KINDS,
  type PipelineStageKey,
} from "@/lib/constants";
import { periodEndExclusive } from "@/lib/periodAverages";
import { groupCallRatingsByType } from "@/lib/call-ratings";
import { buildSponsorshipChildren } from "@/lib/sponsorship-tree";
import { fireNotifyEvent } from "@/lib/notifyClient";
import SponsorshipTree from "@/components/SponsorshipTree";
import { SkeletonList, SkeletonRows } from "@/components/Skeleton";
import {
  getMonthStart,
  getMonthStartOffset,
  getWeekStartOffset,
  getDateOffset,
  formatMonthLabel,
  formatWeekRangeLabel,
  formatDateLabel,
} from "@/lib/dates";
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
  Goal,
  MonthlyPv,
  BudgetWorksheet,
} from "@/lib/types";

type ViewMode = "members" | "teams" | "my-tree" | "whole-tree" | "diagnostics";
type PeriodType = "daily" | "weekly" | "monthly";

type DiagnosticsData = {
  vapidConfigured: boolean;
  cronSecretConfigured: boolean;
  subscriptionCount: number;
  recentNotifications: { id: string; kind: string; title: string; created_at: string; recipient_count: number; user_id: string | null }[];
  pgCronJobs: { jobname: string; schedule: string; active: boolean }[];
  kindSummary: { kind: string; total_count: number; last_sent_at: string }[];
  errors: string[];
};

const CRON_ROUTES = [
  { path: "/api/push/send-reminders", label: "Core Run reminder" },
  { path: "/api/push/send-stat-leaders", label: "Stat leaders digest" },
  { path: "/api/push/send-calendar-reminders", label: "Calendar reminders" },
  { path: "/api/push/send-daily-nudges", label: "Mission/volume/goals nudges" },
  { path: "/api/push/send-engagement-filler", label: "Engagement filler (book/audio)" },
] as const;

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function qualifies(day: StreakDay): boolean {
  return (day.read && day.listen && day.daily_update && day.story_share) || day.off_day;
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
  // Fresh sum of this member's own Daily rows across whichever
  // Weekly/Monthly period is selected - lets the Pipeline card show real
  // numbers when a stored total doesn't match, instead of a vague
  // warning. Null while on the Daily tab (nothing to reconcile against).
  dailySumForPeriod: Record<PipelineStageKey, number> | null;
  candidates: Candidate[];
  contacts: Contact[];
  streakDays: StreakDay[];
  assistantMessages: AssistantMessage[];
  calendarEvents: CalendarEvent[];
  callRatings: CallRating[];
  goals: Goal[];
  monthlyPv: MonthlyPv | null;
  budgetWorksheet: BudgetWorksheet | null;
};

export default function TeamPage() {
  const { user } = useAuth();
  const isAdmin = isPrimaryUser(user.email);

  const [viewMode, setViewMode] = useState<ViewMode>("members");
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  // 0 = current day/week/month, 1 = one back, etc. - the three period
  // types' offsets aren't comparable, so switching the type resets this
  // back to current.
  const [periodOffset, setPeriodOffset] = useState(0);
  const periodStart =
    periodType === "daily"
      ? getDateOffset(periodOffset)
      : periodType === "weekly"
        ? getWeekStartOffset(periodOffset)
        : getMonthStartOffset(periodOffset);
  const periodLabel =
    periodType === "daily"
      ? formatDateLabel(periodStart)
      : periodType === "weekly"
        ? formatWeekRangeLabel(periodStart)
        : formatMonthLabel(periodStart);

  function switchPeriodType(type: PeriodType) {
    setPeriodType(type);
    setPeriodOffset(0);
  }

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [loadingMember, setLoadingMember] = useState(false);
  // A linked spouse's own sponsorship line needs folding into "My Tree"/
  // "My Upline" - unlike the Members list (a flat filter over whatever
  // profiles RLS already returns), those two are built by literally
  // walking upline_id starting from one specific account, so they'd
  // still miss a partner's downline/upline even after is_upline_of's
  // household-aware widening. household_id is only ever stored on the
  // "deferring" side, so there's no plain column read for "who's my
  // spouse" from the other direction - hence the RPC.
  const [partnerId, setPartnerId] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("get_household_partner_id").then(({ data }) => {
      setPartnerId((data as string | null) ?? null);
    });
  }, [user.id]);

  const [teamTotals, setTeamTotals] = useState<TeamTotals[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);

  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [lastRemovedEmail, setLastRemovedEmail] = useState<string | null>(null);

  const [grantingOnboarding, setGrantingOnboarding] = useState(false);
  const [grantError, setGrantError] = useState("");

  const [expandedRatingId, setExpandedRatingId] = useState<string | null>(null);

  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState("");

  const [moveError, setMoveError] = useState("");

  // Reassigning someone's line of sponsorship is admin-only and goes
  // through a dedicated RPC (not a plain profiles update) so it can
  // reject the one mistake that would actually corrupt the tree -
  // moving someone under their own downline, creating a loop -
  // server-side, not just hope the admin doesn't do it by accident.
  // Patches the already-loaded `profiles` list directly on success
  // rather than refetching everyone, since wholeTreeRoots/myTreeChildren
  // are both derived from it.
  async function moveUpline(userId: string, newUplineId: string | null) {
    setMoveError("");
    const { error } = await supabase.rpc("admin_set_upline", {
      p_user_id: userId,
      p_new_upline_id: newUplineId,
    });
    if (error) {
      setMoveError(error.message);
      return;
    }
    setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, upline_id: newUplineId } : p)));
  }
  const [runningCronPath, setRunningCronPath] = useState<string | null>(null);
  const [cronResults, setCronResults] = useState<Record<string, string>>({});

  async function authedFetch(input: string, init?: RequestInit) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Not signed in");
    return fetch(input, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
    });
  }

  async function loadDiagnostics() {
    setLoadingDiagnostics(true);
    setDiagnosticsError("");
    try {
      const res = await authedFetch("/api/admin/diagnostics");
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Failed to load");
      setDiagnostics(await res.json());
    } catch (err) {
      setDiagnosticsError(err instanceof Error ? err.message : "Failed to load diagnostics.");
    } finally {
      setLoadingDiagnostics(false);
    }
  }

  useEffect(() => {
    if (viewMode === "diagnostics" && isAdmin && !diagnostics) {
      loadDiagnostics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, isAdmin]);

  async function runCron(path: string) {
    setRunningCronPath(path);
    setCronResults((prev) => ({ ...prev, [path]: "" }));
    try {
      const res = await authedFetch("/api/admin/run-cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      setCronResults((prev) => ({ ...prev, [path]: JSON.stringify(data, null, 2) }));
      loadDiagnostics();
    } catch (err) {
      setCronResults((prev) => ({
        ...prev,
        [path]: err instanceof Error ? err.message : "Failed to run.",
      }));
    } finally {
      setRunningCronPath(null);
    }
  }

  // "My Downline" - everyone's own personal sponsorship tree, rooted at
  // themselves. For a non-admin, `profiles` already only contains self +
  // downline (RLS), so this is just a client-side re-shape of data
  // already fetched, no extra query needed. For an admin, `profiles` has
  // everyone, so this naturally narrows to just the admin's own chain.
  //
  // A linked spouse's downline is folded in too, since a recruit may
  // have entered either partner's account number - buildSponsorshipChildren
  // only nests strictly by literal upline_id, so a recruit sponsored
  // under your spouse's id would otherwise never appear rooted under
  // "you" even though profiles RLS now fetches that row either way.
  // Re-sorted after merging since each root's own top-level list was
  // already alphabetical on its own, not combined.
  const myTreeChildren = useMemo(() => {
    const mine = buildSponsorshipChildren(profiles, user.id);
    if (!partnerId) return mine;
    const theirs = buildSponsorshipChildren(profiles, partnerId);
    const seen = new Set(mine.map((n) => n.profile.id));
    const merged = [...mine, ...theirs.filter((n) => !seen.has(n.profile.id))];
    return merged.sort((a, b) => {
      const nameFor = (p: Profile) =>
        (p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.email).toLowerCase();
      return nameFor(a.profile).localeCompare(nameFor(b.profile));
    });
  }, [profiles, user.id, partnerId]);
  // "Whole Team" - the entire company's sponsorship forest, rooted at
  // whoever has no upline at all. Admin-only, since a non-admin's
  // `profiles` never contains anyone outside their own downline anyway.
  const wholeTreeRoots = useMemo(
    () => (isAdmin ? buildSponsorshipChildren(profiles, null) : []),
    [isAdmin, profiles]
  );
  // Every signed-up person as a searchable "move under…" option for the
  // Whole Team tree's admin-only Move control - built once here rather
  // than per-node so opening the picker on a big tree doesn't re-map all
  // 50+ profiles on every render.
  const uplineMoveOptions = useMemo(
    () =>
      profiles
        .map((p) => ({
          value: p.id,
          label: p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.email,
          sublabel: p.team ?? undefined,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [profiles]
  );
  // "My Upline" - the chain going up from your own sponsor to the top,
  // in sponsoring order (immediate sponsor first). The profiles select
  // policy now allows reading rows anywhere in your own upline chain
  // (not just your downline), so those rows are already present in
  // `profiles` once fetched - this just walks upline_id pointers using
  // what's already loaded, no extra query.
  //
  // Falls back to a linked spouse's own upline chain if this account has
  // none set - typically only one partner in a couple actually entered a
  // sponsor's account number, so without this, whichever partner didn't
  // would see "My Upline" as empty despite the couple sharing one real
  // sponsor line.
  function uplineChainFrom(rootId: string): Profile[] {
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const chain: Profile[] = [];
    const seen = new Set<string>([rootId]);
    let cursor = byId.get(rootId)?.upline_id ?? null;
    while (cursor && !seen.has(cursor)) {
      const p = byId.get(cursor);
      if (!p) break;
      chain.push(p);
      seen.add(p.id);
      cursor = p.upline_id ?? null;
    }
    return chain;
  }
  const myUplineChain = useMemo(() => {
    const mine = uplineChainFrom(user.id);
    if (mine.length > 0 || !partnerId) return mine;
    return uplineChainFrom(partnerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, user.id, partnerId]);
  // `profiles` (for a non-admin) now also includes rows from the upline
  // chain above, which is exactly what "My Upline" needs - but the
  // Members list is specifically "people I supervise," so it excludes
  // those same upline rows to avoid mixing "people above me" into a list
  // titled around downline/supervision. Admins are unaffected: they
  // already see everyone via is_app_admin(), independent of up/downline.
  const uplineIds = useMemo(() => new Set(myUplineChain.map((p) => p.id)), [myUplineChain]);
  const downlineProfiles = useMemo(
    () => (isAdmin ? profiles : profiles.filter((p) => !uplineIds.has(p.id))),
    [isAdmin, profiles, uplineIds]
  );

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
        { data: goals },
        { data: monthlyPv },
        { data: budgetWorksheet },
        dailyRowsForPeriodResult,
      ] = await Promise.all([
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_type", periodType)
          .eq("period_start", periodStart)
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
        supabase.from("goals").select("*").eq("user_id", selectedId),
        // PV/Ditto is always tracked by calendar month regardless of
        // which period-type tab (daily/weekly/monthly) is selected above
        // - same as the Volume page itself, which has no period-type
        // switcher at all.
        supabase
          .from("monthly_pv")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_start", getMonthStart())
          .maybeSingle(),
        // Household-scoped now too (via ownerId) - a linked couple
        // shares one budget, same as pipeline/candidates/contacts.
        supabase.from("budget_worksheets").select("*").eq("user_id", ownerId).maybeSingle(),
        // Only meaningful on the Weekly/Monthly tabs - reconciles the
        // stored total above against a fresh sum of this member's own
        // Daily rows for that same span, same purpose as the identical
        // check on the Pipeline Tracker page itself.
        periodType === "daily"
          ? Promise.resolve({ data: null })
          : supabase
              .from("pipeline_periods")
              .select("*")
              .eq("user_id", ownerId)
              .eq("period_type", "daily")
              .gte("period_start", periodStart)
              .lt("period_start", periodEndExclusive(periodType, periodStart)),
      ]);

      const dailyRowsForPeriod = (dailyRowsForPeriodResult.data as PipelinePeriod[] | null) ?? null;
      const dailySumForPeriod = dailyRowsForPeriod
        ? (Object.fromEntries(
            PIPELINE_STAGES.map((s) => [
              s.key,
              dailyRowsForPeriod.reduce((sum, row) => sum + (row[s.key] as number), 0),
            ])
          ) as Record<PipelineStageKey, number>)
        : null;

      if (!cancelled) {
        setMemberData({
          pipeline: (pipeline as PipelinePeriod) ?? null,
          dailySumForPeriod,
          candidates: (candidates as Candidate[]) ?? [],
          contacts: (contacts as Contact[]) ?? [],
          streakDays: (streakDays as StreakDay[]) ?? [],
          assistantMessages: (assistantMessages as AssistantMessage[]) ?? [],
          calendarEvents: (calendarEvents as CalendarEvent[]) ?? [],
          callRatings: (callRatings as CallRating[]) ?? [],
          goals: (goals as Goal[]) ?? [],
          monthlyPv: (monthlyPv as MonthlyPv) ?? null,
          budgetWorksheet: (budgetWorksheet as BudgetWorksheet) ?? null,
        });
        setLoadingMember(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedId, profiles, periodType, periodStart]);

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null;

  // Session 4 ("Sharing Your Story") shouldn't unlock until this person
  // has put real work into their A/B list (not the Customer list) and
  // confirmed they've done the assigned reading. Only relevant for the
  // 3 -> 4 transition; every other "Unlock Next" step is ungated.
  const networkContactCount =
    memberData?.contacts.filter((c) => c.category === "A" || c.category === "B").length ?? 0;
  const unlockingSession4 = (selectedProfile?.onboarding_unlocked_through ?? 1) === 3;
  const contactRequirementMet = networkContactCount >= SESSION_4_CONTACT_MINIMUM;
  const readingRequirementMet = Boolean(selectedProfile?.thinking_big_chapters_confirmed);
  const session4Gated = unlockingSession4 && (!contactRequirementMet || !readingRequirementMet);

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
    const previousSessionNumber = profiles.find((p) => p.id === selectedId)?.onboarding_unlocked_through ?? 1;
    const newSessionNumber = previousSessionNumber + 1;
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === selectedId
          ? { ...p, onboarding_unlocked_through: (p.onboarding_unlocked_through ?? 1) + 1 }
          : p
      )
    );
    fireNotifyEvent({
      kind: "onboarding_unlocked",
      targetUserId: selectedId,
      sessionNumber: newSessionNumber,
    });
    if (newSessionNumber >= ONBOARDING_SESSIONS.length && previousSessionNumber < ONBOARDING_SESSIONS.length) {
      fireNotifyEvent({ kind: "onboarding_completed", targetUserId: selectedId });
    }
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
    const previousSessionNumber = profiles.find((p) => p.id === selectedId)?.onboarding_unlocked_through ?? 1;
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === selectedId ? { ...p, onboarding_unlocked_through: ONBOARDING_SESSIONS.length } : p
      )
    );
    fireNotifyEvent({
      kind: "onboarding_unlocked",
      targetUserId: selectedId,
      sessionNumber: ONBOARDING_SESSIONS.length,
    });
    if (previousSessionNumber < ONBOARDING_SESSIONS.length) {
      fireNotifyEvent({ kind: "onboarding_completed", targetUserId: selectedId });
    }
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
    const removedEmail = selectedProfile?.email ?? null;
    const targetId = selectedId;
    // Storage objects (avatar photo, story photos) aren't rows the
    // account-deletion RPC's cascade can reach - clean those up first.
    // Best-effort: a failure here shouldn't block deleting the account
    // itself, it just means a photo stays orphaned same as before this
    // step existed.
    try {
      await authedFetch("/api/admin/delete-account-storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: targetId }),
      });
    } catch {
      // Best-effort, see comment above.
    }
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
    if (isGeminiGroupOwner(user.email)) {
      setLastRemovedEmail(removedEmail);
    }
  }

  // Cross-references the full NOTIFICATION_KINDS catalog against whatever
  // get_notification_kind_summary() actually returned, so a kind with zero
  // rows ever (never in the summary at all, since it's a group-by over
  // existing rows) shows up as "Never fired" instead of just being absent
  // from the list - the absence itself is the signal "Recent sends" alone
  // can't surface for a low-frequency kind.
  const kindStatus = useMemo(() => {
    const byKind = new Map((diagnostics?.kindSummary ?? []).map((k) => [k.kind, k]));
    return NOTIFICATION_KINDS.map((k) => {
      const summary = byKind.get(k.kind);
      return {
        kind: k.kind,
        label: k.label,
        totalCount: summary?.total_count ?? 0,
        lastSentAt: summary?.last_sent_at ?? null,
      };
    }).sort((a, b) => {
      if (!a.lastSentAt && !b.lastSentAt) return a.label.localeCompare(b.label);
      if (!a.lastSentAt) return -1;
      if (!b.lastSentAt) return 1;
      return a.lastSentAt.localeCompare(b.lastSentAt);
    });
  }, [diagnostics]);

  return (
    <FeatureGate minSession={5}>
      <PageHeader
        title="Team"
        subtitle={
          isAdmin
            ? `${profiles.length} member(s) signed up`
            : `${downlineProfiles.length} member(s) in your downline`
        }
      />
      <main className="page-main">
        {lastRemovedEmail && (
          <div className="card flex items-center justify-between gap-2 !border-amber/40">
            <p className="flex items-start gap-1 text-xs text-slate-300">
              <Link2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>
                Don&apos;t forget to remove <span className="font-semibold text-white">{lastRemovedEmail}</span>{" "}
                from the Gemini Assistant Google Group.
              </span>
            </p>
            <button className="pill shrink-0 inline-flex items-center gap-1" onClick={() => setLastRemovedEmail(null)}>
              <Check className="h-3 w-3" aria-hidden /> Done
            </button>
          </div>
        )}
        <div className="card flex flex-wrap gap-1 p-1">
          <button
            className={viewMode === "members" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setViewMode("members")}
          >
            Members
          </button>
          {isAdmin && (
            <button
              className={viewMode === "teams" ? "toggle-pill-active" : "toggle-pill-inactive"}
              onClick={() => setViewMode("teams")}
            >
              Teams
            </button>
          )}
          <button
            className={viewMode === "my-tree" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setViewMode("my-tree")}
          >
            My Tree
          </button>
          {isAdmin && (
            <button
              className={viewMode === "whole-tree" ? "toggle-pill-active" : "toggle-pill-inactive"}
              onClick={() => setViewMode("whole-tree")}
            >
              Whole Team
            </button>
          )}
          {isAdmin && (
            <button
              className={viewMode === "diagnostics" ? "toggle-pill-active" : "toggle-pill-inactive"}
              onClick={() => setViewMode("diagnostics")}
            >
              Diagnostics
            </button>
          )}
        </div>

        {viewMode === "teams" && isAdmin && (
          <>
            <div className="card flex p-1">
              <button
                className={periodType === "daily" ? "toggle-pill-active" : "toggle-pill-inactive"}
                onClick={() => switchPeriodType("daily")}
              >
                Daily
              </button>
              <button
                className={periodType === "weekly" ? "toggle-pill-active" : "toggle-pill-inactive"}
                onClick={() => switchPeriodType("weekly")}
              >
                Weekly
              </button>
              <button
                className={periodType === "monthly" ? "toggle-pill-active" : "toggle-pill-inactive"}
                onClick={() => switchPeriodType("monthly")}
              >
                Monthly
              </button>
            </div>

            <div className="card flex items-center justify-between gap-2 py-2">
              <button
                className="btn-icon !h-8 !w-8 text-base"
                onClick={() => setPeriodOffset((o) => o + 1)}
                aria-label={`Previous ${periodType === "daily" ? "day" : periodType === "weekly" ? "week" : "month"}`}
              >
                ‹
              </button>
              <p className="text-sm font-semibold text-white">
                {periodLabel}
                {periodOffset === 0 && (
                  <span className="ml-1.5 text-xs font-normal text-amber-light">(current)</span>
                )}
              </p>
              <button
                className="btn-icon !h-8 !w-8 text-base"
                onClick={() => setPeriodOffset((o) => Math.max(0, o - 1))}
                disabled={periodOffset === 0}
                aria-label={`Next ${periodType === "daily" ? "day" : periodType === "weekly" ? "week" : "month"}`}
              >
                ›
              </button>
            </div>

            {loadingTeams ? (
              <SkeletonRows rows={4} />
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

        {viewMode === "my-tree" && (
          <div className="card space-y-1.5">
            <p className="section-title">My Upline</p>
            <p className="text-xs text-slate-400">
              In line of sponsoring order — your sponsor first, then theirs, up to the top.
            </p>
            {myUplineChain.length === 0 ? (
              <p className="text-sm text-slate-400">
                No upline set yet — add your sponsor&apos;s account number on My Profile.
              </p>
            ) : (
              <div className="rounded-lg bg-navy p-2.5">
                {myUplineChain.map((p, i) => (
                  <Link
                    key={p.id}
                    href={`/profile/${p.id}`}
                    className="flex items-center gap-2 py-1 text-sm text-slate-200 active:opacity-70"
                  >
                    <span className="shrink-0 text-xs text-slate-500">{i + 1}.</span>
                    <span className="truncate">
                      {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.email}
                      {p.team && <span className="text-xs text-slate-500"> · {p.team}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode === "my-tree" && (
          <div className="card space-y-1.5">
            <p className="section-title">My Downline</p>
            <p className="text-xs text-slate-400">
              Everyone under you, nested by who they were sponsored by — tap a name to view their
              profile, tap ▾ to collapse a branch.
            </p>
            <div className="rounded-lg bg-navy p-2.5">
              <p className="pb-1 text-sm font-semibold text-amber-light">
                {user.email} <span className="text-xs font-normal text-slate-500">(you)</span>
              </p>
              <SponsorshipTree
                nodes={myTreeChildren}
                emptyLabel="No one in your downline yet — once someone signs up with your account number as their upline, they'll show up here."
              />
            </div>
          </div>
        )}

        {viewMode === "whole-tree" && isAdmin && (
          <div className="card space-y-1.5">
            <p className="section-title">Whole Team</p>
            <p className="text-xs text-slate-400">
              Every signed-up member, nested by line of sponsorship. Tap a name to view their
              profile, tap ▾ to collapse a branch, tap ✎ to move someone under a different upline.
            </p>
            {moveError && <p className="text-xs text-red-400">{moveError}</p>}
            <div className="rounded-lg bg-navy p-2.5">
              <SponsorshipTree
                nodes={wholeTreeRoots}
                emptyLabel="No one has signed up yet."
                adminMove={{ options: uplineMoveOptions, onMove: moveUpline }}
              />
            </div>
          </div>
        )}

        {viewMode === "diagnostics" && isAdmin && (
          <div className="space-y-3">
            <div className="card space-y-2">
              <p className="section-title flex items-center gap-1.5">
                <Wrench className="h-4 w-4" aria-hidden /> Delivery Config
              </p>
              <p className="text-xs text-slate-400">
                Every scheduled push depends on env vars that live only in the actual Vercel
                deployment (never read from .env.local) and, for calendar reminders, a one-time
                pg_cron job run once in the Supabase SQL editor — see the README for exact steps.
              </p>
              {loadingDiagnostics ? (
                <SkeletonRows rows={3} />
              ) : diagnosticsError ? (
                <p className="text-sm text-red-400">{diagnosticsError}</p>
              ) : diagnostics ? (
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between rounded-lg bg-navy px-3 py-2">
                    <span className="text-slate-200">VAPID keys configured</span>
                    <span
                      className={`inline-flex items-center gap-1 ${diagnostics.vapidConfigured ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {diagnostics.vapidConfigured ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Yes
                        </>
                      ) : (
                        <>
                          <X className="h-3.5 w-3.5" aria-hidden /> No — pushes fail for everyone
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-navy px-3 py-2">
                    <span className="text-slate-200">CRON_SECRET configured</span>
                    <span
                      className={`inline-flex items-center gap-1 ${diagnostics.cronSecretConfigured ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {diagnostics.cronSecretConfigured ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Yes
                        </>
                      ) : (
                        <>
                          <X className="h-3.5 w-3.5" aria-hidden /> No — every cron 401s
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-navy px-3 py-2">
                    <span className="text-slate-200">Devices subscribed to push</span>
                    <span className="text-slate-300">{diagnostics.subscriptionCount}</span>
                  </div>
                  <div className="rounded-lg bg-navy px-3 py-2">
                    <p className="mb-1 text-slate-200">Supabase pg_cron jobs</p>
                    {diagnostics.pgCronJobs.length === 0 ? (
                      <p className="text-xs text-red-400">
                        None found — if you&apos;re expecting calendar reminders, the one-time
                        cron.schedule(...) SQL from the README hasn&apos;t been run yet.
                      </p>
                    ) : (
                      diagnostics.pgCronJobs.map((job) => (
                        <p key={job.jobname} className="flex items-center gap-1.5 text-xs text-slate-400">
                          {job.active ? (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                          ) : (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-slate-500" aria-hidden />
                          )}
                          {job.jobname} — {job.schedule}
                        </p>
                      ))
                    )}
                  </div>
                  {diagnostics.errors.length > 0 && (
                    <div className="rounded-lg bg-red-500/10 px-3 py-2">
                      <p className="mb-1 text-xs font-semibold text-red-300">
                        Diagnostics itself hit an error fetching some of this:
                      </p>
                      {diagnostics.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-300">
                          {e}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="card space-y-2">
              <p className="section-title flex items-center gap-1.5">
                <Play className="h-4 w-4" aria-hidden /> Run a cron now
              </p>
              <p className="text-xs text-slate-400">
                Fires the route directly with the server&apos;s real CRON_SECRET, bypassing whatever
                is (or isn&apos;t) supposed to trigger it automatically — isolates &quot;does the route
                itself work&quot; from &quot;is the automatic trigger wired up.&quot;
              </p>
              {CRON_ROUTES.map((route) => (
                <div key={route.path} className="space-y-1 rounded-lg bg-navy px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-200">{route.label}</span>
                    <button
                      className="btn-secondary shrink-0 !px-3 !py-1 text-xs"
                      disabled={runningCronPath === route.path}
                      onClick={() => runCron(route.path)}
                    >
                      {runningCronPath === route.path ? "Running…" : "Run now"}
                    </button>
                  </div>
                  {cronResults[route.path] && (
                    <pre className="overflow-x-auto rounded bg-black/30 p-2 text-[11px] text-slate-300">
                      {cronResults[route.path]}
                    </pre>
                  )}
                </div>
              ))}
            </div>

            <div className="card space-y-1.5">
              <p className="section-title flex items-center gap-1.5">
                <FolderOpen className="h-4 w-4" aria-hidden /> Notification kinds — last fired
              </p>
              <p className="text-xs text-slate-400">
                Every kind this app can send, oldest/never-fired first. A kind sitting at
                &quot;Never fired&quot; despite conditions that should&apos;ve triggered it by now
                points at a real bug, not just low frequency — a genuinely rare kind (a new
                signup, a badge, a monthly digest) is expected to sit quiet for a while.
              </p>
              {loadingDiagnostics ? (
                <SkeletonRows rows={3} />
              ) : (
                kindStatus.map((k) => (
                  <div
                    key={k.kind}
                    className="flex items-center justify-between gap-2 rounded-lg bg-navy px-3 py-2 text-xs"
                  >
                    <span className="text-slate-200">{k.label}</span>
                    <span className={`shrink-0 ${k.lastSentAt ? "text-slate-500" : "text-red-400"}`}>
                      {k.lastSentAt
                        ? `${new Date(k.lastSentAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })} · ${k.totalCount} total`
                        : "Never fired"}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="card space-y-1.5">
              <p className="section-title flex items-center gap-1.5">
                <ScrollText className="h-4 w-4" aria-hidden /> Recent sends (all users)
              </p>
              {loadingDiagnostics ? (
                <SkeletonRows rows={3} />
              ) : diagnostics && diagnostics.recentNotifications.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Nothing has ever been logged to sent_notifications — nothing has successfully
                  sent yet.
                </p>
              ) : (
                diagnostics?.recentNotifications.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy px-3 py-2 text-xs">
                    <span className="truncate text-slate-200">{n.title}</span>
                    <span className="shrink-0 text-slate-500">
                      {new Date(n.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {" · "}
                      {n.recipient_count} sent
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {viewMode === "members" && (
          <div className="card space-y-1.5">
            <p className="section-title">Members</p>
            {loadingProfiles ? (
              <SkeletonRows rows={4} />
            ) : downlineProfiles.length === 0 ? (
              <p className="text-sm text-slate-400">No one has signed up yet.</p>
            ) : (
              downlineProfiles.map((p) => (
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
                <User className="h-3 w-3" aria-hidden /> View Profile
              </Link>
            </div>

            <div className="card flex p-1">
              <button
                className={periodType === "daily" ? "toggle-pill-active" : "toggle-pill-inactive"}
                onClick={() => switchPeriodType("daily")}
              >
                Daily
              </button>
              <button
                className={periodType === "weekly" ? "toggle-pill-active" : "toggle-pill-inactive"}
                onClick={() => switchPeriodType("weekly")}
              >
                Weekly
              </button>
              <button
                className={periodType === "monthly" ? "toggle-pill-active" : "toggle-pill-inactive"}
                onClick={() => switchPeriodType("monthly")}
              >
                Monthly
              </button>
            </div>

            <div className="card flex items-center justify-between gap-2 py-2">
              <button
                className="btn-icon !h-8 !w-8 text-base"
                onClick={() => setPeriodOffset((o) => o + 1)}
                aria-label={`Previous ${periodType === "daily" ? "day" : periodType === "weekly" ? "week" : "month"}`}
              >
                ‹
              </button>
              <p className="text-sm font-semibold text-white">
                {periodLabel}
                {periodOffset === 0 && (
                  <span className="ml-1.5 text-xs font-normal text-amber-light">(current)</span>
                )}
              </p>
              <button
                className="btn-icon !h-8 !w-8 text-base"
                onClick={() => setPeriodOffset((o) => Math.max(0, o - 1))}
                disabled={periodOffset === 0}
                aria-label={`Next ${periodType === "daily" ? "day" : periodType === "weekly" ? "week" : "month"}`}
              >
                ›
              </button>
            </div>

            {loadingMember || !memberData ? (
              <SkeletonList cards={3} />
            ) : (
              <>
                <div className="card space-y-2">
                  <p className="section-title">Pipeline</p>
                  <p className="text-xs text-slate-400">
                    {periodLabel} · Questions → Launches:{" "}
                    <span className="font-semibold text-amber-light">
                      {pct(memberData.pipeline?.launches ?? 0, memberData.pipeline?.questions ?? 0)}
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
                          {memberData.pipeline?.[stage.key] ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>
                  {!memberData.pipeline && (
                    <p className="text-xs text-slate-500">Nothing logged for this period.</p>
                  )}
                  {periodType !== "daily" &&
                    memberData.dailySumForPeriod &&
                    (() => {
                      const mismatched = PIPELINE_STAGES.filter(
                        (s) =>
                          (memberData.pipeline?.[s.key] ?? 0) !== memberData.dailySumForPeriod![s.key]
                      );
                      if (mismatched.length === 0) return null;
                      return (
                        <div className="space-y-1 rounded-lg border border-amber/30 bg-amber/5 p-2">
                          <p className="text-xs font-medium text-amber-light">
                            Daily entries for this period don&apos;t quite match what&apos;s shown above
                          </p>
                          <p className="text-xs text-slate-400">
                            {mismatched
                              .map(
                                (s) =>
                                  `${s.label}: Daily adds up to ${memberData.dailySumForPeriod![s.key]} (shown: ${
                                    memberData.pipeline?.[s.key] ?? 0
                                  })`
                              )
                              .join(" · ")}
                          </p>
                          <p className="text-xs text-slate-500">
                            Usually means a number was corrected directly on{" "}
                            {periodType === "weekly" ? "Weekly" : "Monthly"} instead of through Daily.
                          </p>
                        </div>
                      );
                    })()}
                </div>

                <div className="card space-y-1.5">
                  <p className="section-title">Volume — {formatMonthLabel(getMonthStart())}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex items-center justify-between rounded-lg bg-navy px-2 py-1.5 text-xs">
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Rocket className="h-3 w-3" aria-hidden /> PV
                      </span>
                      <span className="font-semibold text-white">{memberData.monthlyPv?.pv ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-navy px-2 py-1.5 text-xs">
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Droplet className="h-3 w-3" aria-hidden /> Day 1 Ditto
                      </span>
                      <span className="font-semibold text-white">
                        {memberData.monthlyPv?.day1_ditto_pv ?? 0}
                      </span>
                    </div>
                  </div>
                  {!memberData.monthlyPv && (
                    <p className="text-xs text-slate-500">Nothing logged this month.</p>
                  )}
                </div>

                <div className="card space-y-1.5">
                  <p className="section-title flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" aria-hidden />
                    Budget (Session 1 homework)
                  </p>
                  {memberData.budgetWorksheet ? (
                    <>
                      <p className="flex items-center gap-1 text-xs text-slate-500">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden />
                        Last updated {new Date(memberData.budgetWorksheet.updated_at).toLocaleDateString()}
                      </p>
                      {(() => {
                        const budgetTotals = computeBudgetTotals(memberData.budgetWorksheet);
                        return (
                          <div className="grid grid-cols-3 gap-1.5">
                            <div className="rounded-lg bg-navy px-2 py-1.5 text-xs">
                              <p className="text-slate-400">Income</p>
                              <p className="font-semibold text-white">
                                ${budgetTotals.income.toLocaleString()}
                              </p>
                            </div>
                            <div className="rounded-lg bg-navy px-2 py-1.5 text-xs">
                              <p className="text-slate-400">Expenses</p>
                              <p className="font-semibold text-white">
                                ${budgetTotals.totalMonthlyExpenses.toLocaleString()}
                              </p>
                            </div>
                            <div className="rounded-lg bg-navy px-2 py-1.5 text-xs">
                              <p className="text-slate-400">Net Cash Flow</p>
                              <p
                                className={`font-semibold ${
                                  budgetTotals.netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                ${budgetTotals.netCashFlow.toLocaleString()}
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">Not started yet.</p>
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
                  <p className="flex items-center gap-1 text-2xl font-bold text-amber">
                    <Flame className="h-6 w-6" aria-hidden /> {computeStreak(memberData.streakDays)}
                  </p>
                </div>

                <div className="card space-y-3">
                  <p className="section-title">Goals &amp; Dreams</p>
                  {GOAL_PERIODS.map((period) => {
                    const items = GOAL_ITEMS_BY_PERIOD[period.key].filter(
                      (item) =>
                        (memberData.goals.find((g) => g.metric === item.key && g.period === period.key)
                          ?.target ?? 0) > 0
                    );
                    if (items.length === 0) return null;
                    return (
                      <div key={period.key} className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          {period.label}
                        </p>
                        {items.map((item) => (
                          <div key={item.key} className="flex items-center justify-between text-sm">
                            <span className="text-slate-300">
                              {item.prefix} {item.suffix}
                            </span>
                            <span className="pill">
                              {memberData.goals.find((g) => g.metric === item.key && g.period === period.key)
                                ?.target ?? 0}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {memberData.goals.every((g) => g.target <= 0) && (
                    <p className="text-sm text-slate-400">No goals set yet.</p>
                  )}
                  {(selectedProfile?.dream_5_year ||
                    selectedProfile?.dream_10_year ||
                    selectedProfile?.dream_lifetime) && (
                    <div className="space-y-2 border-t border-white/5 pt-2">
                      {selectedProfile?.dream_5_year && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            5 Year Dream
                          </p>
                          <p className="whitespace-pre-wrap text-sm text-slate-300">
                            {selectedProfile.dream_5_year}
                          </p>
                        </div>
                      )}
                      {selectedProfile?.dream_10_year && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            10 Year Dream
                          </p>
                          <p className="whitespace-pre-wrap text-sm text-slate-300">
                            {selectedProfile.dream_10_year}
                          </p>
                        </div>
                      )}
                      {selectedProfile?.dream_lifetime && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Lifetime Dream
                          </p>
                          <p className="whitespace-pre-wrap text-sm text-slate-300">
                            {selectedProfile.dream_lifetime}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
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

                <div className="card space-y-3">
                  <p className="section-title">
                    Call Ratings ({memberData.callRatings.length})
                  </p>
                  {memberData.callRatings.length === 0 ? (
                    <p className="text-sm text-slate-400">No calls rated yet.</p>
                  ) : (
                    groupCallRatingsByType(memberData.callRatings).map((group) => (
                      <div key={group.type} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            {group.type} ({group.items.length})
                          </p>
                          {group.avgScore !== null && (
                            <span className="pill">avg {group.avgScore.toFixed(1)}/10</span>
                          )}
                        </div>
                        {group.items.map((r) => (
                          <div key={r.id} className="rounded-lg bg-navy p-2.5">
                            <button
                              className="flex w-full items-center justify-between gap-2 text-left"
                              onClick={() =>
                                setExpandedRatingId(expandedRatingId === r.id ? null : r.id)
                              }
                            >
                              <span className="truncate text-sm text-slate-200">
                                {r.candidate_name || "Untitled"}
                              </span>
                              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                                {r.overall_score !== null && (
                                  <span className="pill">{r.overall_score.toFixed(1)}/10</span>
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
                        ))}
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
                                ? "bg-amber text-ink"
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
                      <p className="section-title flex items-center gap-1.5">
                        <GraduationCap className="h-4 w-4" aria-hidden /> Classroom
                      </p>
                      <p className="text-xs text-slate-400">
                        {Math.min(
                          selectedProfile?.onboarding_unlocked_through ?? 1,
                          ONBOARDING_SESSIONS.length
                        )}
                        /{ONBOARDING_SESSIONS.length} sessions unlocked
                      </p>
                      {grantError && <p className="text-xs text-red-400">{grantError}</p>}
                      {unlockingSession4 && (
                        <div className="space-y-0.5">
                          <p
                            className={`flex items-start gap-1 text-xs ${contactRequirementMet ? "text-slate-500" : "text-amber-light"}`}
                          >
                            {contactRequirementMet ? (
                              <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                            ) : (
                              <Circle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                            )}
                            <span>
                              {SESSION_4_CONTACT_MINIMUM}+ names in the Contact Builder&apos;s A/B list — currently{" "}
                              {networkContactCount}/{SESSION_4_CONTACT_MINIMUM}.
                            </span>
                          </p>
                          <p
                            className={`flex items-start gap-1 text-xs ${readingRequirementMet ? "text-slate-500" : "text-amber-light"}`}
                          >
                            {readingRequirementMet ? (
                              <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                            ) : (
                              <Circle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                            )}
                            <span>
                              Read {SESSION_4_READING_REQUIREMENT} (self-reported on their Classroom page).
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary flex-1 whitespace-nowrap px-2 text-xs"
                        onClick={handleLockPreviousOnboarding}
                        disabled={
                          grantingOnboarding || (selectedProfile?.onboarding_unlocked_through ?? 1) <= 1
                        }
                      >
                        {grantingOnboarding ? (
                          "…"
                        ) : (
                          <>
                            <Lock className="h-3 w-3" aria-hidden /> Lock Previous
                          </>
                        )}
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
                          session4Gated ||
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
