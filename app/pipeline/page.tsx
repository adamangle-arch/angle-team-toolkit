"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import TrendChart from "@/components/TrendChart";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import { supabase } from "@/lib/supabaseClient";
import {
  PIPELINE_STAGES,
  CANDIDATE_STEPS,
  ACTIVE_PIPELINE_MIN_STEP,
  type PipelineStageKey,
} from "@/lib/constants";
import {
  getMonthStartOffset,
  getWeekStartOffset,
  getDateOffset,
  formatDateLabel,
  formatMonthLabel,
  formatWeekRangeLabel,
  formatShortDateLabel,
  formatShortMonthLabel,
} from "@/lib/dates";
import { fireNotifyEvent } from "@/lib/notifyClient";
import type { PipelinePeriod, Candidate, Profile } from "@/lib/types";

type PeriodType = "daily" | "weekly" | "monthly";

type DownlineOption = { id: string; ownerId: string; name: string };

// offset = 0 is the current day/week/month, 1 is one back, etc. - mirrors
// the same back-navigation already on the Team tab's Teams view and the
// Leaderboard's monthly nav.
function periodStartFor(periodType: PeriodType, offset: number): string {
  if (periodType === "daily") return getDateOffset(offset);
  if (periodType === "weekly") return getWeekStartOffset(offset);
  return getMonthStartOffset(offset);
}

function periodLabelFor(periodType: PeriodType, periodStart: string): string {
  if (periodType === "daily") return formatDateLabel(periodStart);
  if (periodType === "weekly") return formatWeekRangeLabel(periodStart);
  return formatMonthLabel(periodStart);
}

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
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

export default function PipelinePage() {
  const { user, ownerId } = useAuth();
  const [tab, setTab] = useState<Tab>("tally");
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
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
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [trendStage, setTrendStage] = useState<PipelineStageKey>("questions");
  const [trendHistory, setTrendHistory] = useState<PipelinePeriod[]>([]);
  const [showActiveSummary, setShowActiveSummary] = useState(false);

  // History tab - reuses the same `candidates` already loaded for the
  // Candidate Roadmap tab (every candidate for this owner, not just
  // active ones), just filtered down to one month at a time.
  const [monthsBack, setMonthsBack] = useState(0);

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
        .select("id,first_name,last_name,household_id")
        .in("id", downlineIds);
      if (!cancelled) {
        const options = (
          (profiles as Pick<Profile, "id" | "first_name" | "last_name" | "household_id">[]) ?? []
        )
          .map((p) => ({
            id: p.id,
            ownerId: p.household_id ?? p.id,
            name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed",
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
          setLoadError(insertError.message);
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
          })
          .select("*")
          .single();
        if (error) {
          setPeriod((prev) => (prev ? { ...prev, [key]: previousValue } : prev));
          setUpdateError(error.message);
        } else {
          setPeriod(created as PipelinePeriod);
          setUpdateError(null);
        }
        return;
      }

      const { error } = await supabase
        .from("pipeline_periods")
        .update({ [key]: nextValue, updated_at: new Date().toISOString() })
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

  const questions = period?.questions ?? 0;
  const launches = period?.launches ?? 0;

  // Filtered-out candidates disappear from the active roadmap once they're
  // filtered out — they only live on in the Candidate History tab.
  // Sorted furthest-along-first (not just newest-first) so the people
  // closest to launching - the ones who most need attention - are the
  // first thing you see, not buried under whoever was added most
  // recently. Array.prototype.sort is stable, so candidates on the same
  // step keep their existing (newest-first) relative order.
  const active = candidates
    .filter((c) => !c.launched && !c.filtered_out)
    .sort((a, b) => b.current_step - a.current_step);
  const launched = candidates.filter((c) => c.launched);
  const activeInPipeline = active.filter((c) => c.current_step >= ACTIVE_PIPELINE_MIN_STEP);
  const activeInPipelineCount = activeInPipeline.length;

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
                <select
                  className="select"
                  value={actingForId}
                  onChange={(e) => setActingForId(e.target.value)}
                >
                  <option value="">Me</option>
                  {downlineOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {actingFor && (
                  <p className="text-xs text-amber-light">
                    ✏️ You&apos;re editing {actingFor.name}&apos;s pipeline numbers, not your own.
                  </p>
                )}
              </div>
            )}

            <div className="card flex items-center justify-between">
              <div>
                <p className="section-title">Questions → Launches</p>
                <p className="text-xs text-slate-400">Overall conversion</p>
              </div>
              <p className="text-3xl font-bold text-amber">{pct(launches, questions)}</p>
            </div>

            {updateError && (
              <div className="card">
                <p className="text-xs text-red-400">{updateError}</p>
              </div>
            )}

            {loadError ? (
              <div className="empty-state">Couldn&apos;t load this period: {loadError}</div>
            ) : loading || !period ? (
              <div className="empty-state">Loading pipeline…</div>
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
          </>
        )}

        {tab === "roadmap" &&
          (actingFor ? (
            <div className="empty-state">
              Switch back to &quot;Me&quot; on the Tally tab to see the Candidate Roadmap — filling
              in only covers {actingFor.name}&apos;s pipeline numbers, not their individual
              candidates.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-1 pt-2">
                <p className="section-title">Candidate Roadmap</p>
                <button
                  className="pill pill-amber"
                  onClick={() => setShowActiveSummary((s) => !s)}
                >
                  {activeInPipelineCount} active in pipeline
                </button>
              </div>

              {showActiveSummary && (
                <div className="card space-y-1.5">
                  <p className="section-title">Who&apos;s Active</p>
                  {activeInPipeline.length === 0 ? (
                    <p className="text-sm text-slate-400">No one active in the pipeline right now.</p>
                  ) : (
                    activeInPipeline.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">{c.name}</span>
                        <span className="pill">{CANDIDATE_STEPS[c.current_step].label}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="card space-y-2">
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

              {loadingCandidates ? (
                <div className="empty-state">Loading candidates…</div>
              ) : candidates.length === 0 ? (
                <div className="empty-state">No candidates yet. Add your first one above.</div>
              ) : (
                <>
                  {active.map((candidate) => (
                    <CandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      onMoveStep={moveStep}
                      onUpdate={updateCandidate}
                    />
                  ))}

                  {active.length === 0 && (
                    <p className="empty-state">No active candidates right now.</p>
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
              <div className="empty-state">Loading candidates…</div>
            ) : candidatesThisMonth.length === 0 ? (
              <div className="empty-state">
                {candidates.length === 0
                  ? "No candidates yet. Add one from the Candidate Roadmap tab."
                  : `No candidates connected in ${formatMonthLabel(historyMonthStart)}.`}
              </div>
            ) : (
              <div className="card space-y-2">
                <div className="no-scrollbar overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="pb-1 pr-2 font-medium">Connected</th>
                        <th className="pb-1 pr-2 font-medium">Name</th>
                        <th className="pb-1 pr-2 font-medium">Status</th>
                        <th className="pb-1 pr-2 font-medium">Notes</th>
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
                            <td className="py-1.5">
                              {(c.launched || c.filtered_out) && (
                                <button
                                  className="pill"
                                  onClick={() =>
                                    updateCandidate(c.id, { launched: false, filtered_out: false })
                                  }
                                >
                                  Restore
                                </button>
                              )}
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
    </FeatureGate>
  );
}

function CandidateCard({
  candidate,
  onMoveStep,
  onUpdate,
}: {
  candidate: Candidate;
  onMoveStep: (candidate: Candidate, delta: number) => void;
  onUpdate: (id: string, patch: Partial<Candidate>) => void;
}) {
  const [notes, setNotes] = useState(candidate.notes);
  const [codeCopied, setCodeCopied] = useState(false);
  const step = CANDIDATE_STEPS[candidate.current_step];
  const isSettled = candidate.launched || candidate.filtered_out;

  async function copyAccessCode() {
    const message = `Check out these resources: ${window.location.origin}/prospect — your code is ${candidate.access_code}`;
    await navigator.clipboard.writeText(message);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  return (
    <div className={`card space-y-3 ${isSettled ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">{candidate.name}</p>
          <p className="pill-amber mt-1">
            Step {candidate.current_step + 1}/{CANDIDATE_STEPS.length}: {step.label}
          </p>
          {candidate.access_code && (
            <button className="pill mt-1" onClick={copyAccessCode}>
              {codeCopied ? "✓ Copied!" : `🔑 Code: ${candidate.access_code}`}
            </button>
          )}
        </div>
        {!isSettled ? (
          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              className="btn-primary"
              onClick={() => onUpdate(candidate.id, { launched: true, filtered_out: false })}
            >
              Mark Launched
            </button>
            <button
              className="btn-danger"
              onClick={() => onUpdate(candidate.id, { filtered_out: true, launched: false })}
            >
              Filtered Out
            </button>
          </div>
        ) : (
          <button
            className="btn-secondary shrink-0"
            onClick={() => onUpdate(candidate.id, { launched: false, filtered_out: false })}
          >
            Restore
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-400">
        <span className="shrink-0 font-medium text-slate-300">Connected:</span>
        <input
          type="date"
          className="input"
          value={candidate.connected_date}
          onChange={(e) => onUpdate(candidate.id, { connected_date: e.target.value })}
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          className="btn-secondary flex-1"
          onClick={() => onMoveStep(candidate, -1)}
          disabled={candidate.current_step === 0}
        >
          ← Back
        </button>
        <button
          className="btn-primary flex-1"
          onClick={() => onMoveStep(candidate, 1)}
          disabled={candidate.current_step === CANDIDATE_STEPS.length - 1}
        >
          Advance →
        </button>
      </div>

      <textarea
        className="textarea"
        placeholder="Notes…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes !== candidate.notes) onUpdate(candidate.id, { notes });
        }}
      />
    </div>
  );
}
