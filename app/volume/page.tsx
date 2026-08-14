"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import TrendChart from "@/components/TrendChart";
import { SkeletonList, SkeletonRows } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import AverageLeaders from "@/components/AverageLeaders";
import PercentileNote from "@/components/PercentileNote";
import Fab from "@/components/Fab";
import { supabase } from "@/lib/supabaseClient";
import { fireNotifyEvent } from "@/lib/notifyClient";
import { getMonthStart, getMonthStartOffset, formatMonthLabel, formatShortMonthLabel } from "@/lib/dates";
import type { MonthlyPv, CustomerSale, SaleCategory, AverageLeaderEntry, AveragePercentileEntry } from "@/lib/types";

const CORE_300_TARGET = 300;
const DITTO_TARGET = 100;
const VOLUME_AVG_WINDOW = 6;
const MILESTONES: { threshold: number; emoji: string }[] = [
  { threshold: 100, emoji: "🟢" },
  { threshold: 200, emoji: "🟢" },
  { threshold: 300, emoji: "🏆" },
];

const SALE_CATEGORIES: SaleCategory[] = [
  "XS",
  "Nutrilite",
  "Artistry",
  "Amway Home",
  "Satinique",
  "G&H",
  "Glister",
  "iCook",
  "Other",
];

export default function VolumePage() {
  const { ownerId } = useAuth();
  const periodStart = getMonthStart();

  const [pvInput, setPvInput] = useState("0");
  const [savingPv, setSavingPv] = useState(false);
  const [savedPv, setSavedPv] = useState(false);
  const [pvError, setPvError] = useState<string | null>(null);

  const [dittoInput, setDittoInput] = useState("0");
  const [savingDitto, setSavingDitto] = useState(false);
  const [savedDitto, setSavedDitto] = useState(false);
  const [dittoError, setDittoError] = useState<string | null>(null);

  const [history, setHistory] = useState<MonthlyPv[]>([]);
  const [loading, setLoading] = useState(true);

  // Dedicated fetch for the averages below - deliberately separate from
  // `history` above (which is capped at the last 6 *saved* months for
  // Recent Months/the trend charts, and can therefore be one short of a
  // full window once the current month's own row is excluded from it).
  const [avgMonthlyRows, setAvgMonthlyRows] = useState<MonthlyPv[]>([]);
  // Company-wide top 3 for PV/Ditto per month (get_volume_average_leaders
  // in supabase/schema.sql) - not scoped to ownerId, fetched once on mount.
  const [volumeLeaders, setVolumeLeaders] = useState<AverageLeaderEntry[]>([]);
  const [volumeLeadersError, setVolumeLeadersError] = useState<string | null>(null);
  // Where ownerId's own PV/Ditto average falls against the team - see
  // get_volume_average_percentile in supabase/schema.sql.
  const [volumePercentiles, setVolumePercentiles] = useState<AveragePercentileEntry[]>([]);

  const [sales, setSales] = useState<CustomerSale[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [saleCategories, setSaleCategories] = useState<SaleCategory[]>(["Other"]);
  const [saleAmount, setSaleAmount] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const [addingSale, setAddingSale] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [{ data: mine }, { data: past }] = await Promise.all([
        supabase
          .from("monthly_pv")
          .select("*")
          .eq("user_id", ownerId)
          .eq("period_start", periodStart)
          .maybeSingle(),
        supabase
          .from("monthly_pv")
          .select("*")
          .eq("user_id", ownerId)
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
  }, [ownerId, periodStart]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const since = getMonthStartOffset(VOLUME_AVG_WINDOW);
      const [{ data }, { data: pct }] = await Promise.all([
        supabase
          .from("monthly_pv")
          .select("*")
          .eq("user_id", ownerId)
          .gte("period_start", since)
          .lt("period_start", periodStart),
        supabase.rpc("get_volume_average_percentile", { p_target_id: ownerId }),
      ]);
      if (!cancelled) {
        setAvgMonthlyRows((data as MonthlyPv[]) ?? []);
        setVolumePercentiles((pct as AveragePercentileEntry[]) ?? []);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ownerId, periodStart]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase.rpc("get_volume_average_leaders");
      if (!cancelled) {
        if (error) {
          setVolumeLeadersError(error.message);
        } else {
          setVolumeLeadersError(null);
          setVolumeLeaders((data as AverageLeaderEntry[]) ?? []);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingSales(true);
      const { data } = await supabase
        .from("customer_sales")
        .select("*")
        .eq("user_id", ownerId)
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
  }, [ownerId, periodStart]);

  const corePv = Math.max(0, parseInt(pvInput, 10) || 0);
  const corePct = Math.min(100, (corePv / CORE_300_TARGET) * 100);

  const dittoPv = Math.max(0, parseInt(dittoInput, 10) || 0);
  const dittoPct = Math.min(100, (dittoPv / DITTO_TARGET) * 100);

  const chartData = useMemo(() => {
    const past = history
      .slice()
      .sort((a, b) => a.period_start.localeCompare(b.period_start))
      .map((h) => ({ label: formatShortMonthLabel(h.period_start), value: h.pv }));
    return [...past, { label: formatShortMonthLabel(periodStart), value: corePv }];
  }, [history, corePv, periodStart]);

  const dittoChartData = useMemo(() => {
    const past = history
      .slice()
      .sort((a, b) => a.period_start.localeCompare(b.period_start))
      .map((h) => ({ label: formatShortMonthLabel(h.period_start), value: h.day1_ditto_pv }));
    return [...past, { label: formatShortMonthLabel(periodStart), value: dittoPv }];
  }, [history, dittoPv, periodStart]);

  const highestPv = useMemo(() => sales.reduce((max, s) => Math.max(max, s.amount), 0), [sales]);

  // How much PV/Ditto someone typically brings in per month - same
  // fairness principle as the Core Run and Pipeline averages: a month
  // with nothing logged still counts as a 0 (real consistency, not just
  // "how much on months you engage"), but the window is clamped to start
  // at the earliest month that actually has data, so a first-time user
  // isn't divided across 6 months that predate them.
  //
  // The current month is never counted, on top of that - it isn't over
  // yet, so a partial in-progress month would always look emptier than a
  // completed one purely because there's still time left in it.
  // avgMonthlyRows is fetched with an explicit "before this month" bound
  // already, so nothing here needs to filter the current month out.
  const monthlyAverages = useMemo(() => {
    const byMonth = new Map(avgMonthlyRows.map((r) => [r.period_start, { pv: r.pv, ditto: r.day1_ditto_pv }]));

    const firstStart = avgMonthlyRows.map((r) => r.period_start).sort()[0] ?? getMonthStartOffset(1);
    const theoretical = Array.from({ length: VOLUME_AVG_WINDOW }, (_, i) =>
      getMonthStartOffset(VOLUME_AVG_WINDOW - i)
    ).filter((s) => s >= firstStart);

    let pvTotal = 0;
    let dittoTotal = 0;
    for (const start of theoretical) {
      const row = byMonth.get(start);
      pvTotal += row?.pv ?? 0;
      dittoTotal += row?.ditto ?? 0;
    }
    const n = theoretical.length || 1;
    return { pvPerMonth: pvTotal / n, dittoPerMonth: dittoTotal / n, windowCount: theoretical.length };
  }, [avgMonthlyRows]);

  async function savePv() {
    const pv = Math.max(0, parseInt(pvInput, 10) || 0);
    setSavingPv(true);
    setSavedPv(false);
    setPvError(null);
    const { error } = await supabase
      .from("monthly_pv")
      .upsert(
        { user_id: ownerId, period_start: periodStart, pv, updated_at: new Date().toISOString() },
        { onConflict: "user_id,period_start" }
      );
    if (error) {
      setPvError(error.message);
    } else {
      setPvInput(String(pv));
      setSavedPv(true);
    }
    setSavingPv(false);
  }

  async function saveDitto() {
    const day1_ditto_pv = Math.max(0, parseInt(dittoInput, 10) || 0);
    setSavingDitto(true);
    setSavedDitto(false);
    setDittoError(null);
    const { error } = await supabase
      .from("monthly_pv")
      .upsert(
        {
          user_id: ownerId,
          period_start: periodStart,
          day1_ditto_pv,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,period_start" }
      );
    if (error) {
      setDittoError(error.message);
    } else {
      setDittoInput(String(day1_ditto_pv));
      setSavedDitto(true);
    }
    setSavingDitto(false);
  }

  function toggleSaleCategory(cat: SaleCategory) {
    setSaleCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function addSale() {
    if (saleCategories.length === 0) return;
    setAddingSale(true);
    setSaleError(null);
    const amount = Math.max(0, parseInt(saleAmount, 10) || 0);
    const { data, error } = await supabase
      .from("customer_sales")
      .insert({
        user_id: ownerId,
        period_start: periodStart,
        description: "",
        categories: saleCategories,
        amount,
        notes: saleNotes.trim(),
      })
      .select("*")
      .single();
    if (error) {
      setSaleError(error.message);
    } else if (data) {
      setSales((prev) => [data as CustomerSale, ...prev]);
      setSaleCategories(["Other"]);
      setSaleAmount("");
      setSaleNotes("");
      fireNotifyEvent({ kind: "customer_sale_logged" });
    }
    setAddingSale(false);
  }

  return (
    <FeatureGate minSession={2}>
      <PageHeader title="Volume" subtitle={formatMonthLabel(periodStart)} />
      <main className="page-main">
        <div className="card space-y-3">
          <p className="section-title">🚀 Personal Circle PV</p>
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
          {pvError && <p className="text-xs text-red-400">{pvError}</p>}

          <div className="pt-1">
            <div className="relative h-5 w-full rounded-full bg-white/10">
              <div
                className="h-5 rounded-full transition-all duration-300"
                style={{
                  width: `${corePct}%`,
                  background: "linear-gradient(135deg, var(--color-amber-light), var(--color-amber))",
                }}
              />
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/50" />
            </div>
            <div className="relative mt-1 h-4 text-[10px] text-slate-400">
              <span className="absolute left-1/2 -translate-x-1/2">150 PV</span>
              <span className="absolute right-0">300 PV</span>
            </div>
          </div>
          <p className="text-sm text-amber-light">{corePv} / {CORE_300_TARGET} PV</p>

          <div className="flex items-center justify-center gap-4 pt-1">
            {MILESTONES.map((m) => (
              <div
                key={m.threshold}
                className={`flex flex-col items-center gap-0.5 transition ${
                  corePv >= m.threshold ? "" : "opacity-30 grayscale"
                }`}
              >
                <span className="text-2xl leading-none">{m.emoji}</span>
                <span className="text-[10px] text-slate-400">{m.threshold} PV</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card space-y-2">
          <p className="section-title">Duplication Calculator</p>
          <p className="text-xs text-slate-400">
            Based on your Personal Circle PV above — what your group&apos;s PV would look like
            if that many people were duplicating you.
          </p>
          <div className="space-y-1.5">
            {[25, 50, 100].map((count) => {
              const dupPv = corePv * count;
              return (
                <div key={count} className="flex items-center justify-between rounded-lg bg-navy p-2">
                  <span className="text-sm text-slate-300">{count} people duplicating you</span>
                  <span className="pill-amber">{dupPv.toLocaleString()} PV</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card space-y-2">
          <p className="section-title">PV Trend</p>
          <TrendChart data={chartData} valueSuffix=" PV" />
        </div>

        <div className="card space-y-2">
          <p className="section-title">
            Your Averages (Last {monthlyAverages.windowCount}{" "}
            Month{monthlyAverages.windowCount === 1 ? "" : "s"})
          </p>
          {volumeLeadersError && <p className="text-xs text-red-400">{volumeLeadersError}</p>}
          <div className="space-y-1 rounded-lg bg-navy px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-200">🚀 PV per month</span>
              <span className="text-lg font-bold text-amber">
                {monthlyAverages.pvPerMonth.toFixed(1)}
              </span>
            </div>
            <PercentileNote entry={volumePercentiles.find((p) => p.metric === "pv")} />
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              🏆 Team Leaders
            </p>
            <AverageLeaders leaders={volumeLeaders} metric="pv" />
          </div>
          <div className="space-y-1 rounded-lg bg-navy px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-200">💧 Ditto per month</span>
              <span className="text-lg font-bold text-amber">
                {monthlyAverages.dittoPerMonth.toFixed(1)}
              </span>
            </div>
            <PercentileNote entry={volumePercentiles.find((p) => p.metric === "ditto")} />
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              🏆 Team Leaders
            </p>
            <AverageLeaders leaders={volumeLeaders} metric="ditto" />
          </div>
          <p className="text-xs text-slate-400">
            Averaged across completed months since you started logging Volume (up to the last 6)
            — a month with nothing logged still counts as a 0, so this reflects real
            month-to-month consistency since you started, not just how much you do on months you
            actually engage. This month itself isn&apos;t counted yet — it isn&apos;t over.
          </p>
        </div>

        <div className="card space-y-1.5">
          <p className="section-title">Recent Months</p>
          {loading ? (
            <SkeletonRows rows={3} />
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

        <div className="card space-y-3">
          <p className="section-title">💧 Day 1 Ditto</p>
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
          {dittoError && <p className="text-xs text-red-400">{dittoError}</p>}

          <div className="pt-1">
            <div className="relative h-5 w-full rounded-full bg-white/10">
              <div
                className="h-5 rounded-full transition-all duration-300"
                style={{
                  width: `${dittoPct}%`,
                  background: "linear-gradient(135deg, var(--color-amber-light), var(--color-amber))",
                }}
              />
            </div>
            <div className="relative mt-1 h-4 text-[10px] text-slate-400">
              <span className="absolute right-0">{DITTO_TARGET} PV</span>
            </div>
          </div>
          <p className="text-sm text-amber-light">
            {dittoPv} / {DITTO_TARGET} PV {dittoPv >= DITTO_TARGET ? "🏆" : ""}
          </p>

          <p className="text-xs text-slate-500 pt-1">Day 1 Ditto by month, to compare</p>
          <TrendChart data={dittoChartData} valueSuffix=" PV" />
        </div>

        <div id="log-sale" className="card space-y-2">
          <p className="section-title">🛍️ Customer Sales</p>
          <div className="rounded-lg bg-navy p-2 text-center">
            <p className="text-lg font-bold text-amber-light">{highestPv} PV</p>
          </div>

          <p className="text-xs text-slate-500">Tap to select — you can pick more than one.</p>
          <div className="flex flex-wrap gap-2">
            {SALE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => toggleSaleCategory(cat)}
                className={
                  saleCategories.includes(cat)
                    ? "toggle-pill-active flex-none px-3"
                    : "toggle-pill-inactive flex-none bg-white/5 px-3"
                }
              >
                {cat}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={0}
            className="input"
            placeholder="PV from this sale"
            value={saleAmount}
            onChange={(e) => setSaleAmount(e.target.value)}
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
            disabled={addingSale || saleCategories.length === 0}
          >
            Add Sale
          </button>
          {saleError && <p className="text-xs text-red-400">{saleError}</p>}
        </div>

        {loadingSales ? (
          <SkeletonList cards={2} />
        ) : sales.length === 0 ? (
          <div className="empty-state">No customer sales logged this month yet. Add one above.</div>
        ) : (
          <div className="space-y-2">
            {sales.map((sale) => (
              <div key={sale.id} className="card space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  {sale.description ? (
                    <p className="font-medium text-white">{sale.description}</p>
                  ) : (
                    <span />
                  )}
                  <span className="shrink-0 text-sm text-amber-light">{sale.amount} PV</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sale.categories.map((cat) => (
                    <span key={cat} className="pill-amber">
                      {cat}
                    </span>
                  ))}
                </div>
                {sale.notes && <p className="text-sm text-slate-400">{sale.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </main>
      <Fab targetId="log-sale" label="Log a sale" />
    </FeatureGate>
  );
}
