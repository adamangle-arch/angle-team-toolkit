"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import { SkeletonList } from "@/components/Skeleton";
import { supabase } from "@/lib/supabaseClient";
import { getWeekStart, getMonthStart } from "@/lib/dates";
import {
  GOAL_ITEMS_BY_PERIOD,
  GOAL_PERIODS,
  type GoalMetric,
  type GoalPeriod,
} from "@/lib/constants";
import type { Goal, PipelinePeriod, Profile } from "@/lib/types";

function inputKey(metric: GoalMetric, period: GoalPeriod): string {
  return `${metric}:${period}`;
}

type DreamField = "dream_5_year" | "dream_10_year" | "dream_lifetime";

const DREAM_FIELDS: { key: DreamField; label: string; placeholder: string }[] = [
  {
    key: "dream_5_year",
    label: "5 Year Dream",
    placeholder: "Where do you want to be in 5 years? Write whatever comes to mind…",
  },
  {
    key: "dream_10_year",
    label: "10 Year Dream",
    placeholder: "What does 10 years from now look like?",
  },
  {
    key: "dream_lifetime",
    label: "Lifetime Dream",
    placeholder: "The big one — what are you ultimately building toward?",
  },
];

// A plain, unbounded textarea rather than the numeric goal inputs above -
// these are meant to be written freely, not filled into a form. Local
// edit buffer + save-on-blur mirrors the same pattern used for candidate
// notes elsewhere in the app (Pipeline Tracker), so typing doesn't fire a
// save on every keystroke.
function DreamTextarea({
  label,
  placeholder,
  value,
  onSave,
}: {
  label: string;
  placeholder: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  // Adjust local state in response to the loaded value arriving after
  // this mounts (profile fetch resolves after initial render) - done
  // during render per React's "adjusting state" pattern rather than an
  // effect, so it can't fire after the rep has already started typing.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(value);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-slate-200">{label}</p>
      <textarea
        className="textarea"
        rows={4}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== value) onSave(text);
        }}
      />
    </div>
  );
}

export default function GoalsPage() {
  const { user, ownerId } = useAuth();
  const [goalRows, setGoalRows] = useState<Goal[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [qi1Weekly, setQi1Weekly] = useState(0);
  const [qi1Monthly, setQi1Monthly] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dreams, setDreams] = useState<Record<DreamField, string>>({
    dream_5_year: "",
    dream_10_year: "",
    dream_lifetime: "",
  });

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("goals").select("*").eq("user_id", user.id);
      const rows = (data as Goal[]) ?? [];
      setGoalRows(rows);
      const map: Record<string, string> = {};
      for (const g of rows) map[inputKey(g.metric, g.period)] = g.target > 0 ? String(g.target) : "";
      setInputs(map);
      setLoading(false);
    }
    load();
  }, [user.id]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("dream_5_year,dream_10_year,dream_lifetime")
        .eq("id", user.id)
        .single();
      if (data) {
        const d = data as Pick<Profile, "dream_5_year" | "dream_10_year" | "dream_lifetime">;
        setDreams({
          dream_5_year: d.dream_5_year ?? "",
          dream_10_year: d.dream_10_year ?? "",
          dream_lifetime: d.dream_lifetime ?? "",
        });
      }
    }
    load();
  }, [user.id]);

  async function saveDream(field: DreamField, value: string) {
    setDreams((prev) => ({ ...prev, [field]: value }));
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    if (error) {
      setSaveError(`Couldn't save that: ${error.message}`);
    } else {
      setSaveError(null);
    }
  }

  // QI1s already has a real, reliable per-period number (the same one
  // the Pipeline Tracker counters write to), unlike the other goal
  // metrics - so it's safe to show the actual count here without
  // reintroducing the confusing actual-vs-target display that was
  // dropped for everything else.
  useEffect(() => {
    async function load() {
      const [{ data: w }, { data: m }] = await Promise.all([
        supabase
          .from("pipeline_periods")
          .select("qi1")
          .eq("user_id", ownerId)
          .eq("period_type", "weekly")
          .eq("period_start", getWeekStart())
          .maybeSingle(),
        supabase
          .from("pipeline_periods")
          .select("qi1")
          .eq("user_id", ownerId)
          .eq("period_type", "monthly")
          .eq("period_start", getMonthStart())
          .maybeSingle(),
      ]);
      setQi1Weekly((w as Pick<PipelinePeriod, "qi1"> | null)?.qi1 ?? 0);
      setQi1Monthly((m as Pick<PipelinePeriod, "qi1"> | null)?.qi1 ?? 0);
    }
    load();
  }, [ownerId]);

  function targetFor(metric: GoalMetric, period: GoalPeriod): number {
    return goalRows.find((g) => g.metric === metric && g.period === period)?.target ?? 0;
  }

  async function setTarget(metric: GoalMetric, period: GoalPeriod, target: number) {
    setGoalRows((prev) => {
      const existing = prev.find((g) => g.metric === metric && g.period === period);
      if (existing) return prev.map((g) => (g === existing ? { ...g, target } : g));
      return [...prev, { id: "", user_id: user.id, metric, period, target, updated_at: "" }];
    });
    const { data, error } = await supabase
      .from("goals")
      .upsert({ user_id: user.id, metric, period, target }, { onConflict: "user_id,metric,period" })
      .select("*")
      .single();
    if (error) {
      setSaveError(`Couldn't save that goal: ${error.message}`);
    } else if (data) {
      setSaveError(null);
      const row = data as Goal;
      setGoalRows((prev) => [
        ...prev.filter((g) => !(g.metric === row.metric && g.period === row.period)),
        row,
      ]);
    }
  }

  function qi1CountFor(period: GoalPeriod): number | null {
    if (period === "weekly") return qi1Weekly;
    if (period === "monthly") return qi1Monthly;
    return null;
  }

  return (
    <FeatureGate minSession={5}>
      <PageHeader title="Goals" subtitle="Your goal today is:" />
      <main className="page-main">
        {saveError && (
          <div className="card">
            <p className="text-xs text-red-400">{saveError}</p>
          </div>
        )}

        <div className="card space-y-4">
          <div>
            <p className="section-title">Your Dreams</p>
            <p className="text-xs text-slate-400">
              The big picture — why you&apos;re doing any of this. Write whatever&apos;s true for
              you; your upline can see it so they know how to help you get there.
            </p>
          </div>
          {DREAM_FIELDS.map((field) => (
            <DreamTextarea
              key={field.key}
              label={field.label}
              placeholder={field.placeholder}
              value={dreams[field.key]}
              onSave={(value) => saveDream(field.key, value)}
            />
          ))}
        </div>

        {loading ? (
          <SkeletonList cards={2} lines={3} />
        ) : (
          GOAL_PERIODS.map((period) => (
            <div key={period.key} className="card space-y-3">
              <p className="section-title">{period.label}</p>
              <p className="text-xs text-slate-400">
                Stays the same until you change it.
              </p>
              {GOAL_ITEMS_BY_PERIOD[period.key].map((item) => {
                const qi1Count = item.key === "qi1s" ? qi1CountFor(period.key) : null;
                return (
                  <div key={item.key} className="flex items-center gap-2 text-sm text-slate-200">
                    {item.prefix && <span>{item.prefix}</span>}
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="input !w-16 !p-1.5 text-center"
                      value={inputs[inputKey(item.key, period.key)] ?? ""}
                      onChange={(e) =>
                        setInputs((prev) => ({
                          ...prev,
                          [inputKey(item.key, period.key)]: e.target.value,
                        }))
                      }
                      onBlur={(e) => {
                        const parsed = Math.max(0, parseInt(e.target.value, 10) || 0);
                        setInputs((prev) => ({
                          ...prev,
                          [inputKey(item.key, period.key)]: parsed > 0 ? String(parsed) : "",
                        }));
                        if (parsed !== targetFor(item.key, period.key)) {
                          setTarget(item.key, period.key, parsed);
                        }
                      }}
                    />
                    <span>{item.suffix}</span>
                    {qi1Count !== null && (
                      <span className="text-xs text-amber-light">
                        (you&apos;ve shown {qi1Count} so far)
                      </span>
                    )}
                  </div>
                );
              })}
              {period.key === "daily" && (
                <p className="text-xs text-amber-light">
                  📋 Check Upline on what your daily goal should be.
                </p>
              )}
            </div>
          ))
        )}
      </main>
    </FeatureGate>
  );
}
