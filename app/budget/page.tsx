"use client";

import { useEffect, useRef, useState } from "react";
import {
  Wallet,
  Receipt,
  ShoppingCart,
  CreditCard,
  Briefcase,
  PiggyBank,
  Scale,
  Copy,
  Check,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { fireNotifyEvent } from "@/lib/notifyClient";
import { computeBudgetTotals } from "@/lib/budget";
import {
  BUDGET_INCOME_ITEMS,
  BUDGET_FIXED_EXPENSE_ITEMS,
  BUDGET_VARIABLE_EXPENSE_ITEMS,
  BUDGET_DEBT_ITEMS,
  BUDGET_INVESTMENT_ITEMS,
  BUDGET_SAVINGS_ITEMS,
  BUDGET_DUE_HALVES,
  type BudgetDueHalf,
} from "@/lib/constants";
import type { BudgetWorksheet } from "@/lib/types";

type FixedInput = { amount: string; due: BudgetDueHalf | null };
type DebtInput = { payment: string; interest_rate: string; total_owed: string };

function num(s: string | undefined): number {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function toStringMap(source: Record<string, number> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(source ?? {}).map(([k, v]) => [k, v ? String(v) : ""]));
}

function MoneyRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{label}</span>
      <div className="relative w-28 shrink-0">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
          $
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          className="input py-1.5 pl-5 text-right text-sm"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function FixedExpenseRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FixedInput;
  onChange: (v: FixedInput) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{label}</span>
      <select
        className="select w-[5.5rem] shrink-0 py-1.5 text-[11px]"
        value={value.due ?? ""}
        onChange={(e) => onChange({ ...value, due: (e.target.value || null) as BudgetDueHalf | null })}
        aria-label={`${label} due date`}
      >
        <option value="">Due?</option>
        {BUDGET_DUE_HALVES.map((half) => (
          <option key={half.key} value={half.key}>
            {half.label}
          </option>
        ))}
      </select>
      <div className="relative w-24 shrink-0">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
          $
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          className="input py-1.5 pl-5 text-right text-sm"
          placeholder="0"
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
        />
      </div>
    </div>
  );
}

function DebtRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DebtInput;
  onChange: (v: DebtInput) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-lg bg-navy p-2.5">
      <p className="text-sm font-medium text-white">{label}</p>
      <div className="grid grid-cols-3 gap-1.5">
        <div className="space-y-0.5">
          <label className="text-[10px] text-slate-500">Payment</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              className="input py-1 pl-4 text-xs"
              placeholder="0"
              value={value.payment}
              onChange={(e) => onChange({ ...value, payment: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] text-slate-500">Interest %</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="input py-1 text-xs"
            placeholder="0"
            value={value.interest_rate}
            onChange={(e) => onChange({ ...value, interest_rate: e.target.value })}
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] text-slate-500">Total Owed</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              className="input py-1 pl-4 text-xs"
              placeholder="0"
              value={value.total_owed}
              onChange={(e) => onChange({ ...value, total_owed: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// "idle" before anything's loaded/touched, "saving"/"saved"/"error"
// mirror an in-flight/finished/failed autosave - there's no separate
// "draft" vs "complete" state anymore (see the autosave effect below for
// why), so this is purely a save-status indicator, not a worksheet status.
type SaveState = "idle" | "saving" | "saved" | "error";

export default function BudgetPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [income, setIncome] = useState<Record<string, string>>({});
  const [fixed, setFixed] = useState<Record<string, FixedInput>>({});
  const [variable, setVariable] = useState<Record<string, string>>({});
  const [debts, setDebts] = useState<Record<string, DebtInput>>({});
  const [investments, setInvestments] = useState<Record<string, string>>({});
  const [savings, setSavings] = useState<Record<string, string>>({});

  // Guards the autosave effect below from firing the instant the fields
  // above populate from the initial fetch - only actual edits (each
  // section's onChange sets this) should trigger a write. Whether a row
  // already existed on load also decides whether the very first autosave
  // fires the "started their budget" notification (see doSave).
  const dirtyRef = useRef(false);
  const hadRowRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("budget_worksheets")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      const w = data as BudgetWorksheet | null;
      if (cancelled) return;
      setIncome(toStringMap(w?.income));
      setFixed(
        Object.fromEntries(
          Object.entries(w?.fixed_expenses ?? {}).map(([k, v]) => [
            k,
            { amount: v?.amount ? String(v.amount) : "", due: v?.due ?? null },
          ])
        )
      );
      setVariable(toStringMap(w?.variable_expenses));
      setDebts(
        Object.fromEntries(
          Object.entries(w?.debts ?? {}).map(([k, v]) => [
            k,
            {
              payment: v?.payment ? String(v.payment) : "",
              interest_rate: v?.interest_rate ? String(v.interest_rate) : "",
              total_owed: v?.total_owed ? String(v.total_owed) : "",
            },
          ])
        )
      );
      setInvestments(toStringMap(w?.business_investments));
      setSavings(toStringMap(w?.savings));
      hadRowRef.current = Boolean(w);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  function markDirty() {
    dirtyRef.current = true;
  }

  async function doSave() {
    setSaveError(null);
    const isFirstSave = !hadRowRef.current;
    const payload = {
      user_id: user.id,
      income: Object.fromEntries(Object.entries(income).map(([k, v]) => [k, num(v)])),
      fixed_expenses: Object.fromEntries(
        Object.entries(fixed).map(([k, v]) => [k, { amount: num(v.amount), due: v.due }])
      ),
      variable_expenses: Object.fromEntries(Object.entries(variable).map(([k, v]) => [k, num(v)])),
      debts: Object.fromEntries(
        Object.entries(debts).map(([k, v]) => [
          k,
          { payment: num(v.payment), interest_rate: num(v.interest_rate), total_owed: num(v.total_owed) },
        ])
      ),
      business_investments: Object.fromEntries(Object.entries(investments).map(([k, v]) => [k, num(v)])),
      savings: Object.fromEntries(Object.entries(savings).map(([k, v]) => [k, num(v)])),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("budget_worksheets").upsert(payload, { onConflict: "user_id" });
    if (error) {
      setSaveState("error");
      setSaveError(error.message);
      return;
    }
    hadRowRef.current = true;
    setSaveState("saved");
    if (isFirstSave) fireNotifyEvent({ kind: "budget_worksheet_completed" });
  }

  // Debounced autosave - fires ~900ms after the last edit rather than on
  // every keystroke, and only once something's actually been touched
  // (dirtyRef), so loading someone's existing worksheet doesn't
  // immediately re-write it or fire the first-save notification below.
  useEffect(() => {
    if (!dirtyRef.current) return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      void doSave();
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [income, fixed, variable, debts, investments, savings]);

  const totals = computeBudgetTotals({
    income: Object.fromEntries(Object.entries(income).map(([k, v]) => [k, num(v)])),
    fixed_expenses: Object.fromEntries(
      Object.entries(fixed).map(([k, v]) => [k, { amount: num(v.amount), due: v.due }])
    ),
    variable_expenses: Object.fromEntries(Object.entries(variable).map(([k, v]) => [k, num(v)])),
    debts: Object.fromEntries(
      Object.entries(debts).map(([k, v]) => [
        k,
        { payment: num(v.payment), interest_rate: num(v.interest_rate), total_owed: num(v.total_owed) },
      ])
    ),
    business_investments: Object.fromEntries(Object.entries(investments).map(([k, v]) => [k, num(v)])),
    savings: Object.fromEntries(Object.entries(savings).map(([k, v]) => [k, num(v)])),
  });

  function fmtDue(due: BudgetDueHalf | null): string {
    if (!due) return "";
    const half = BUDGET_DUE_HALVES.find((h) => h.key === due);
    return half ? ` (due ${half.label})` : "";
  }

  // A plain-text version of the whole worksheet, for the handful of
  // times someone wants to text/DM it to their upline directly instead
  // of (or alongside) them just opening Team - only lists populated
  // rows, so it reads like a summary rather than a form dump of zeros.
  function buildShareText(): string {
    const lines: string[] = ["MY BUDGET", ""];

    lines.push("INCOME");
    for (const item of BUDGET_INCOME_ITEMS) {
      const v = num(income[item.slug]);
      if (v) lines.push(`  ${item.label}: ${fmt(v)}`);
    }
    lines.push(`  Total Income: ${fmt(totals.income)}`, "");

    lines.push("FIXED EXPENSES");
    for (const item of BUDGET_FIXED_EXPENSE_ITEMS) {
      const v = fixed[item.slug];
      const amount = num(v?.amount);
      if (amount) lines.push(`  ${item.label}: ${fmt(amount)}${fmtDue(v?.due ?? null)}`);
    }
    lines.push(`  Total Fixed Expenses: ${fmt(totals.fixedExpenses)}`, "");

    lines.push("VARIABLE EXPENSES");
    for (const item of BUDGET_VARIABLE_EXPENSE_ITEMS) {
      const v = num(variable[item.slug]);
      if (v) lines.push(`  ${item.label}: ${fmt(v)}`);
    }
    lines.push(`  Total Variable Expenses: ${fmt(totals.variableExpenses)}`, "");

    const debtRows = BUDGET_DEBT_ITEMS.filter((item) => {
      const v = debts[item.slug];
      return num(v?.payment) || num(v?.interest_rate) || num(v?.total_owed);
    });
    if (debtRows.length > 0) {
      lines.push("DEBT");
      for (const item of debtRows) {
        const v = debts[item.slug];
        lines.push(
          `  ${item.label}: payment ${fmt(num(v?.payment))}, ${num(v?.interest_rate)}% interest, ${fmt(
            num(v?.total_owed)
          )} owed`
        );
      }
      lines.push(`  Total Payments: ${fmt(totals.debtPayments)}  ·  Total Owed: ${fmt(totals.debtTotalOwed)}`, "");
    }

    lines.push("SUGGESTED BUSINESS INVESTMENTS");
    for (const item of BUDGET_INVESTMENT_ITEMS) {
      const v = num(investments[item.slug]);
      if (v) lines.push(`  ${item.label}: ${fmt(v)}`);
    }
    lines.push(`  Total: ${fmt(totals.businessInvestmentsTotal)}`, "");

    lines.push("SAVINGS");
    for (const item of BUDGET_SAVINGS_ITEMS) {
      const v = num(savings[item.slug]);
      if (v) lines.push(`  ${item.label}: ${fmt(v)}`);
    }
    lines.push(`  Total Savings: ${fmt(totals.savings)}`, "");

    lines.push("CASH FLOW");
    lines.push(`  Income: ${fmt(totals.income)}`);
    lines.push(`  Fixed Expenses: -${fmt(totals.fixedExpenses)}`);
    lines.push(`  Variable Expenses: -${fmt(totals.variableExpenses)}`);
    lines.push(`  Amway DITTO™ Order: -${fmt(totals.dittoOrder)}`);
    lines.push(`  LTD Suggested Investments: -${fmt(totals.ltdSuggestedInvestments)}`);
    lines.push(`  Monthly Debt Payments: -${fmt(totals.debtPayments)}`);
    lines.push(`  Total Monthly Expenses: ${fmt(totals.totalMonthlyExpenses)}`);
    lines.push(`  Net Cash Flow: ${fmt(totals.netCashFlow)}`);

    return lines.join("\n");
  }

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(buildShareText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setSaveError("Couldn't copy to your clipboard.");
    }
  }

  return (
    <>
      <PageHeader title="My Budget" subtitle="Session 1 homework" />
      <main className="page-main">
        {loading ? (
          <SkeletonList cards={4} />
        ) : (
          <>
            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="section-title flex items-center gap-1.5">
                  <Wallet className="h-4 w-4" aria-hidden />
                  Income
                </p>
                <span className="text-sm font-bold text-amber-light">{fmt(totals.income)}</span>
              </div>
              <div className="space-y-2">
                {BUDGET_INCOME_ITEMS.map((item) => (
                  <MoneyRow
                    key={item.slug}
                    label={item.label}
                    value={income[item.slug] ?? ""}
                    onChange={(v) => {
                      markDirty();
                      setIncome((prev) => ({ ...prev, [item.slug]: v }));
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="section-title flex items-center gap-1.5">
                  <Receipt className="h-4 w-4" aria-hidden />
                  Fixed Expenses
                </p>
                <span className="text-sm font-bold text-amber-light">{fmt(totals.fixedExpenses)}</span>
              </div>
              <div className="space-y-2">
                {BUDGET_FIXED_EXPENSE_ITEMS.map((item) => (
                  <FixedExpenseRow
                    key={item.slug}
                    label={item.label}
                    value={fixed[item.slug] ?? { amount: "", due: null }}
                    onChange={(v) => {
                      markDirty();
                      setFixed((prev) => ({ ...prev, [item.slug]: v }));
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="section-title flex items-center gap-1.5">
                  <ShoppingCart className="h-4 w-4" aria-hidden />
                  Variable Expenses
                </p>
                <span className="text-sm font-bold text-amber-light">{fmt(totals.variableExpenses)}</span>
              </div>
              <div className="space-y-2">
                {BUDGET_VARIABLE_EXPENSE_ITEMS.map((item) => (
                  <MoneyRow
                    key={item.slug}
                    label={item.label}
                    value={variable[item.slug] ?? ""}
                    onChange={(v) => {
                      markDirty();
                      setVariable((prev) => ({ ...prev, [item.slug]: v }));
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="card space-y-2">
              <p className="section-title flex items-center gap-1.5">
                <CreditCard className="h-4 w-4" aria-hidden />
                Debt
              </p>
              <div className="space-y-2">
                {BUDGET_DEBT_ITEMS.map((item) => (
                  <DebtRow
                    key={item.slug}
                    label={item.label}
                    value={debts[item.slug] ?? { payment: "", interest_rate: "", total_owed: "" }}
                    onChange={(v) => {
                      markDirty();
                      setDebts((prev) => ({ ...prev, [item.slug]: v }));
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-xs text-slate-400">
                <span>Totals</span>
                <span>
                  Payments <span className="font-semibold text-white">{fmt(totals.debtPayments)}</span>
                  {"  ·  "}
                  Owed <span className="font-semibold text-white">{fmt(totals.debtTotalOwed)}</span>
                </span>
              </div>
            </div>

            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="section-title flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4" aria-hidden />
                  Suggested Business Investments
                </p>
                <span className="text-sm font-bold text-amber-light">
                  {fmt(totals.businessInvestmentsTotal)}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                *Leadership Team Development (LTD) is an optional training and support system.
              </p>
              <div className="space-y-2">
                {BUDGET_INVESTMENT_ITEMS.map((item) => (
                  <MoneyRow
                    key={item.slug}
                    label={item.label}
                    value={investments[item.slug] ?? ""}
                    onChange={(v) => {
                      markDirty();
                      setInvestments((prev) => ({ ...prev, [item.slug]: v }));
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="section-title flex items-center gap-1.5">
                  <PiggyBank className="h-4 w-4" aria-hidden />
                  Savings
                </p>
                <span className="text-sm font-bold text-amber-light">{fmt(totals.savings)}</span>
              </div>
              <div className="space-y-2">
                {BUDGET_SAVINGS_ITEMS.map((item) => (
                  <MoneyRow
                    key={item.slug}
                    label={item.label}
                    value={savings[item.slug] ?? ""}
                    onChange={(v) => {
                      markDirty();
                      setSavings((prev) => ({ ...prev, [item.slug]: v }));
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="card space-y-1.5">
              <p className="section-title flex items-center gap-1.5">
                <Scale className="h-4 w-4" aria-hidden />
                Cash Flow
              </p>
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Income</span>
                  <span className="font-semibold text-white">{fmt(totals.income)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Fixed Expenses</span>
                  <span className="font-semibold text-white">-{fmt(totals.fixedExpenses)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Variable Expenses</span>
                  <span className="font-semibold text-white">-{fmt(totals.variableExpenses)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Amway DITTO™ Order</span>
                  <span className="font-semibold text-white">-{fmt(totals.dittoOrder)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">LTD Suggested Investments</span>
                  <span className="font-semibold text-white">-{fmt(totals.ltdSuggestedInvestments)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Monthly Debt Payments</span>
                  <span className="font-semibold text-white">-{fmt(totals.debtPayments)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 pt-1.5">
                  <span className="font-semibold text-slate-300">Total Monthly Expenses</span>
                  <span className="font-bold text-white">{fmt(totals.totalMonthlyExpenses)}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-base font-bold text-amber-light">Net Cash Flow</span>
                  <span
                    className={`text-lg font-extrabold ${
                      totals.netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {fmt(totals.netCashFlow)}
                  </span>
                </div>
              </div>
            </div>

            <div className="card space-y-2">
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                {saveState === "saving" && "Saving…"}
                {saveState === "saved" && (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                    Saved — everything here autosaves as you type.
                  </>
                )}
                {saveState === "idle" && "Everything here autosaves as you type."}
                {saveState === "error" && <span className="text-red-400">Couldn&apos;t save: {saveError}</span>}
              </p>
              <button className="btn-secondary w-full" onClick={copyShareText}>
                {copied ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Check className="h-4 w-4" aria-hidden />
                    Copied!
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Copy className="h-4 w-4" aria-hidden />
                    Copy to Share with Upline
                  </span>
                )}
              </button>
              <p className="text-xs text-slate-500">
                Your upline can already see your numbers at any time to help coach you — same as your
                Pipeline and Core Run numbers — but this copies a plain-text summary too, in case you&apos;d
                rather send it directly.
              </p>
            </div>
          </>
        )}
      </main>
    </>
  );
}
