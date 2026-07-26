"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { GOAL_ITEMS, type GoalMetric } from "@/lib/constants";
import type { Goal } from "@/lib/types";

export default function GoalsPage() {
  const { user } = useAuth();
  const [goalRows, setGoalRows] = useState<Goal[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("goals").select("*").eq("user_id", user.id);
      const rows = (data as Goal[]) ?? [];
      setGoalRows(rows);
      const map: Record<string, string> = {};
      for (const g of rows) map[g.metric] = g.target > 0 ? String(g.target) : "";
      setInputs(map);
      setLoading(false);
    }
    load();
  }, [user.id]);

  function targetFor(metric: GoalMetric): number {
    return goalRows.find((g) => g.metric === metric)?.target ?? 0;
  }

  async function setTarget(metric: GoalMetric, target: number) {
    setGoalRows((prev) => {
      const existing = prev.find((g) => g.metric === metric);
      if (existing) return prev.map((g) => (g === existing ? { ...g, target } : g));
      return [...prev, { id: "", user_id: user.id, metric, target, updated_at: "" }];
    });
    const { data } = await supabase
      .from("goals")
      .upsert({ user_id: user.id, metric, target }, { onConflict: "user_id,metric" })
      .select("*")
      .single();
    if (data) {
      const row = data as Goal;
      setGoalRows((prev) => [...prev.filter((g) => g.metric !== row.metric), row]);
    }
  }

  return (
    <>
      <PageHeader title="Goals" subtitle="Your goal today is:" />
      <main className="page-main">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <div className="card space-y-3">
            <p className="section-title">Your goal today is:</p>
            <p className="text-xs text-slate-400">
              Stays the same every day until you change it.
            </p>
            {GOAL_ITEMS.map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-sm text-slate-200">
                {item.prefix && <span>{item.prefix}</span>}
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="input !w-16 !p-1.5 text-center"
                  value={inputs[item.key] ?? ""}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [item.key]: e.target.value }))
                  }
                  onBlur={(e) => {
                    const parsed = Math.max(0, parseInt(e.target.value, 10) || 0);
                    setInputs((prev) => ({
                      ...prev,
                      [item.key]: parsed > 0 ? String(parsed) : "",
                    }));
                    if (parsed !== targetFor(item.key)) setTarget(item.key, parsed);
                  }}
                />
                <span>{item.suffix}</span>
              </div>
            ))}
            <p className="text-xs text-amber-light">
              📋 Check Upline on what your daily goal should be.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
