"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import type { Goals, QuarterlyGoal } from "@/lib/types";

function currentQuarterLabel(): string {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `Q${quarter} ${now.getFullYear()}`;
}

export default function GoalsPage() {
  const [vision, setVision] = useState("");
  const [savedVision, setSavedVision] = useState("");
  const [quarterlyGoals, setQuarterlyGoals] = useState<QuarterlyGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const [newQuarter, setNewQuarter] = useState(currentQuarterLabel());
  const [newGoalText, setNewGoalText] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: goalsData }, { data: quarterlyData }] = await Promise.all([
        supabase.from("goals").select("*").eq("id", 1).maybeSingle(),
        supabase
          .from("quarterly_goals")
          .select("*")
          .order("quarter", { ascending: false })
          .order("sort_order"),
      ]);
      const g = goalsData as Goals | null;
      setVision(g?.vision ?? "");
      setSavedVision(g?.vision ?? "");
      setQuarterlyGoals((quarterlyData as QuarterlyGoal[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function saveVision() {
    if (vision === savedVision) return;
    setSavedVision(vision);
    await supabase
      .from("goals")
      .update({ vision, updated_at: new Date().toISOString() })
      .eq("id", 1);
  }

  async function addGoal() {
    const text = newGoalText.trim();
    const quarter = newQuarter.trim();
    if (!text || !quarter) return;
    setAdding(true);
    const { data } = await supabase
      .from("quarterly_goals")
      .insert({ quarter, text })
      .select("*")
      .single();
    if (data) {
      setQuarterlyGoals((prev) =>
        [data as QuarterlyGoal, ...prev].sort((a, b) =>
          b.quarter.localeCompare(a.quarter)
        )
      );
    }
    setNewGoalText("");
    setAdding(false);
  }

  async function toggleGoal(goal: QuarterlyGoal) {
    const completed = !goal.completed;
    setQuarterlyGoals((prev) =>
      prev.map((g) => (g.id === goal.id ? { ...g, completed } : g))
    );
    await supabase.from("quarterly_goals").update({ completed }).eq("id", goal.id);
  }

  async function deleteGoal(id: string) {
    setQuarterlyGoals((prev) => prev.filter((g) => g.id !== id));
    await supabase.from("quarterly_goals").delete().eq("id", id);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, QuarterlyGoal[]>();
    for (const g of quarterlyGoals) {
      const list = map.get(g.quarter) ?? [];
      list.push(g);
      map.set(g.quarter, list);
    }
    return Array.from(map.entries());
  }, [quarterlyGoals]);

  return (
    <>
      <PageHeader title="Goals" subtitle="Your vision and quarterly milestones" />
      <main className="page-main">
        <div className="card space-y-2">
          <p className="section-title">10-Year Vision</p>
          <textarea
            className="textarea min-h-40"
            placeholder="Where do you see yourself and your business in 10 years?"
            value={vision}
            onChange={(e) => setVision(e.target.value)}
            onBlur={saveVision}
            disabled={loading}
          />
        </div>

        <div className="card space-y-2">
          <p className="section-title">Add Quarterly Goal</p>
          <input
            className="input"
            placeholder="Quarter (e.g. Q3 2026)"
            value={newQuarter}
            onChange={(e) => setNewQuarter(e.target.value)}
          />
          <input
            className="input"
            placeholder="Goal"
            value={newGoalText}
            onChange={(e) => setNewGoalText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGoal()}
          />
          <button
            className="btn-primary w-full"
            onClick={addGoal}
            disabled={adding || !newGoalText.trim() || !newQuarter.trim()}
          >
            Add Goal
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading goals…</div>
        ) : grouped.length === 0 ? (
          <div className="empty-state">No quarterly goals yet.</div>
        ) : (
          grouped.map(([quarter, goals]) => (
            <div key={quarter} className="card space-y-1">
              <p className="section-title">{quarter}</p>
              {goals.map((goal) => (
                <div key={goal.id} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={goal.completed}
                    onChange={() => toggleGoal(goal)}
                    className="h-5 w-5 shrink-0 accent-amber"
                  />
                  <span
                    className={`flex-1 text-sm ${
                      goal.completed ? "text-slate-500 line-through" : "text-slate-200"
                    }`}
                  >
                    {goal.text}
                  </span>
                  <button
                    className="btn-icon !h-7 !w-7 text-sm"
                    onClick={() => deleteGoal(goal.id)}
                    aria-label="Delete goal"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </main>
    </>
  );
}
