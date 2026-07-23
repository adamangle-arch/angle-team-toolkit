"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import { CHECKLIST_CATEGORIES } from "@/lib/constants";
import { daysBetween, getToday } from "@/lib/dates";
import type { ChecklistSettings, ChecklistTask } from "@/lib/types";

export default function ChecklistPage() {
  const [settings, setSettings] = useState<ChecklistSettings | null>(null);
  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: settingsData }, { data: tasksData }] = await Promise.all([
        supabase.from("checklist_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("checklist_tasks").select("*").order("sort_order"),
      ]);
      setSettings((settingsData as ChecklistSettings) ?? { id: 1, start_date: getToday() });
      setTasks((tasksData as ChecklistTask[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function toggleTask(task: ChecklistTask) {
    const completed = !task.completed;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed } : t))
    );
    await supabase
      .from("checklist_tasks")
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq("id", task.id);
  }

  async function restart() {
    const today = getToday();
    setSettings((prev) => (prev ? { ...prev, start_date: today } : prev));
    setTasks((prev) => prev.map((t) => ({ ...t, completed: false })));
    await Promise.all([
      supabase.from("checklist_settings").update({ start_date: today }).eq("id", 1),
      supabase.from("checklist_tasks").update({ completed: false, completed_at: null }).neq(
        "id",
        "00000000-0000-0000-0000-000000000000"
      ),
    ]);
  }

  const dayNumber = useMemo(() => {
    if (!settings) return 1;
    return daysBetween(settings.start_date, getToday()) + 1;
  }, [settings]);

  const completedCount = tasks.filter((t) => t.completed).length;
  const displayDay = Math.min(Math.max(dayNumber, 1), 30);

  return (
    <>
      <PageHeader title="First 30 Days" subtitle="Your launch checklist" />
      <main className="page-main">
        <div className="card flex items-center justify-between">
          <div>
            <p className="section-title">Day {displayDay} of 30</p>
            <p className="text-xs text-slate-400">
              {completedCount}/{tasks.length} tasks complete
              {dayNumber > 30 ? " • program complete" : ""}
            </p>
          </div>
          <button className="btn-secondary" onClick={restart}>
            Restart
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading checklist…</div>
        ) : (
          CHECKLIST_CATEGORIES.map((category) => {
            const categoryTasks = tasks.filter((t) => t.category === category);
            return (
              <div key={category} className="card space-y-2">
                <p className="section-title">{category}</p>
                <div className="space-y-1">
                  {categoryTasks.map((task) => (
                    <label
                      key={task.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 active:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleTask(task)}
                        className="h-5 w-5 shrink-0 accent-amber"
                      />
                      <span
                        className={
                          task.completed
                            ? "text-sm text-slate-500 line-through"
                            : "text-sm text-slate-200"
                        }
                      >
                        {task.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </main>
    </>
  );
}
