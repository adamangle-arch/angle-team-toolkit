"use client";

import { useEffect, useState } from "react";
import {
  Wallet,
  Receipt,
  ShoppingCart,
  CreditCard,
  Briefcase,
  PiggyBank,
  Scale,
  CircleCheck,
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

export default function BudgetPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  const [income, setIncome] = useState<Record<string, string>>({});
  const [fixed, setFixed] = useState<Record<string, FixedInput>>({});
  const [variable, setVariable] = useState<Record<string, string>>({});
  const [debts, setDebts] = useState<Record<string, DebtInput>>({});
  const [investments, setInvestments] = useState<Record<string, string>>({});
  const [savings, setSavings] = useState<Record<string, string>>({});

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
      setCompletedAt(w?.completed_at ?? null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

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

  async function save(markComplete: boolean) {
    setSaving(true);
    setSaveError(null);
    setSavedFlash(false);
    const wasIncomplete = !completedAt;
    const nextCompletedAt = markComplete ? new Date().toISOString() : completedAt;
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
      completed_at: nextCompletedAt,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("budget_worksheets").upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setCompletedAt(nextCompletedAt);
    setSavedFlash(true);
    if (markComplete && wasIncomplete) {
      fireNotifyEvent({ kind: "budget_worksheet_completed" });
    }
  }

  async function markIncomplete() {
    setSaving(true);
    const { error } = await supabase
      .from("budget_worksheets")
      .update({ completed_at: null })
      .eq("user_id", user.id);
    setSaving(false);
    if (!error) setCompletedAt(null);
  }

  return (
    <>
      <PageHeader
        title="My Budget"
        subtitle={completedAt ? "Completed — Session 1 homework" : "Session 1 homework"}
      />
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
                    onChange={(v) => setIncome((prev) => ({ ...prev, [item.slug]: v }))}
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
                    onChange={(v) => setFixed((prev) => ({ ...prev, [item.slug]: v }))}
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
                    onChange={(v) => setVariable((prev) => ({ ...prev, [item.slug]: v }))}
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
                    onChange={(v) => setDebts((prev) => ({ ...prev, [item.slug]: v }))}
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
                    onChange={(v) => setInvestments((prev) => ({ ...prev, [item.slug]: v }))}
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
                    onChange={(v) => setSavings((prev) => ({ ...prev, [item.slug]: v }))}
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
              {completedAt ? (
                <>
                  <p className="flex items-center gap-1.5 text-sm text-emerald-400">
                    <CircleCheck className="h-4 w-4" aria-hidden />
                    Marked complete {new Date(completedAt).toLocaleDateString()}
                  </p>
                  <div className="flex gap-2">
                    <button className="btn-primary flex-1" onClick={() => save(false)} disabled={saving}>
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                    <button className="btn-secondary" onClick={markIncomplete} disabled={saving}>
                      Mark Incomplete
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex gap-2">
                  <button className="btn-secondary flex-1" onClick={() => save(false)} disabled={saving}>
                    {saving ? "Saving…" : "Save Draft"}
                  </button>
                  <button className="btn-primary flex-1" onClick={() => save(true)} disabled={saving}>
                    Mark Complete
                  </button>
                </div>
              )}
              {savedFlash && !saving && <p className="text-xs text-emerald-400">Saved.</p>}
              {saveError && <p className="text-xs text-red-400">{saveError}</p>}
              <p className="text-xs text-slate-500">
                Your upline can see once this is marked complete, and can see your numbers to help coach
                you — same as your Pipeline and Core Run numbers.
              </p>
            </div>
          </>
        )}
      </main>
    </>
  );
}
