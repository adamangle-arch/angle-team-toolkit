"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { getMonthStart, formatMonthLabel } from "@/lib/dates";
import type { MonthlyPv, CustomerSale } from "@/lib/types";

export default function VolumePage() {
  const { user } = useAuth();
  const periodStart = getMonthStart();

  const [pvInput, setPvInput] = useState("0");
  const [savingPv, setSavingPv] = useState(false);
  const [savedPv, setSavedPv] = useState(false);

  const [dittoInput, setDittoInput] = useState("0");
  const [savingDitto, setSavingDitto] = useState(false);
  const [savedDitto, setSavedDitto] = useState(false);

  const [history, setHistory] = useState<MonthlyPv[]>([]);
  const [loading, setLoading] = useState(true);

  const [sales, setSales] = useState<CustomerSale[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [saleDescription, setSaleDescription] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const [addingSale, setAddingSale] = useState(false);

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
        setDittoInput(String(mine?.day1_ditto_pv ?? 0));
        setHistory(((past as MonthlyPv[]) ?? []).filter((p) => p.period_start !== periodStart));
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user.id, periodStart]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingSales(true);
      const { data } = await supabase
        .from("customer_sales")
        .select("*")
        .eq("user_id", user.id)
        .eq("period_start", periodStart)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setSales((data as CustomerSale[]) ?? []);
        setLoadingSales(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user.id, periodStart]);

  async function savePv() {
    const pv = Math.max(0, parseInt(pvInput, 10) || 0);
    setSavingPv(true);
    setSavedPv(false);
    await supabase
      .from("monthly_pv")
      .upsert(
        { user_id: user.id, period_start: periodStart, pv, updated_at: new Date().toISOString() },
        { onConflict: "user_id,period_start" }
      );
    setPvInput(String(pv));
    setSavingPv(false);
    setSavedPv(true);
  }

  async function saveDitto() {
    const day1_ditto_pv = Math.max(0, parseInt(dittoInput, 10) || 0);
    setSavingDitto(true);
    setSavedDitto(false);
    await supabase
      .from("monthly_pv")
      .upsert(
        {
          user_id: user.id,
          period_start: periodStart,
          day1_ditto_pv,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,period_start" }
      );
    setDittoInput(String(day1_ditto_pv));
    setSavingDitto(false);
    setSavedDitto(true);
  }

  async function addSale() {
    const description = saleDescription.trim();
    if (!description) return;
    setAddingSale(true);
    const { data } = await supabase
      .from("customer_sales")
      .insert({
        user_id: user.id,
        period_start: periodStart,
        description,
        notes: saleNotes.trim(),
      })
      .select("*")
      .single();
    if (data) setSales((prev) => [data as CustomerSale, ...prev]);
    setSaleDescription("");
    setSaleNotes("");
    setAddingSale(false);
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
                setSavedPv(false);
              }}
            />
            <button className="btn-primary shrink-0" onClick={savePv} disabled={savingPv}>
              {savingPv ? "Saving…" : "Save"}
            </button>
          </div>
          {savedPv && <p className="text-xs text-amber-light">Saved.</p>}
        </div>

        <div className="card space-y-2">
          <p className="section-title">Day 1 Ditto</p>
          <p className="text-xs text-slate-400">
            How much of this month&apos;s PV came through a Ditto order on day 1. 100+ gets
            recognized on the Leaderboard.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              className="input"
              value={dittoInput}
              onChange={(e) => {
                setDittoInput(e.target.value);
                setSavedDitto(false);
              }}
            />
            <button className="btn-primary shrink-0" onClick={saveDitto} disabled={savingDitto}>
              {savingDitto ? "Saving…" : "Save"}
            </button>
          </div>
          {savedDitto && <p className="text-xs text-amber-light">Saved.</p>}
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
                <span className="flex gap-1.5">
                  <span className="pill">{h.pv} PV</span>
                  <span className="pill">{h.day1_ditto_pv} Ditto</span>
                </span>
              </div>
            ))
          )}
        </div>

        <div className="card space-y-2">
          <p className="section-title">Customer Sales</p>
          <input
            className="input"
            placeholder="Customer / what they bought"
            value={saleDescription}
            onChange={(e) => setSaleDescription(e.target.value)}
          />
          <textarea
            className="textarea"
            placeholder="Notes…"
            value={saleNotes}
            onChange={(e) => setSaleNotes(e.target.value)}
          />
          <button
            className="btn-primary w-full"
            onClick={addSale}
            disabled={addingSale || !saleDescription.trim()}
          >
            Add Sale
          </button>
        </div>

        {loadingSales ? (
          <div className="empty-state">Loading customer sales…</div>
        ) : sales.length === 0 ? (
          <div className="empty-state">No customer sales logged this month yet.</div>
        ) : (
          <div className="space-y-2">
            {sales.map((sale) => (
              <div key={sale.id} className="card space-y-1">
                <p className="font-medium text-white">{sale.description}</p>
                {sale.notes && <p className="text-sm text-slate-400">{sale.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
