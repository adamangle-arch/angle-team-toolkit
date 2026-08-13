"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import TrendChart from "@/components/TrendChart";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import LibraryResourcePicker from "@/components/LibraryResourcePicker";
import SearchablePicker from "@/components/SearchablePicker";
import FirstVisitTip from "@/components/FirstVisitTip";
import { SkeletonList, SkeletonRows } from "@/components/Skeleton";
import AverageLeaders from "@/components/AverageLeaders";
import Fab from "@/components/Fab";
import { supabase } from "@/lib/supabaseClient";
import {
  PIPELINE_STAGES,
  CANDIDATE_STEPS,
  ACTIVE_PIPELINE_MIN_STEP,
  STALE_CANDIDATE_DAYS,
  VIRTUAL_WEBINAR_SLOTS,
  US_TIMEZONES,
  CALENDAR_DURATION_OPTIONS,
  effectiveResourcesForStep,
  isGeminiGroupOwner,
  type CandidateResourceOverrideEntry,
  type PipelineStageKey,
} from "@/lib/constants";
import { guessTimeZone, zonedInputToUtc } from "@/lib/timezones";
import {
  getMonthStartOffset,
  isoDaysAgo,
  formatDateLabel,
  formatMonthLabel,
  formatWeekRangeLabel,
  formatShortDateLabel,
  formatShortMonthLabel,
  nextWebinarOccurrence,
  formatWebinarTime,
} from "@/lib/dates";
import { fireNotifyEvent } from "@/lib/notifyClient";
import {
  periodStartFor,
  averagesForPeriods,
  AVERAGES_WINDOW,
  AVERAGE_METRICS,
  type PeriodType,
} from "@/lib/periodAverages";
import type {
  PipelinePeriod,
  Candidate,
  CandidateSpecificResource,
  CandidateQuestion,
  MemberResource,
  OptionalResource,
  Profile,
  AverageLeaderEntry,
} from "@/lib/types";

type DownlineOption = { id: string; ownerId: string; name: string; accountNumber: string | null };

function periodLabelFor(periodType: PeriodType, periodStart: string): string {
  if (periodType === "daily") return formatDateLabel(periodStart);
  if (periodType === "weekly") return formatWeekRangeLabel(periodStart);
  return formatMonthLabel(periodStart);
}

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

// A device with a wrong clock/timezone can compute an invalid "current
// week/month" date (e.g. a Sunday instead of Monday) - pipeline_periods_
// weekly_monday_check / _monthly_first_check (schema.sql) now reject that
// outright rather than silently creating an orphaned row nobody could
// ever see again. Translate that specific failure into something
// actionable instead of a raw DB error.
function friendlyPeriodError(message: string): string {
  return message.includes("_monday_check") || message.includes("_first_check")
    ? "Your device's date or time zone looks incorrect, which is stopping this period from loading correctly. Please check your device's date/time settings and reload."
    : message;
}

// Tapping the count itself opens a direct numeric entry - catching up
// after a live event (e.g. entering 15 Yeses at once) used to mean 15
// separate taps on "+", one at a time.
function StageCount({
  label,
  value,
  onDelta,
  onSetAbsolute,
}: {
  label: string;
  value: number;
  onDelta: (delta: number) => void;
  onSetAbsolute: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  function commit() {
    const parsed = Math.max(0, parseInt(editValue, 10) || 0);
    setEditing(false);
    if (parsed !== value) onSetAbsolute(parsed);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        className="btn-icon"
        onClick={() => onDelta(-1)}
        disabled={value <= 0}
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      {editing ? (
        <input
          type="number"
          min={0}
          inputMode="numeric"
          autoFocus
          className="input !w-14 !p-1 text-center text-lg font-bold"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="w-8 text-center text-xl font-bold text-white"
          onClick={() => {
            setEditValue(String(value));
            setEditing(true);
          }}
          aria-label={`Edit ${label} directly`}
        >
          {value}
        </button>
      )}
      <button className="btn-icon" onClick={() => onDelta(1)} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );
}

type Tab = "tally" | "roadmap" | "history";

function isTab(value: string | null): value is Tab {
  return value === "tally" || value === "roadmap" || value === "history";
}

function PipelinePageInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const { user, ownerId } = useAuth();
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : "tally");
  const [periodType, setPeriodType] = useState<PeriodType>("daily");
  // 0 = current day/week/month, 1 = one back, etc. - the three period
  // types' offsets aren't comparable, so switching type resets this.
  const [periodOffset, setPeriodOffset] = useState(0);
  const [period, setPeriod] = useState<PipelinePeriod | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  function switchPeriodType(next: PeriodType) {
    setPeriodType(next);
    setPeriodOffset(0);
  }

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  // A plain string comparison against each candidate's updated_at for the
  // stale-candidate badge below - same getToday()-style helper call used
  // throughout this codebase, not state, since it needs no re-render timer.
  const staleThresholdIso = isoDaysAgo(STALE_CANDIDATE_DAYS);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [tallyCopied, setTallyCopied] = useState(false);

  const [trendStage, setTrendStage] = useState<PipelineStageKey>("questions");
  const [trendHistory, setTrendHistory] = useState<PipelinePeriod[]>([]);

  const [ratioFromKey, setRatioFromKey] = useState<PipelineStageKey>("questions");
  const [ratioToKey, setRatioToKey] = useState<PipelineStageKey>("launches");

  // Daily/Weekly/Monthly averages for Questions/Yeses/QI1s - independent of
  // whichever periodType tab is currently selected above (that only
  // governs the single period being viewed/edited), so all three windows
  // load together regardless of which tab someone's on.
  const [dailyAvgPeriods, setDailyAvgPeriods] = useState<PipelinePeriod[]>([]);
  const [weeklyAvgPeriods, setWeeklyAvgPeriods] = useState<PipelinePeriod[]>([]);
  const [monthlyAvgPeriods, setMonthlyAvgPeriods] = useState<PipelinePeriod[]>([]);

  // Company-wide top 3 for each of the same three averages, one window at
  // a time (get_pipeline_average_leaders in supabase/schema.sql already
  // does the ranking - this just holds whichever window's result). Not
  // scoped to effectiveOwnerId/downline-fill-in like everything else on
  // this page - it's a company-wide ranking, the same regardless of who
  // you're filling in for.
  const [dailyLeaders, setDailyLeaders] = useState<AverageLeaderEntry[]>([]);
  const [weeklyLeaders, setWeeklyLeaders] = useState<AverageLeaderEntry[]>([]);
  const [monthlyLeaders, setMonthlyLeaders] = useState<AverageLeaderEntry[]>([]);
  const [leadersError, setLeadersError] = useState<string | null>(null);

  // History tab - reuses the same `candidates` already loaded for the
  // Candidate Roadmap tab (every candidate for this owner, not just
  // active ones), just filtered down to one month at a time.
  const [monthsBack, setMonthsBack] = useState(0);
  // Candidate Roadmap tab - narrows the active list down to one step, so
  // finding everyone stuck at a specific step doesn't mean scrolling past
  // everyone else. "all" is the existing (unfiltered) behavior.
  const [roadmapStepFilter, setRoadmapStepFilter] = useState<"all" | number>("all");

  // "Fill in for downline": an upline (any level) can log a downline
  // member's pipeline numbers on their behalf, in case they forget -
  // RLS on pipeline_periods now allows it. Empty for anyone with no
  // downline, which is most people, so the picker only shows up when
  // it's actually useful.
  const [downlineOptions, setDownlineOptions] = useState<DownlineOption[]>([]);
  const [actingForId, setActingForId] = useState<string>("");
  const actingFor = downlineOptions.find((d) => d.id === actingForId) ?? null;
  const effectiveOwnerId = actingFor ? actingFor.ownerId : ownerId;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: ids } = await supabase.rpc("get_downline_user_ids", { p_user_id: user.id });
      const downlineIds = ((ids as { user_id: string }[]) ?? []).map((r) => r.user_id);
      if (downlineIds.length === 0) {
        if (!cancelled) setDownlineOptions([]);
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,household_id,account_number")
        .in("id", downlineIds);
      if (!cancelled) {
        const options = (
          (profiles as Pick<
            Profile,
            "id" | "first_name" | "last_name" | "household_id" | "account_number"
          >[]) ?? []
        )
          .map((p) => ({
            id: p.id,
            ownerId: p.household_id ?? p.id,
            name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed",
            accountNumber: p.account_number ?? null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setDownlineOptions(options);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      const periodStart = periodStartFor(periodType, periodOffset);

      const { data: existing, error: selectError } = await supabase
        .from("pipeline_periods")
        .select("*")
        .eq("user_id", effectiveOwnerId)
        .eq("period_type", periodType)
        .eq("period_start", periodStart)
        .maybeSingle();

      if (selectError) {
        if (!cancelled) {
          setLoadError(selectError.message);
          setLoading(false);
        }
        return;
      }

      if (existing) {
        if (!cancelled) {
          setPeriod(existing as PipelinePeriod);
          setLoading(false);
        }
        return;
      }

      // Only the current period auto-creates a row on load (the original
      // "just start tallying today" convenience) - browsing back to a
      // past period that was never logged should just show zeros, not
      // silently write a new empty row purely from viewing it. A blank
      // "draft" (id: "") is a real PipelinePeriod-shaped object so the
      // rest of the page can render it normally; updateStage/
      // setStageAbsolute below know an empty id means "insert on first
      // edit" instead of "update this row."
      if (periodOffset > 0) {
        if (!cancelled) {
          const zeroStages = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, 0])) as Record<
            PipelineStageKey,
            number
          >;
          setPeriod({
            id: "",
            user_id: effectiveOwnerId,
            period_type: periodType,
            period_start: periodStart,
            last_edited_by: null,
            created_at: "",
            updated_at: "",
            ...zeroStages,
          });
          setLoading(false);
        }
        return;
      }

      const { data: created, error: insertError } = await supabase
        .from("pipeline_periods")
        .insert({ user_id: effectiveOwnerId, period_type: periodType, period_start: periodStart })
        .select("*")
        .single();

      if (!cancelled) {
        if (insertError) {
          setLoadError(friendlyPeriodError(insertError.message));
        } else {
          setPeriod(created as PipelinePeriod);
        }
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [periodType, periodOffset, effectiveOwnerId]);

  useEffect(() => {
    if (actingForId) return;
    async function load() {
      setLoadingCandidates(true);
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false });
      setCandidates((data as Candidate[]) ?? []);
      setLoadingCandidates(false);
    }
    load();
  }, [ownerId, actingForId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const limit = periodType === "daily" ? 7 : periodType === "weekly" ? 8 : 6;
      const { data } = await supabase
        .from("pipeline_periods")
        .select("*")
        .eq("user_id", effectiveOwnerId)
        .eq("period_type", periodType)
        .order("period_start", { ascending: false })
        .limit(limit);
      if (!cancelled) setTrendHistory((data as PipelinePeriod[]) ?? []);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [periodType, effectiveOwnerId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // +1 further back than the window size - the current (in-progress)
      // period is fetched too but never counted (see averagesForPeriods),
      // so this still needs to reach back far enough for windowSize
      // *completed* periods.
      const dailyStart = periodStartFor("daily", AVERAGES_WINDOW.daily);
      const weeklyStart = periodStartFor("weekly", AVERAGES_WINDOW.weekly);
      const monthlyStart = periodStartFor("monthly", AVERAGES_WINDOW.monthly);
      const [{ data: dailyRows }, { data: weeklyRows }, { data: monthlyRows }] = await Promise.all([
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", effectiveOwnerId)
          .eq("period_type", "daily")
          .gte("period_start", dailyStart),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", effectiveOwnerId)
          .eq("period_type", "weekly")
          .gte("period_start", weeklyStart),
        supabase
          .from("pipeline_periods")
          .select("*")
          .eq("user_id", effectiveOwnerId)
          .eq("period_type", "monthly")
          .gte("period_start", monthlyStart),
      ]);
      if (!cancelled) {
        setDailyAvgPeriods((dailyRows as PipelinePeriod[]) ?? []);
        setWeeklyAvgPeriods((weeklyRows as PipelinePeriod[]) ?? []);
        setMonthlyAvgPeriods((monthlyRows as PipelinePeriod[]) ?? []);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [effectiveOwnerId]);

  // Company-wide, not scoped to effectiveOwnerId - fetched once on mount
  // rather than re-fetched on every downline switch like the averages
  // above, since who's currently being filled in for has no bearing on a
  // company-wide ranking.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [
        { data: daily, error: dailyError },
        { data: weekly, error: weeklyError },
        { data: monthly, error: monthlyError },
      ] = await Promise.all([
        supabase.rpc("get_pipeline_average_leaders", { p_period_type: "daily" }),
        supabase.rpc("get_pipeline_average_leaders", { p_period_type: "weekly" }),
        supabase.rpc("get_pipeline_average_leaders", { p_period_type: "monthly" }),
      ]);
      if (!cancelled) {
        const error = dailyError || weeklyError || monthlyError;
        if (error) {
          setLeadersError(error.message);
        } else {
          setLeadersError(null);
          setDailyLeaders((daily as AverageLeaderEntry[]) ?? []);
          setWeeklyLeaders((weekly as AverageLeaderEntry[]) ?? []);
          setMonthlyLeaders((monthly as AverageLeaderEntry[]) ?? []);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const dailyAverages = useMemo(
    () => averagesForPeriods("daily", dailyAvgPeriods, AVERAGES_WINDOW.daily),
    [dailyAvgPeriods]
  );
  const weeklyAverages = useMemo(
    () => averagesForPeriods("weekly", weeklyAvgPeriods, AVERAGES_WINDOW.weekly),
    [weeklyAvgPeriods]
  );
  const monthlyAverages = useMemo(
    () => averagesForPeriods("monthly", monthlyAvgPeriods, AVERAGES_WINDOW.monthly),
    [monthlyAvgPeriods]
  );

  const chartData = useMemo(() => {
    const merged = [...trendHistory];
    if (period) {
      const idx = merged.findIndex((p) => p.period_start === period.period_start);
      if (idx >= 0) merged[idx] = period;
      else merged.push(period);
    }
    return merged
      .slice()
      .sort((a, b) => a.period_start.localeCompare(b.period_start))
      .map((p) => ({
        label:
          periodType === "monthly"
            ? formatShortMonthLabel(p.period_start)
            : formatShortDateLabel(p.period_start),
        value: p[trendStage] as number,
      }));
  }, [trendHistory, period, periodType, trendStage]);

  async function updateStage(key: PipelineStageKey, delta: number) {
    if (!period) return;
    const previousValue = period[key] as number;
    const nextValue = Math.max(0, previousValue + delta);
    const appliedDelta = nextValue - previousValue;
    setPeriod({ ...period, [key]: nextValue });

    if (periodType !== "daily") {
      // Weekly/Monthly, edited directly: no cascade - there's no smaller
      // unit to attribute a rollup to, so this keeps the old plain
      // insert-if-draft / update-by-id behavior.
      //
      // A "draft" period (id === "") is a past period that was viewed but
      // never had a real row - see the load effect above. The first edit
      // to one of these needs to insert a brand-new row instead of
      // updating one that doesn't exist yet (an .eq("id", "") update
      // would silently match nothing and look like it worked while
      // saving nothing at all).
      if (!period.id) {
        const { data: created, error } = await supabase
          .from("pipeline_periods")
          .insert({
            user_id: period.user_id,
            period_type: period.period_type,
            period_start: period.period_start,
            [key]: nextValue,
            last_edited_by: user.id,
          })
          .select("*")
          .single();
        if (error) {
          setPeriod((prev) => (prev ? { ...prev, [key]: previousValue } : prev));
          setUpdateError(friendlyPeriodError(error.message));
        } else {
          setPeriod(created as PipelinePeriod);
          setUpdateError(null);
        }
        return;
      }

      const { error } = await supabase
        .from("pipeline_periods")
        .update({ [key]: nextValue, updated_at: new Date().toISOString(), last_edited_by: user.id })
        .eq("id", period.id);
      if (error) {
        // Revert the optimistic count - otherwise a failed save looks
        // identical to a successful one and silently under/over-counts
        // this period's stats.
        setPeriod((prev) => (prev ? { ...prev, [key]: previousValue } : prev));
        setUpdateError(error.message);
      } else {
        setUpdateError(null);
      }
      return;
    }

    // Daily: goes through bump_pipeline_stage so this same edit also
    // rolls up into this week's and this month's totals - no more
    // re-entering the same number three times. Handles the draft-vs-
    // existing-row distinction itself (upsert), so no separate insert
    // path is needed here the way Weekly/Monthly still have above.
    const { error } = await supabase.rpc("bump_pipeline_stage", {
      p_owner_id: effectiveOwnerId,
      p_period_start: period.period_start,
      p_stage: key,
      p_delta: appliedDelta,
    });
    if (error) {
      setPeriod((prev) => (prev ? { ...prev, [key]: previousValue } : prev));
      setUpdateError(error.message);
      return;
    }
    setUpdateError(null);

    // Questions/Yeses also mirror into Core Run Streak's own Today's
    // Activity counters (and count toward Story Share) - only when
    // editing your own tally, not filling in for a downline member,
    // since that shouldn't touch the filler's own personal streak.
    if ((key === "questions" || key === "yeses") && !actingFor && appliedDelta !== 0) {
      await supabase.rpc("mirror_pipeline_stage_to_streak", {
        p_period_start: period.period_start,
        p_stage: key,
        p_delta: appliedDelta,
      });
    }

    const { data: refreshed } = await supabase
      .from("pipeline_periods")
      .select("*")
      .eq("user_id", effectiveOwnerId)
      .eq("period_type", "daily")
      .eq("period_start", period.period_start)
      .maybeSingle();
    if (refreshed) setPeriod(refreshed as PipelinePeriod);
  }

  function setStageAbsolute(key: PipelineStageKey, value: number) {
    if (!period) return;
    updateStage(key, value - (period[key] as number));
  }

  async function addCandidate() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setAddError(null);
    const { data, error } = await supabase
      .from("candidates")
      .insert({ name, user_id: ownerId })
      .select("*")
      .single();
    if (error) {
      setAddError(error.message);
    } else if (data) {
      setCandidates((prev) => [data as Candidate, ...prev]);
      setNewName("");
    }
    setAdding(false);
  }

  async function updateCandidate(id: string, patch: Partial<Candidate>) {
    const previous = candidates.find((c) => c.id === id);
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
    const { error } = await supabase
      .from("candidates")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      // Revert - otherwise a failed step move/status change still shows
      // as if it saved.
      if (previous) {
        setCandidates((prev) => prev.map((c) => (c.id === id ? previous : c)));
      }
      setUpdateError(error.message);
    } else {
      setUpdateError(null);
      // Any step/launched/filtered_out change can cross the 5-active
      // threshold - the RPC atomically claims the notification (server-
      // persisted, not a client ref) so it only fires once per crossing,
      // not once per page load.
      const { data: justCrossed } = await supabase.rpc(
        "try_claim_pipeline_threshold_notification"
      );
      if (justCrossed === true) {
        fireNotifyEvent({ kind: "pipeline_5plus" });
      }
      if (patch.launched === true && previous) {
        fireNotifyEvent({ kind: "candidate_launched", candidateName: previous.name });
      }
      if (patch.filtered_out === true && previous) {
        fireNotifyEvent({ kind: "candidate_filtered_out", candidateName: previous.name });
      }
    }
  }

  // Permanent, unlike Filtered Out - for a test/fake entry that shouldn't
  // exist at all, not someone who genuinely didn't pan out. Confirmed
  // since there's no Restore from this one.
  async function deleteCandidate(id: string, name: string) {
    if (!window.confirm(`Permanently delete ${name}? This can't be undone.`)) return;
    const previous = candidates;
    setCandidates((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from("candidates").delete().eq("id", id);
    if (error) {
      setCandidates(previous);
      setUpdateError(error.message);
    } else {
      setUpdateError(null);
    }
  }

  function moveStep(candidate: Candidate, delta: number) {
    const next = Math.min(
      CANDIDATE_STEPS.length - 1,
      Math.max(0, candidate.current_step + delta)
    );
    if (next === candidate.current_step) return;
    updateCandidate(candidate.id, { current_step: next });
  }

  const ratioFromLabel = PIPELINE_STAGES.find((s) => s.key === ratioFromKey)?.label ?? "";
  const ratioToLabel = PIPELINE_STAGES.find((s) => s.key === ratioToKey)?.label ?? "";
  const ratioFromValue = (period?.[ratioFromKey] as number | undefined) ?? 0;
  const ratioToValue = (period?.[ratioToKey] as number | undefined) ?? 0;

  // Copy/paste summary of whichever period (Daily/Weekly/Monthly) and
  // offset is currently selected above - same idea as Core Run Streak's
  // Daily Update Summary, so a rep can drop their numbers into an upline
  // text/chat without retyping each stage count by hand.
  const tallyPeriodLabel =
    periodType === "daily" ? "Daily" : periodType === "weekly" ? "Weekly" : "Monthly";
  const tallySummaryText = useMemo(() => {
    if (!period) return "";
    const lines: string[] = [];
    lines.push(`📊 ${tallyPeriodLabel} Pipeline — ${periodLabelFor(periodType, period.period_start)}`);
    lines.push("");
    for (const stage of PIPELINE_STAGES) {
      lines.push(`${stage.label}: ${period[stage.key] as number}`);
    }
    lines.push("");
    lines.push(`${ratioFromLabel} → ${ratioToLabel}: ${pct(ratioToValue, ratioFromValue)}`);
    return lines.join("\n");
  }, [period, periodType, tallyPeriodLabel, ratioFromLabel, ratioToLabel, ratioFromValue, ratioToValue]);

  async function copyTallySummary() {
    try {
      await navigator.clipboard.writeText(tallySummaryText);
      setTallyCopied(true);
      setTimeout(() => setTallyCopied(false), 2000);
    } catch {
      setTallyCopied(false);
    }
  }

  // Filtered-out candidates disappear from the active roadmap once they're
  // filtered out — they only live on in the Candidate History tab.
  // Left in the order the query already returns them (newest-first,
  // unmodified) rather than resorted by current_step - previously a
  // candidate's position shifted every time their step changed, which
  // made the All tab hard to navigate since nothing stayed put.
  const active = candidates.filter((c) => !c.launched && !c.filtered_out);
  const launched = candidates.filter((c) => c.launched);
  const activeInPipelineCount = active.filter((c) => c.current_step >= ACTIVE_PIPELINE_MIN_STEP).length;
  const staleCount = active.filter((c) => c.updated_at < staleThresholdIso).length;

  const filteredActive =
    roadmapStepFilter === "all" ? active : active.filter((c) => c.current_step === roadmapStepFilter);

  const historyMonthStart = getMonthStartOffset(monthsBack);
  const historyNextMonthStart = getMonthStartOffset(monthsBack - 1);
  const candidatesThisMonth = useMemo(
    () =>
      candidates.filter(
        (c) => c.connected_date >= historyMonthStart && c.connected_date < historyNextMonthStart
      ),
    [candidates, historyMonthStart, historyNextMonthStart]
  );

  return (
    <FeatureGate minSession={4}>
      <PageHeader
        title="Pipeline Tracker"
        subtitle={
          period
            ? `${periodLabelFor(periodType, period.period_start)}${
                periodOffset === 0 ? " (current)" : ""
              }${actingFor ? ` — ${actingFor.name}` : ""}`
            : undefined
        }
      />
      <div className="tab-bar px-4 pb-3 pt-3">
        <div className="card flex p-1">
          <button
            className={tab === "tally" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setTab("tally")}
          >
            Tally
          </button>
          <button
            className={tab === "roadmap" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setTab("roadmap")}
          >
            Candidate Roadmap
          </button>
          <button
            className={tab === "history" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setTab("history")}
          >
            History
          </button>
        </div>
      </div>
      <main className="page-main !pt-0">
        {tab === "tally" && (
          <>
            <div className="card flex p-1">
              <button
                className={
                  periodType === "daily" ? "toggle-pill-active" : "toggle-pill-inactive"
                }
                onClick={() => switchPeriodType("daily")}
              >
                Daily
              </button>
              <button
                className={
                  periodType === "weekly" ? "toggle-pill-active" : "toggle-pill-inactive"
                }
                onClick={() => switchPeriodType("weekly")}
              >
                Weekly
              </button>
              <button
                className={
                  periodType === "monthly" ? "toggle-pill-active" : "toggle-pill-inactive"
                }
                onClick={() => switchPeriodType("monthly")}
              >
                Monthly
              </button>
            </div>

            <div className="card flex items-center justify-between">
              <button
                className="btn-icon"
                onClick={() => setPeriodOffset((o) => o + 1)}
                aria-label={`Previous ${periodType === "daily" ? "day" : periodType === "weekly" ? "week" : "month"}`}
              >
                ‹
              </button>
              <span className="text-sm font-medium text-white">
                {period ? periodLabelFor(periodType, period.period_start) : "…"}
                {periodOffset === 0 && <span className="ml-1 text-xs text-slate-500">(current)</span>}
              </span>
              <button
                className="btn-icon"
                onClick={() => setPeriodOffset((o) => Math.max(0, o - 1))}
                disabled={periodOffset <= 0}
                aria-label={`Next ${periodType === "daily" ? "day" : periodType === "weekly" ? "week" : "month"}`}
              >
                ›
              </button>
            </div>

            {downlineOptions.length > 0 && (
              <div className="card space-y-2">
                <p className="section-title">Filling In For</p>
                <SearchablePicker
                  value={actingForId}
                  onChange={setActingForId}
                  placeholder="Me"
                  searchPlaceholder="Search team members…"
                  options={[
                    { value: "", label: "Me" },
                    ...downlineOptions.map((d) => ({
                      value: d.id,
                      label: d.accountNumber ? `${d.name} (#${d.accountNumber})` : d.name,
                    })),
                  ]}
                />
                {actingFor && (
                  <p className="text-xs text-amber-light">
                    ✏️ You&apos;re editing {actingFor.name}&apos;s pipeline numbers, not your own.
                  </p>
                )}
              </div>
            )}

            <div className="card space-y-2">
              <p className="section-title">Conversion</p>
              <div className="flex items-center gap-2">
                <select
                  className="select flex-1"
                  value={ratioFromKey}
                  onChange={(e) => setRatioFromKey(e.target.value as PipelineStageKey)}
                  aria-label="From stage"
                >
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span className="shrink-0 text-slate-500">→</span>
                <select
                  className="select flex-1"
                  value={ratioToKey}
                  onChange={(e) => setRatioToKey(e.target.value as PipelineStageKey)}
                  aria-label="To stage"
                >
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {ratioFromLabel} → {ratioToLabel}
                </p>
                <p className="text-3xl font-bold text-amber">{pct(ratioToValue, ratioFromValue)}</p>
              </div>
            </div>

            {updateError && (
              <div className="card">
                <p className="text-xs text-red-400">{updateError}</p>
              </div>
            )}

            {loadError ? (
              <div className="empty-state">Couldn&apos;t load this period: {loadError}</div>
            ) : loading || !period ? (
              <SkeletonRows rows={8} />
            ) : (
              <div className="space-y-2">
                {PIPELINE_STAGES.map((stage, i) => {
                  const count = period[stage.key] as number;
                  const prevStage = i > 0 ? PIPELINE_STAGES[i - 1] : null;
                  const prevCount = prevStage ? (period[prevStage.key] as number) : null;

                  return (
                    <div key={stage.key}>
                      {i > 0 && (
                        <div className="flex items-center justify-center py-1 text-xs text-slate-500">
                          <span>
                            {prevStage?.label} → {stage.label}:{" "}
                            <span className="font-semibold text-amber-light">
                              {pct(count, prevCount ?? 0)}
                            </span>
                          </span>
                        </div>
                      )}
                      <div className="card flex items-center justify-between">
                        <p className="font-medium text-white">{stage.label}</p>
                        <StageCount
                          label={stage.label}
                          value={count}
                          onDelta={(delta) => updateStage(stage.key, delta)}
                          onSetAbsolute={(value) => setStageAbsolute(stage.key, value)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="section-title">Trend</p>
                <select
                  className="select"
                  value={trendStage}
                  onChange={(e) => setTrendStage(e.target.value as PipelineStageKey)}
                >
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <TrendChart data={chartData} />
            </div>

            <div className="card space-y-2">
              <p className="section-title">Your Averages</p>
              <div className="no-scrollbar overflow-x-auto">
                <table className="w-full min-w-[380px] text-left text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="pb-1.5 pr-2 font-medium"></th>
                      <th className="pb-1.5 pr-2 text-right font-medium">
                        Daily ({dailyAverages.windowCount}d)
                      </th>
                      <th className="pb-1.5 pr-2 text-right font-medium">
                        Weekly ({weeklyAverages.windowCount}w)
                      </th>
                      <th className="pb-1.5 text-right font-medium">
                        Monthly ({monthlyAverages.windowCount}mo)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {AVERAGE_METRICS.map((metric) => (
                      <tr key={metric.key} className="border-t border-white/5">
                        <td className="py-1.5 pr-2 font-medium text-white">{metric.label}</td>
                        <td className="py-1.5 pr-2 text-right font-bold text-amber">
                          {dailyAverages[metric.key].toFixed(1)}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-bold text-amber">
                          {weeklyAverages[metric.key].toFixed(1)}
                        </td>
                        <td className="py-1.5 text-right font-bold text-amber">
                          {monthlyAverages[metric.key].toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400">
                Averaged across the completed days/weeks/months since you started logging (up to{" "}
                {AVERAGES_WINDOW.daily} days, {AVERAGES_WINDOW.weekly} weeks, or{" "}
                {AVERAGES_WINDOW.monthly} months back) — a period with nothing logged still counts
                as a 0, so this reflects real consistency since you started, not just how much you
                do on periods you actually engage. The current, still-in-progress day/week/month
                is never included — it hasn&apos;t finished yet, so it isn&apos;t a fair comparison
                to a completed one.
              </p>
            </div>

            <div className="card space-y-2">
              <p className="section-title">
                🏆 Team Leaders (
                {periodType === "daily" ? "Daily" : periodType === "weekly" ? "Weekly" : "Monthly"})
              </p>
              <p className="text-xs text-slate-400">
                Who&apos;s averaging the most across the whole team right now — same{" "}
                {periodType} window as the tab above.
              </p>
              {leadersError && <p className="text-xs text-red-400">{leadersError}</p>}
              {AVERAGE_METRICS.map((metric) => (
                <div key={metric.key} className="rounded-lg bg-navy px-3 py-2">
                  <p className="text-xs font-medium text-slate-300">{metric.label}</p>
                  <AverageLeaders
                    leaders={
                      periodType === "daily"
                        ? dailyLeaders
                        : periodType === "weekly"
                          ? weeklyLeaders
                          : monthlyLeaders
                    }
                    metric={metric.key}
                  />
                </div>
              ))}
            </div>

            {period && (
              <div className="card space-y-2">
                <p className="section-title">Copy Summary</p>
                <p className="text-xs text-slate-400">
                  Copy/paste this {tallyPeriodLabel.toLowerCase()} pipeline summary — reflects
                  whichever period is selected above ({periodLabelFor(periodType, period.period_start)}).
                </p>
                <textarea
                  readOnly
                  className="textarea min-h-[180px] font-mono text-xs"
                  value={tallySummaryText}
                />
                <button className="btn-primary w-full" onClick={copyTallySummary}>
                  {tallyCopied ? "Copied!" : "Copy Summary"}
                </button>
              </div>
            )}
          </>
        )}

        {tab === "roadmap" &&
          (actingFor ? (
            <DownlineCandidateResources actingFor={actingFor} />
          ) : (
            <>
              <div className="flex items-center justify-between px-1 pt-2">
                <p className="section-title">Candidate Roadmap</p>
                <div className="flex items-center gap-1.5">
                  {staleCount > 0 && (
                    <span className="pill !border-red-500/25 !bg-red-500/10 !text-red-300">
                      ⏰ {staleCount} stale
                    </span>
                  )}
                  <span className="pill pill-amber">{activeInPipelineCount} active in pipeline</span>
                </div>
              </div>

              <FirstVisitTip id="pipeline-roadmap">
                💡 Each candidate moves through 9 steps — Yes, QI1, QI2, IS1, FU1, IS2, FU2,
                Questionnaire, then Launched. Tap ← → on a card to move them one step, or tap the
                card itself for notes, resources, and more.
              </FirstVisitTip>

              <div id="add-candidate" className="card space-y-2">
                <p className="section-title">Add Candidate</p>
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="Candidate name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCandidate()}
                  />
                  <button
                    className="btn-primary"
                    onClick={addCandidate}
                    disabled={adding || !newName.trim()}
                  >
                    Add
                  </button>
                </div>
                {addError && <p className="text-xs text-red-400">{addError}</p>}
              </div>

              {active.length > 0 && (
                <select
                  className="input"
                  value={roadmapStepFilter === "all" ? "all" : String(roadmapStepFilter)}
                  onChange={(e) =>
                    setRoadmapStepFilter(e.target.value === "all" ? "all" : Number(e.target.value))
                  }
                >
                  <option value="all">All Steps</option>
                  {CANDIDATE_STEPS.map((step, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {step.label}
                    </option>
                  ))}
                </select>
              )}

              {loadingCandidates ? (
                <SkeletonList cards={3} lines={1} />
              ) : candidates.length === 0 ? (
                <div className="empty-state">No candidates yet. Add your first one above.</div>
              ) : (
                <>
                  {filteredActive.map((candidate) => (
                    <CandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      onMoveStep={moveStep}
                      onUpdate={updateCandidate}
                      isStale={candidate.updated_at < staleThresholdIso}
                    />
                  ))}

                  {filteredActive.length === 0 && (
                    <p className="empty-state">
                      {active.length === 0
                        ? "No active candidates right now."
                        : "Nobody's at that step right now."}
                    </p>
                  )}

                  {launched.length > 0 && (
                    <div className="space-y-2">
                      <p className="section-title px-1">Launched 🎉</p>
                      {launched.map((candidate) => (
                        <CandidateCard
                          key={candidate.id}
                          candidate={candidate}
                          onMoveStep={moveStep}
                          onUpdate={updateCandidate}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ))}

        {tab === "history" && actingFor && (
          <div className="empty-state">
            Switch back to &quot;Me&quot; on the Tally tab to see History — filling in only covers
            {" "}
            {actingFor.name}&apos;s pipeline numbers, not their individual candidates.
          </div>
        )}

        {tab === "history" && !actingFor && (
          <>
            <div className="card flex items-center justify-between">
              <button
                className="btn-icon"
                onClick={() => setMonthsBack((m) => Math.min(11, m + 1))}
                disabled={monthsBack >= 11}
                aria-label="Previous month"
              >
                ←
              </button>
              <span className="text-sm font-medium text-white">{formatMonthLabel(historyMonthStart)}</span>
              <button
                className="btn-icon"
                onClick={() => setMonthsBack((m) => Math.max(0, m - 1))}
                disabled={monthsBack <= 0}
                aria-label="Next month"
              >
                →
              </button>
            </div>

            {updateError && (
              <div className="card">
                <p className="text-xs text-red-400">{updateError}</p>
              </div>
            )}

            {loadingCandidates ? (
              <div className="card">
                <SkeletonRows rows={4} />
              </div>
            ) : candidatesThisMonth.length === 0 ? (
              <div className="empty-state">
                {candidates.length === 0
                  ? "No candidates yet. Add one from the Candidate Roadmap tab."
                  : `No candidates connected in ${formatMonthLabel(historyMonthStart)}.`}
              </div>
            ) : (
              <div className="card space-y-2">
                <div className="no-scrollbar overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="pb-1 pr-2 font-medium">Connected</th>
                        <th className="pb-1 pr-2 font-medium">Name</th>
                        <th className="pb-1 pr-2 font-medium">Status</th>
                        <th className="pb-1 pr-2 font-medium">Notes</th>
                        <th className="pb-1 pr-2 font-medium">Filtered Out Reason</th>
                        <th className="pb-1 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidatesThisMonth.map((c) => {
                        const step = CANDIDATE_STEPS[c.current_step];
                        return (
                          <tr key={c.id} className="border-t border-white/5">
                            <td className="py-1.5 pr-2 whitespace-nowrap text-slate-400">
                              {formatDateLabel(c.connected_date)}
                            </td>
                            <td className="py-1.5 pr-2 font-medium text-white">{c.name}</td>
                            <td className="py-1.5 pr-2 text-slate-300">
                              {c.launched
                                ? "Launched 🎉"
                                : c.filtered_out
                                  ? `Filtered Out — ${step.label}`
                                  : `Active — ${step.label}`}
                            </td>
                            <td className="max-w-[160px] truncate py-1.5 pr-2 text-slate-400">
                              {c.notes || "—"}
                            </td>
                            <td className="max-w-[160px] truncate py-1.5 pr-2 text-slate-400">
                              {c.filtered_out ? c.filtered_out_reason || "—" : "—"}
                            </td>
                            <td className="py-1.5">
                              <div className="flex justify-end gap-1">
                                {(c.launched || c.filtered_out) && (
                                  <button
                                    className="pill"
                                    onClick={() =>
                                      updateCandidate(c.id, {
                                        launched: false,
                                        launched_at: null,
                                        filtered_out: false,
                                        filtered_out_reason: null,
                                      })
                                    }
                                  >
                                    Restore
                                  </button>
                                )}
                                <button
                                  className="pill text-red-400"
                                  onClick={() => deleteCandidate(c.id, c.name)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      {tab === "roadmap" && <Fab targetId="add-candidate" label="Add candidate" />}
    </FeatureGate>
  );
}

// useSearchParams() (reading Search's ?tab= quick-action link) requires a
// Suspense boundary around whatever calls it, same pattern already used
// by Games' ?tab= deep link.
export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="page-main" />}>
      <PipelinePageInner />
    </Suspense>
  );
}

// The IBO decides in-person vs. virtual, and which specific webinar,
// for each candidate - not the candidate themselves, since they don't
// know the jargon and the IBO is the one who knows how the conversation
// with them actually went. This just writes straight to the candidates
// row (candidate.is1_/is2_* fields), same as any other roadmap edit -
// /prospect only reads it back and lets the candidate mark it watched.
function InfoSessionPicker({
  label,
  mode,
  webinarSlot,
  watched,
  onSetMode,
  onSetSlot,
}: {
  label: string;
  mode: "in_person" | "virtual" | null;
  webinarSlot: string | null;
  watched: boolean;
  onSetMode: (mode: "in_person" | "virtual") => void;
  onSetSlot: (slotKey: string | null) => void;
}) {
  const nextSlots = useMemo(
    () =>
      VIRTUAL_WEBINAR_SLOTS.map((slot) => ({ slot, at: nextWebinarOccurrence(slot) })).sort(
        (a, b) => a.at.getTime() - b.at.getTime()
      ),
    []
  );

  return (
    <div className="space-y-1.5 rounded-lg bg-navy px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-200">{label} Info Session</span>
        {watched && <span className="text-xs text-amber-light">✅ Watched</span>}
      </div>
      <div className="flex gap-1 rounded-lg bg-white/5 p-1">
        <button
          className={mode === "in_person" ? "toggle-pill-active" : "toggle-pill-inactive"}
          onClick={() => onSetMode("in_person")}
        >
          🏢 In Person
        </button>
        <button
          className={mode === "virtual" ? "toggle-pill-active" : "toggle-pill-inactive"}
          onClick={() => onSetMode("virtual")}
        >
          💻 Virtual
        </button>
      </div>
      {mode === "virtual" && (
        <select
          className="select"
          value={webinarSlot ?? ""}
          onChange={(e) => onSetSlot(e.target.value || null)}
        >
          <option value="">Pick a time…</option>
          {nextSlots.map(({ slot, at }) => (
            <option key={slot.key} value={slot.key}>
              {slot.presenter} — {formatWebinarTime(at)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  onMoveStep,
  onUpdate,
  isStale,
}: {
  candidate: Candidate;
  onMoveStep: (candidate: Candidate, delta: number) => void;
  onUpdate: (id: string, patch: Partial<Candidate>) => void;
  isStale?: boolean;
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(candidate.notes);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showFilterReason, setShowFilterReason] = useState(false);
  const [filterReason, setFilterReason] = useState(candidate.filtered_out_reason ?? "");
  const step = CANDIDATE_STEPS[candidate.current_step];
  const isSettled = candidate.launched || candidate.filtered_out;
  const statusLabel = candidate.launched ? "Launched 🎉" : candidate.filtered_out ? "Filtered Out" : step.label;

  function confirmFilteredOut() {
    onUpdate(candidate.id, {
      filtered_out: true,
      launched: false,
      filtered_out_reason: filterReason.trim(),
    });
    setShowFilterReason(false);
  }

  function restore() {
    onUpdate(candidate.id, {
      launched: false,
      launched_at: null,
      filtered_out: false,
      filtered_out_reason: null,
    });
    setFilterReason("");
  }

  // Deliberately two separate copy actions instead of one combined
  // "link + code" message - a text containing a tappable link, sent to a
  // number that isn't saved as a contact, gets silently spam-filtered by
  // carriers/iMessage at a meaningfully higher rate than plain text does,
  // with zero signal back to the sender that it happened (confirmed live:
  // a candidate never received the combined message, no error shown on
  // the sending side). Splitting it into two separate texts - one with
  // just the code, one with just the link - and saving the person as a
  // contact first cuts that risk substantially.
  async function copyAccessCode() {
    await navigator.clipboard.writeText(`Your code for the resources page is ${candidate.access_code}`);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  async function copyAccessLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/prospect`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  // Collapsed by default and just one line - a full roster of active
  // candidates used to mean scrolling past every name's full notes,
  // Connected date, and action buttons to find anyone. Tapping the row
  // expands it for the less-frequent stuff (notes, Connected date,
  // Launched/Filtered Out); Back/Advance stay one tap away either way
  // since moving someone forward is the single most common action here.
  return (
    <div className={`card space-y-0 ${isSettled ? "opacity-70" : ""}`}>
      <div
        className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((exp) => !exp);
          }
        }}
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{candidate.name}</p>
          <p className="truncate text-xs text-amber-light">
            {statusLabel}
            {!isSettled && isStale && (
              <span className="text-red-300"> · ⏰ No movement in {STALE_CANDIDATE_DAYS}+ days</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!isSettled && (
            <>
              <button
                className="btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveStep(candidate, -1);
                }}
                disabled={candidate.current_step === 0}
                aria-label={`Move ${candidate.name} back a step`}
              >
                ←
              </button>
              <button
                className="btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveStep(candidate, 1);
                }}
                disabled={candidate.current_step === CANDIDATE_STEPS.length - 1}
                aria-label={`Advance ${candidate.name} a step`}
              >
                →
              </button>
            </>
          )}
          <span className="pl-0.5 text-slate-500">{expanded ? "▾" : "▸"}</span>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 pt-3">
          {candidate.access_code && (
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1.5">
                <button className="pill" onClick={copyAccessCode}>
                  {codeCopied ? "✓ Copied!" : `🔑 Copy code: ${candidate.access_code}`}
                </button>
                <button className="pill" onClick={copyAccessLink}>
                  {linkCopied ? "✓ Copied!" : "🔗 Copy link"}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Send these as two separate texts, not pasted together — and save them as a
                contact first if you haven&apos;t. A text with a link, sent to an unsaved
                number, can get silently spam-filtered with no warning on your end.
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-400">
            <span className="shrink-0 font-medium text-slate-300">Connected:</span>
            <input
              type="date"
              className="input"
              value={candidate.connected_date}
              onChange={(e) => onUpdate(candidate.id, { connected_date: e.target.value })}
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-400">
            <span className="shrink-0 font-medium text-slate-300">Time zone:</span>
            <select
              className="select"
              value={candidate.timezone ?? ""}
              onChange={(e) => onUpdate(candidate.id, { timezone: e.target.value || null })}
            >
              <option value="">Same as me</option>
              {US_TIMEZONES.map((tz) => (
                <option key={tz.key} value={tz.key}>
                  {tz.label}
                </option>
              ))}
            </select>
          </label>

          <BookMeetingButton candidate={candidate} />

          {candidate.current_step >= 3 && (
            <InfoSessionPicker
              label="IS1"
              mode={candidate.is1_session_mode}
              webinarSlot={candidate.is1_webinar_slot}
              watched={candidate.is1_watched}
              onSetMode={(mode) =>
                onUpdate(candidate.id, {
                  is1_session_mode: mode,
                  is1_webinar_slot: mode === "in_person" ? null : candidate.is1_webinar_slot,
                  is1_webinar_selected_at: mode === "in_person" ? null : candidate.is1_webinar_selected_at,
                })
              }
              onSetSlot={(slotKey) =>
                onUpdate(candidate.id, {
                  is1_webinar_slot: slotKey,
                  is1_webinar_selected_at: slotKey ? new Date().toISOString() : null,
                })
              }
            />
          )}
          {candidate.current_step >= 5 && (
            <InfoSessionPicker
              label="IS2"
              mode={candidate.is2_session_mode}
              webinarSlot={candidate.is2_webinar_slot}
              watched={candidate.is2_watched}
              onSetMode={(mode) =>
                onUpdate(candidate.id, {
                  is2_session_mode: mode,
                  is2_webinar_slot: mode === "in_person" ? null : candidate.is2_webinar_slot,
                  is2_webinar_selected_at: mode === "in_person" ? null : candidate.is2_webinar_selected_at,
                })
              }
              onSetSlot={(slotKey) =>
                onUpdate(candidate.id, {
                  is2_webinar_slot: slotKey,
                  is2_webinar_selected_at: slotKey ? new Date().toISOString() : null,
                })
              }
            />
          )}

          {!isSettled ? (
            showFilterReason ? (
              <div className="space-y-2 rounded-lg border border-slate-700 p-3">
                <p className="text-xs text-slate-400">
                  Why is {candidate.name} being filtered out? (optional)
                </p>
                <textarea
                  className="textarea"
                  placeholder="Went cold, not a fit right now, etc."
                  value={filterReason}
                  onChange={(e) => setFilterReason(e.target.value)}
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button className="btn-danger flex-1" onClick={confirmFilteredOut}>
                    Confirm Filtered Out
                  </button>
                  <button className="btn-secondary flex-1" onClick={() => setShowFilterReason(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  className="btn-primary flex-1"
                  onClick={() =>
                    onUpdate(candidate.id, {
                      launched: true,
                      launched_at: new Date().toISOString(),
                      filtered_out: false,
                    })
                  }
                >
                  Mark Launched
                </button>
                <button className="btn-danger flex-1" onClick={() => setShowFilterReason(true)}>
                  Filtered Out
                </button>
              </div>
            )
          ) : (
            <div className="space-y-2">
              {candidate.launched && !candidate.gemini_group_added && isGeminiGroupOwner(user.email) && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-navy px-3 py-2">
                  <p className="text-xs text-slate-300">
                    🔗 Add {candidate.name} to the Gemini Assistant Google Group
                  </p>
                  <button
                    className="pill shrink-0"
                    onClick={() => onUpdate(candidate.id, { gemini_group_added: true })}
                  >
                    ✓ Done
                  </button>
                </div>
              )}
              {candidate.filtered_out && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-300">Why they were filtered out:</p>
                  <textarea
                    className="textarea"
                    placeholder="No reason given"
                    value={filterReason}
                    onChange={(e) => setFilterReason(e.target.value)}
                    onBlur={() => {
                      if (filterReason !== (candidate.filtered_out_reason ?? "")) {
                        onUpdate(candidate.id, { filtered_out_reason: filterReason });
                      }
                    }}
                  />
                </div>
              )}
              <button className="btn-secondary w-full" onClick={restore}>
                Restore
              </button>
            </div>
          )}

          <textarea
            className="textarea"
            placeholder="Notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== candidate.notes) onUpdate(candidate.id, { notes });
            }}
          />

          <CandidateQuestions candidateId={candidate.id} />

          <CandidateResourceProgress candidate={candidate} />

          <CandidateResourceSender candidateId={candidate.id} />
        </div>
      )}
    </div>
  );
}

// Whatever a candidate has jotted down in /prospect throughout the
// whole interview process (not tied to any one step) - so it's visible
// here and doesn't get forgotten before the next time you actually meet
// with them. "Mark answered" is just a strikethrough/dim, not a delete,
// so it stays as a record of what's already been talked about; the ✕
// is a real delete for once it's fully done with.
function CandidateQuestions({ candidateId }: { candidateId: string }) {
  const [questions, setQuestions] = useState<CandidateQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("candidate_questions")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setQuestions((data as CandidateQuestion[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  async function toggleAnswered(q: CandidateQuestion) {
    const previous = questions;
    setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, answered: !x.answered } : x)));
    const { error } = await supabase
      .from("candidate_questions")
      .update({ answered: !q.answered })
      .eq("id", q.id);
    if (error) {
      setQuestions(previous);
      setError(error.message);
    }
  }

  async function removeQuestion(id: string) {
    const previous = questions;
    setQuestions((prev) => prev.filter((x) => x.id !== id));
    const { error } = await supabase.from("candidate_questions").delete().eq("id", id);
    if (error) {
      setQuestions(previous);
      setError(error.message);
    }
  }

  if (loading || questions.length === 0) return null;

  const openCount = questions.filter((q) => !q.answered).length;

  return (
    <div className="space-y-1.5 rounded-lg bg-navy px-3 py-2">
      <div
        className="flex cursor-pointer items-center justify-between"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((exp) => !exp);
          }
        }}
        aria-expanded={expanded}
      >
        <span className="text-xs font-semibold text-slate-200">
          ❓ Questions{openCount > 0 ? `: ${openCount} unanswered` : " — all answered"}
        </span>
        <span className="text-slate-500">{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && (
        <div className="space-y-1.5 pt-1">
          {questions.map((q) => (
            <div
              key={q.id}
              className={`flex items-start justify-between gap-2 rounded-lg bg-navy-lighter px-2 py-1.5 ${
                q.answered ? "opacity-60" : ""
              }`}
            >
              <p className={`text-xs ${q.answered ? "text-slate-500 line-through" : "text-slate-200"}`}>
                {q.question}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  className="btn-icon !h-6 !w-6 text-xs"
                  onClick={() => toggleAnswered(q)}
                  aria-label={q.answered ? `Mark "${q.question}" unanswered` : `Mark "${q.question}" answered`}
                >
                  {q.answered ? "↺" : "✓"}
                </button>
                <button
                  className="btn-icon !h-6 !w-6 text-xs"
                  onClick={() => removeQuestion(q.id)}
                  aria-label={`Remove question: ${q.question}`}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

// datetime-local inputs want "YYYY-MM-DDTHH:mm" in local time - same
// tiny formatter the Calendar's own Add Event form uses, duplicated here
// rather than shared since it's a one-line self-contained helper.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Books a real calendar_events row linked to this candidate, right from
// their Roadmap card - same underlying table the Calendar's own Add
// Event form writes to, so it shows up on the IBO's Calendar immediately
// with no separate sync step. The title typed here is only ever for the
// IBO's own calendar - whatever internal shorthand they want (QI1, QI2,
// "fill-in for Aaron," etc.) - and is never sent to the candidate:
// get_candidate_upcoming_events (supabase/schema.sql) always renders a
// candidate's own /prospect "Upcoming" entry as a generic computed
// "Meeting with {whoever booked it}," regardless of this event's actual
// title or notes.
function BookMeetingButton({ candidate }: { candidate: Candidate }) {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState(`Meeting with ${candidate.name}`);
  const [eventAt, setEventAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [timezone, setTimezone] = useState(candidate.timezone ?? guessTimeZone());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myTimezone, setMyTimezone] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
      setMyTimezone((data as Pick<Profile, "timezone"> | null)?.timezone ?? null);
    }
    load();
  }, [user.id]);

  function openModal() {
    setTitle(`Meeting with ${candidate.name}`);
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    setEventAt(toLocalInputValue(d));
    setDurationMinutes(30);
    // Candidate's own saved zone wins if they have one; otherwise this
    // IBO's own saved default; otherwise this device's zone - same
    // fallback chain the Calendar's Add Event form uses.
    setTimezone(candidate.timezone ?? myTimezone ?? guessTimeZone());
    setNotes("");
    setError(null);
    setShowModal(true);
  }

  async function save() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !eventAt) return;
    setSaving(true);
    setError(null);
    // Routed through an RPC rather than a direct insert - calendar_events'
    // own RLS only allows inserting under your OWN (or household's)
    // user_id, with no upline exception, so a raw insert here would fail
    // outright when filling in for a downline's candidate. The RPC does
    // its own self/household/upline/admin check (same shape as this
    // candidate's other tables) and inserts under the candidate's actual
    // owner, so it lands on the right person's Calendar either way.
    const { error } = await supabase.rpc("book_candidate_meeting", {
      p_candidate_id: candidate.id,
      p_title: trimmedTitle,
      p_notes: notes,
      p_event_at: zonedInputToUtc(eventAt, timezone).toISOString(),
      p_duration_minutes: durationMinutes,
      p_event_timezone: timezone,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setShowModal(false);
  }

  return (
    <>
      <button className="btn-secondary w-full" onClick={openModal}>
        📅 Book a Meeting
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-2xl bg-navy-lighter p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="section-title">Book a Meeting with {candidate.name}</p>
              <button
                className="btn-icon !h-7 !w-7 text-sm"
                onClick={() => setShowModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Goes on your Calendar right away. {candidate.name} only ever sees a plain &quot;Meeting
              with [your name]&quot; on their end — never this title, your notes, or any internal
              shorthand like QI1/QI2.
            </p>
            <input
              className="input"
              placeholder="Title (just for your own calendar)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                type="datetime-local"
                className="input flex-1"
                value={eventAt}
                onChange={(e) => setEventAt(e.target.value)}
              />
              <select
                className="select w-28 shrink-0"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                aria-label="Duration"
              >
                {CALENDAR_DURATION_OPTIONS.map((opt) => (
                  <option key={opt.minutes} value={opt.minutes}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <span className="shrink-0 font-medium text-slate-300">Time entered above is in:</span>
              <select className="select flex-1" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {US_TIMEZONES.map((tz) => (
                  <option key={tz.key} value={tz.key}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              className="textarea"
              placeholder="Notes (just for you - never shown to the candidate)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button className="btn-primary w-full" onClick={save} disabled={saving || !title.trim()}>
              {saving ? "Booking…" : "Book Meeting"}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}

// Read-only view of which of a candidate's resources they've checked off
// as done in /prospect - self-reported by the candidate (see
// toggle_candidate_resource_completion in supabase/schema.sql), never
// editable from here. Recomputes the same effective resource list
// /prospect shows (team-wide defaults for steps 0..current_step, merged
// with this owner's overrides, plus any one-off "Just For You" sends)
// so the count and checklist always match what the candidate actually
// saw, not just what's been completed.
function CandidateResourceProgress({ candidate }: { candidate: Candidate }) {
  const [overrides, setOverrides] = useState<CandidateResourceOverrideEntry[]>([]);
  const [specific, setSpecific] = useState<{ label: string; detail: string }[]>([]);
  const [completedLabels, setCompletedLabels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: overrideRows }, { data: specificRows }, { data: completionRows }] = await Promise.all([
        supabase.from("candidate_resource_overrides").select("*").eq("user_id", candidate.user_id),
        supabase.from("candidate_specific_resources").select("label,detail").eq("candidate_id", candidate.id),
        supabase.from("candidate_resource_completions").select("resource_label").eq("candidate_id", candidate.id),
      ]);
      if (!cancelled) {
        setOverrides((overrideRows as CandidateResourceOverrideEntry[]) ?? []);
        setSpecific((specificRows as { label: string; detail: string }[]) ?? []);
        setCompletedLabels(
          new Set(((completionRows as { resource_label: string }[]) ?? []).map((r) => r.resource_label))
        );
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [candidate.id, candidate.user_id]);

  const resources = useMemo(() => {
    const stepResources = Array.from({ length: candidate.current_step + 1 }, (_, step) => step).flatMap(
      (step) => effectiveResourcesForStep(step, overrides)
    );
    return [...stepResources, ...specific];
  }, [candidate.current_step, overrides, specific]);

  if (loading || resources.length === 0) return null;

  const doneCount = resources.filter((r) => completedLabels.has(r.label)).length;

  return (
    <div className="space-y-1.5 rounded-lg bg-navy px-3 py-2">
      <div
        className="flex cursor-pointer items-center justify-between"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((exp) => !exp);
          }
        }}
        aria-expanded={expanded}
      >
        <span className="text-xs font-semibold text-slate-200">
          📋 Resources: {doneCount}/{resources.length} completed
        </span>
        <span className="text-slate-500">{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && (
        <div className="space-y-1 pt-1">
          {resources.map((r, i) => (
            <p key={i} className="text-xs text-slate-400">
              {completedLabels.has(r.label) ? "✅" : "⬜"} {r.label}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// A one-off resource for this one candidate specifically, separate from
// the team-wide per-step defaults (see the Resources tab's Candidate
// Resources section) - always visible to them right away in /prospect,
// not gated behind reaching a step, since sending it is a deliberate
// right-now decision. RLS on candidate_resource_overrides permits this
// for the candidate's own household owner, any upline of that owner, or
// admin - reused as-is here and in DownlineCandidateResources below, so
// this same component works whether it's your own candidate or one
// you're viewing while filling in for a downline.
function CandidateResourceSender({ candidateId }: { candidateId: string }) {
  const [resources, setResources] = useState<CandidateSpecificResource[]>([]);
  const [libraryResources, setLibraryResources] = useState<OptionalResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data }, { data: libraryRows }] = await Promise.all([
        supabase
          .from("candidate_specific_resources")
          .select("*")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: true }),
        supabase.from("optional_resources").select("*").order("label", { ascending: true }),
      ]);
      if (!cancelled) {
        setResources((data as CandidateSpecificResource[]) ?? []);
        setLibraryResources((libraryRows as OptionalResource[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  async function send() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("candidate_specific_resources")
      .insert({
        candidate_id: candidateId,
        label: trimmedLabel,
        detail: detail.trim(),
        url: url.trim() || null,
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setResources((prev) => [...prev, data as CandidateSpecificResource]);
    setLabel("");
    setDetail("");
    setUrl("");
    setAdding(false);
  }

  async function sendFromLibrary(resource: OptionalResource) {
    setError(null);
    const { data, error } = await supabase
      .from("candidate_specific_resources")
      .insert({
        candidate_id: candidateId,
        label: resource.label,
        detail: resource.detail,
        url: resource.url,
        estimate: resource.estimate,
      })
      .select("*")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setResources((prev) => [...prev, data as CandidateSpecificResource]);
    setAdding(false);
  }

  async function remove(id: string) {
    const previous = resources;
    setResources((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("candidate_specific_resources").delete().eq("id", id);
    if (error) {
      setResources(previous);
      setError(error.message);
    }
  }

  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="section-title">📎 Just For Them</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!loading &&
        resources.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{r.label}</p>
              {(r.detail || r.estimate) && (
                <p className="truncate text-xs text-slate-500">
                  {r.detail}
                  {r.estimate && <span> · {r.estimate}</span>}
                </p>
              )}
            </div>
            <button
              className="btn-icon shrink-0"
              onClick={() => remove(r.id)}
              aria-label={`Remove ${r.label}`}
            >
              ✕
            </button>
          </div>
        ))}
      {adding ? (
        <div className="space-y-2 rounded-lg bg-navy px-3 py-2">
          {libraryResources.length > 0 && (
            <LibraryResourcePicker resources={libraryResources} onPick={sendFromLibrary} />
          )}
          <input
            className="input"
            placeholder="Label (e.g. 🎧 Audio Name)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="input"
            placeholder="Detail (optional)"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          <input
            className="input"
            placeholder="Link (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="btn-primary flex-1" onClick={send} disabled={saving || !label.trim()}>
              {saving ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary w-full" onClick={() => setAdding(true)}>
          + Send a Resource
        </button>
      )}
    </div>
  );
}

// Filling in for a downline only ever covers their pipeline numbers
// (Tally tab) - their roadmap steps, notes, and launch status stay
// theirs to manage, not something an upline should be nudging around.
// Sending a resource is different: low-stakes, helpful, and exactly the
// kind of thing an upline should be able to do for a downline's prospect
// without waiting on them - so this view is deliberately minimal, read
// -only except for CandidateResourceSender.
// Sending a resource directly to a team member is different from
// DownlineCandidateResources/CandidateResourceSender below - this isn't
// about one of their prospects, it's for someone already on the team and
// onboarded, any time you want ("here's something I want you to see"),
// not gated to a candidate step or onboarding session. Writes to
// member_resources, keyed to the recipient's own auth id; they see it on
// their own Onboarding page under "🎁 Sent To You".
function MemberResourceSender({ recipientId, recipientName }: { recipientId: string; recipientName: string }) {
  const [sent, setSent] = useState<MemberResource[]>([]);
  const [libraryResources, setLibraryResources] = useState<OptionalResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data }, { data: libraryRows }] = await Promise.all([
        supabase
          .from("member_resources")
          .select("*")
          .eq("recipient_id", recipientId)
          .order("created_at", { ascending: true }),
        supabase.from("optional_resources").select("*").order("label", { ascending: true }),
      ]);
      if (!cancelled) {
        setSent((data as MemberResource[]) ?? []);
        setLibraryResources((libraryRows as OptionalResource[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [recipientId]);

  async function send() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("member_resources")
      .insert({
        recipient_id: recipientId,
        label: trimmedLabel,
        detail: detail.trim(),
        url: url.trim() || null,
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent((prev) => [...prev, data as MemberResource]);
    setLabel("");
    setDetail("");
    setUrl("");
    setAdding(false);
    fireNotifyEvent({ kind: "member_resource_sent", targetUserId: recipientId, resourceLabel: trimmedLabel });
  }

  async function sendFromLibrary(resource: OptionalResource) {
    setError(null);
    const { data, error } = await supabase
      .from("member_resources")
      .insert({
        recipient_id: recipientId,
        label: resource.label,
        detail: resource.detail,
        url: resource.url,
        estimate: resource.estimate,
      })
      .select("*")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setSent((prev) => [...prev, data as MemberResource]);
    setAdding(false);
    fireNotifyEvent({ kind: "member_resource_sent", targetUserId: recipientId, resourceLabel: resource.label });
  }

  async function remove(id: string) {
    const previous = sent;
    setSent((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("member_resources").delete().eq("id", id);
    if (error) {
      setSent(previous);
      setError(error.message);
    }
  }

  return (
    <div className="card space-y-2">
      <p className="section-title">Send a Resource to {recipientName} Directly</p>
      <p className="text-xs text-slate-400">
        For {recipientName} themselves — not one of their prospects. Shows up on their own
        Onboarding page under &quot;Sent To You,&quot; any time, not tied to a session.
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!loading &&
        sent.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{r.label}</p>
              {(r.detail || r.estimate) && (
                <p className="truncate text-xs text-slate-500">
                  {r.detail}
                  {r.estimate && <span> · {r.estimate}</span>}
                </p>
              )}
            </div>
            <button className="btn-icon shrink-0" onClick={() => remove(r.id)} aria-label={`Remove ${r.label}`}>
              ✕
            </button>
          </div>
        ))}
      {adding ? (
        <div className="space-y-2 rounded-lg bg-navy px-3 py-2">
          {libraryResources.length > 0 && (
            <LibraryResourcePicker resources={libraryResources} onPick={sendFromLibrary} />
          )}
          <input
            className="input"
            placeholder="Label (e.g. 🎧 Audio Name)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="input"
            placeholder="Detail (optional)"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          <input
            className="input"
            placeholder="Link (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="btn-primary flex-1" onClick={send} disabled={saving || !label.trim()}>
              {saving ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary w-full" onClick={() => setAdding(true)}>
          + Send a Resource
        </button>
      )}
    </div>
  );
}

// Full parity with an upline's own Candidate Roadmap - advance/reverse
// step, Mark Launched/Filtered Out, edit Connected/Time zone/Notes, copy
// the invite link, book a meeting, everything CandidateCard already
// does for your own candidates. Reuses that exact component (rather
// than a separate read-only row) now that candidates' RLS carries the
// same "upline can update, not just read" exception pipeline_periods
// already had (see "Candidate Roadmap: upline fill-in" in
// supabase/schema.sql) - the only thing still off-limits is adding a
// brand new candidate or permanently deleting one on someone else's
// behalf, neither of which "filling in" for an existing roster needs.
function DownlineCandidateResources({ actingFor }: { actingFor: DownlineOption }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [stepFilter, setStepFilter] = useState<"all" | number>("all");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const staleThresholdIso = isoDaysAgo(STALE_CANDIDATE_DAYS);

  // Inserts under actingFor's own ownerId, not the caller's - candidates
  // RLS carries an upline-insert exception for exactly this (see
  // "Candidate Roadmap: upline fill-in" in supabase/schema.sql).
  async function addCandidate() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setAddError(null);
    const { data, error } = await supabase
      .from("candidates")
      .insert({ name, user_id: actingFor.ownerId })
      .select("*")
      .single();
    if (error) {
      setAddError(error.message);
    } else if (data) {
      setCandidates((prev) => [data as Candidate, ...prev]);
      setNewName("");
    }
    setAdding(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("user_id", actingFor.ownerId)
        .order("current_step", { ascending: false });
      if (!cancelled) {
        setCandidates((data as Candidate[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [actingFor.ownerId]);

  async function updateCandidate(id: string, patch: Partial<Candidate>) {
    const previous = candidates.find((c) => c.id === id);
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase
      .from("candidates")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      // Revert - otherwise a failed step move/status change still shows
      // as if it saved.
      if (previous) {
        setCandidates((prev) => prev.map((c) => (c.id === id ? previous : c)));
      }
      setUpdateError(error.message);
    } else {
      setUpdateError(null);
      // Deliberately skips try_claim_pipeline_threshold_notification /
      // the pipeline_5plus push the main list's own updateCandidate
      // fires - that RPC and its notify route both resolve "whose
      // threshold" and "whose upline to tell" from the CALLER's own
      // session, not an explicit target, so firing it here would
      // credit this account's own 5+ milestone instead of the person
      // actually being filled in for. Same reasoning skips
      // candidate_launched here too.
    }
  }

  function moveStep(candidate: Candidate, delta: number) {
    const next = Math.min(
      CANDIDATE_STEPS.length - 1,
      Math.max(0, candidate.current_step + delta)
    );
    if (next === candidate.current_step) return;
    updateCandidate(candidate.id, { current_step: next });
  }

  const active = candidates.filter((c) => !c.launched && !c.filtered_out);
  const launched = candidates.filter((c) => c.launched);
  const filteredActive =
    stepFilter === "all" ? active : active.filter((c) => c.current_step === stepFilter);

  return (
    <>
      <MemberResourceSender recipientId={actingFor.id} recipientName={actingFor.name} />

      <div className="card space-y-1">
        <p className="section-title">Send a Resource to {actingFor.name}&apos;s Prospects</p>
        <p className="text-xs text-slate-400">
          As their upline, you can send a specific podcast, book, or article straight to one of
          their prospects — it shows up in that person&apos;s resources right away.
        </p>
      </div>

      <div className="card space-y-2">
        <p className="section-title">Add Candidate for {actingFor.name}</p>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Candidate name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCandidate()}
          />
          <button className="btn-primary" onClick={addCandidate} disabled={adding || !newName.trim()}>
            Add
          </button>
        </div>
        {addError && <p className="text-xs text-red-400">{addError}</p>}
      </div>

      {active.length > 0 && (
        <select
          className="input"
          value={stepFilter === "all" ? "all" : String(stepFilter)}
          onChange={(e) => setStepFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">All Steps</option>
          {CANDIDATE_STEPS.map((step, i) => (
            <option key={i} value={i}>
              {i + 1}. {step.label}
            </option>
          ))}
        </select>
      )}

      {loading ? (
        <SkeletonRows rows={3} />
      ) : candidates.length === 0 ? (
        <div className="empty-state">No candidates for {actingFor.name} yet.</div>
      ) : (
        <>
          {filteredActive.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              onMoveStep={moveStep}
              onUpdate={updateCandidate}
              isStale={candidate.updated_at < staleThresholdIso}
            />
          ))}

          {filteredActive.length === 0 && (
            <p className="empty-state">
              {active.length === 0
                ? `No active candidates for ${actingFor.name} right now.`
                : "Nobody's at that step right now."}
            </p>
          )}

          {launched.length > 0 && (
            <div className="space-y-2">
              <p className="section-title px-1">Launched 🎉</p>
              {launched.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  onMoveStep={moveStep}
                  onUpdate={updateCandidate}
                />
              ))}
            </div>
          )}
        </>
      )}

      {updateError && <p className="text-xs text-red-400">{updateError}</p>}
    </>
  );
}
