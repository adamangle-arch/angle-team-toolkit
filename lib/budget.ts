import type { BudgetDebtEntry, BudgetFixedExpenseEntry, BudgetWorksheet } from "./types";

function sumValues(map: Record<string, number> | null | undefined): number {
  return Object.values(map ?? {}).reduce((total, v) => total + (Number(v) || 0), 0);
}

export type BudgetTotals = {
  income: number;
  fixedExpenses: number;
  variableExpenses: number;
  debtPayments: number;
  debtTotalOwed: number;
  dittoOrder: number;
  ltdSuggestedInvestments: number;
  businessInvestmentsTotal: number;
  savings: number;
  totalMonthlyExpenses: number;
  netCashFlow: number;
};

// Mirrors the Budget Session worksheet's own Cash Flow section exactly:
// Amway DITTO™ is split out of Business Investments into its own line
// ("ditto_order" - see BUDGET_INVESTMENT_ITEMS in lib/constants.ts),
// everything else in that section rolls up into "LTD Suggested
// Investments," and Debt only contributes its Payment column to monthly
// expenses (Total Owed is a balance, not a monthly outflow). Shared by
// the editing page (app/budget/page.tsx, computed live from in-progress
// input) and the read-only view an upline sees on the Team tab, so the
// two can never show different math for the same numbers.
export function computeBudgetTotals(
  w: Pick<
    BudgetWorksheet,
    "income" | "fixed_expenses" | "variable_expenses" | "debts" | "business_investments" | "savings"
  > | null
): BudgetTotals {
  const income = sumValues(w?.income);

  const fixedExpenses = Object.values(w?.fixed_expenses ?? ({} as Record<string, BudgetFixedExpenseEntry>)).reduce(
    (total, entry) => total + (Number(entry?.amount) || 0),
    0
  );

  const variableExpenses = sumValues(w?.variable_expenses);

  const debtEntries = Object.values(w?.debts ?? ({} as Record<string, BudgetDebtEntry>));
  const debtPayments = debtEntries.reduce((total, entry) => total + (Number(entry?.payment) || 0), 0);
  const debtTotalOwed = debtEntries.reduce((total, entry) => total + (Number(entry?.total_owed) || 0), 0);

  const dittoOrder = Number(w?.business_investments?.ditto_order) || 0;
  const businessInvestmentsTotal = sumValues(w?.business_investments);
  const ltdSuggestedInvestments = businessInvestmentsTotal - dittoOrder;

  const savings = sumValues(w?.savings);

  const totalMonthlyExpenses = fixedExpenses + variableExpenses + dittoOrder + ltdSuggestedInvestments + debtPayments;
  const netCashFlow = income - totalMonthlyExpenses;

  return {
    income,
    fixedExpenses,
    variableExpenses,
    debtPayments,
    debtTotalOwed,
    dittoOrder,
    ltdSuggestedInvestments,
    businessInvestmentsTotal,
    savings,
    totalMonthlyExpenses,
    netCashFlow,
  };
}
