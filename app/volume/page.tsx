"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { getMonthStart, formatMonthLabel } from "@/lib/dates";
import type { MonthlyPv } from "@/lib/types";

export default function VolumePage() {
  const { user } = useAuth();
  const periodStart = getMonthStart();

  const [pvInput, setPvInput] = useState("0");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<MonthlyPv[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [{ data: mine }, { data: past }] = await Promise.all([
        supabase
          .from("monthly_pv")
          .select("*")
          .eq("user_id", user.id)
          .eq("period_start", periodStart)
          .maybeSingle(),
        supabase
          .from("monthly_pv")
          .select("*")
          .eq("user_id", user.id)
          .order("period_start", { ascending: false })
          .limit(6),
      ]);

      if (!cancelled) {
        setPvInput(String(mine?.pv ?? 0));
        setHistory(((past as MonthlyPv[]) ?? []).filter((p) => p.period_start !== periodStart));
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user.id, periodStart]);

  async function save() {
    const pv = Math.max(0, parseInt(pvInput, 10) || 0);
    setSaving(true);
    setSaved(false);
    await supabase
      .from("monthly_pv")
      .upsert(
        { user_id: user.id, period_start: periodStart, pv, updated_at: new Date().toISOString() },
        { onConflict: "user_id,period_start" }
      );
    setPvInput(String(pv));
    setSaving(false);
    setSaved(true);
  }

  return (
    <>
      <PageHeader title="Volume" subtitle={formatMonthLabel(periodStart)} />
      <main className="page-main">
        <div className="card space-y-2">
          <p className="section-title">Your Personal Circle PV</p>
          <p className="text-xs text-slate-400">
            300+ PV puts you on the Core 300 leaderboard for everyone to see.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              className="input"
              value={pvInput}
              onChange={(e) => {
                setPvInput(e.target.value);
                setSaved(false);
              }}
            />
            <button className="btn-primary shrink-0" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {saved && <p className="text-xs text-amber-light">Saved.</p>}
        </div>

        <div className="card space-y-1.5">
          <p className="section-title">Recent Months</p>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-400">No past months recorded yet.</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-200">{formatMonthLabel(h.period_start)}</span>
                <span className="pill">{h.pv} PV</span>
              </div>
            ))
          )}
        </div>
      </main>
    </>
  );
}
