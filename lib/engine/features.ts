import type { EngineInput } from "@/lib/schemas"
import { buildLedgerView, dailyBalances, INCOME_CATEGORIES, type LedgerView, type MonthTotals } from "./ledger-view"
import { detectIncomePattern, type IncomePattern } from "./patterns"
import { cv, mean, median, round2, sum } from "./stats"

/*
 * Features computed from transactions (CLAUDE.md §4.1). Money is integer
 * cents; ratios are rounded to 2 decimals. Every feature has a plain label
 * for the "What this decision used" panel.
 */

export interface RecurringDebt {
  payee: string
  monthlyCents: number
  months: number
}

export interface Features {
  /** Date the features are measured at: the end of the data window. */
  asOf: string
  windowMonths: number
  avgMonthlyIncomeCents: number
  avgMonthlyInflowCents: number
  avgMonthlyOutflowCents: number
  avgMonthlyNetCents: number
  /** The middle month: a few very good months can't pull it up. */
  medianMonthlyNetCents: number
  annualNetCents: number
  incomeCv: number
  /** Income in the last 3 months vs the 3 before (0.1 = up 10%). Null with under 6 months. */
  incomeTrend: number | null
  avgDailyBalanceCents: number
  /** Average balance / average daily outflow. */
  daysCashOnHand: number
  nsf90: number
  nsf12m: number
  /** Date of the most recent NSF return, if any (used by servicing's pre-funding gate, not by any lender's rules). */
  lastNsfDate: string | null
  returns12m: number
  recurringDebts: RecurringDebt[]
  existingDebtMonthlyCents: number
  /** Owed / limit across shared credit cards and lines. Null if none shared. */
  creditUtilization: number | null
  /** Change in amount owed on shared cards over the window. */
  creditBalanceChangeCents: number | null
  creditHistoryMonths: number
  foreignReportAvailable: boolean
  relationship: {
    member: boolean
    tenureYears: number
    productsHeld: number
    avgBalanceAtNorthgateCents: number
    /** Credit already owed to Northgate; added to a new limit for delegated authority. */
    existingCreditCents: number
  }
  income: IncomePattern
  monthly: MonthTotals[]
}

export const FEATURE_LABELS: Record<Exclude<keyof Features, "asOf" | "monthly" | "recurringDebts" | "income" | "relationship" | "lastNsfDate">, string> = {
  windowMonths: "Months of account history",
  avgMonthlyIncomeCents: "Average monthly income",
  avgMonthlyInflowCents: "Average money in per month",
  avgMonthlyOutflowCents: "Average money out per month",
  avgMonthlyNetCents: "Average monthly cash left over",
  medianMonthlyNetCents: "Typical (median) monthly cash left over",
  annualNetCents: "Cash left over across a year",
  incomeCv: "How much income varies month to month",
  incomeTrend: "Income trend, last 3 months vs prior 3",
  avgDailyBalanceCents: "Average account balance",
  daysCashOnHand: "Days of spending covered by your balance",
  nsf90: "Returned payments, last 90 days",
  nsf12m: "Returned payments, last 12 months",
  returns12m: "All returned debits, last 12 months",
  existingDebtMonthlyCents: "Existing loan payments per month",
  creditUtilization: "Credit card balances vs limits",
  creditBalanceChangeCents: "Change in card balances",
  creditHistoryMonths: "Months of Canadian credit history",
  foreignReportAvailable: "Foreign credit report available",
}

const NSF_CODE = "901"

export function computeFeatures(input: EngineInput, view: LedgerView = buildLedgerView(input)): Features {
  const asOf = view.windowEnd
  const months = view.months
  const n = months.length
  const income = months.map((m) => m.incomeCents)
  const nets = months.map((m) => m.netCents)
  const incomeTxns = view.cashFlow.filter((t) => t.debitCreditMemo === "CREDIT" && INCOME_CATEGORIES.has(t.category))

  const avgOutflow = mean(months.map((m) => m.outflowCents))
  const avgBalance = mean(view.dailyBalances.map((d) => d.balanceCents))
  const dailyOutflow = avgOutflow / 30.4

  const daysAgo = (date: string) => (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000
  const nsf = view.returns.filter((t) => t.returnOf?.reasonCode === NSF_CODE)

  const recurringDebts = detectRecurringDebts(view)
  const credit = view.creditAccounts.filter((c) => c.account.creditLimitCents)
  const limits = sum(credit.map((c) => c.account.creditLimitCents!))

  const northgate = view.depositAccounts.filter((a) => a.provider === "northgate")
  const rel = input.relationship

  return {
    asOf,
    windowMonths: n,
    avgMonthlyIncomeCents: Math.round(mean(income)),
    avgMonthlyInflowCents: Math.round(mean(months.map((m) => m.inflowCents))),
    avgMonthlyOutflowCents: Math.round(avgOutflow),
    avgMonthlyNetCents: Math.round(mean(nets)),
    medianMonthlyNetCents: Math.round(median(nets)),
    annualNetCents: Math.round(mean(nets) * 12),
    incomeCv: round2(cv(income)),
    incomeTrend: n >= 6 ? round2(sum(income.slice(-3)) / Math.max(1, sum(income.slice(-6, -3))) - 1) : null,
    avgDailyBalanceCents: Math.round(avgBalance),
    daysCashOnHand: dailyOutflow > 0 ? Math.round(avgBalance / dailyOutflow) : 0,
    nsf90: nsf.filter((t) => daysAgo(t.postedDate) < 90).length,
    nsf12m: nsf.filter((t) => daysAgo(t.postedDate) < 365).length,
    lastNsfDate: nsf.length ? nsf.map((t) => t.postedDate).sort().at(-1)! : null,
    returns12m: view.returns.filter((t) => daysAgo(t.postedDate) < 365).length,
    recurringDebts,
    existingDebtMonthlyCents: sum(recurringDebts.map((d) => d.monthlyCents)),
    creditUtilization: limits > 0 ? round2(sum(credit.map((c) => c.owedEndCents)) / limits) : null,
    creditBalanceChangeCents: credit.length ? sum(credit.map((c) => c.owedEndCents - c.owedStartCents)) : null,
    creditHistoryMonths: input.creditFile.historyMonths,
    foreignReportAvailable: input.creditFile.foreignReport.available,
    relationship: {
      member: rel !== null,
      tenureYears: rel ? round2((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${rel.memberSince}T00:00:00Z`)) / (365.25 * 86_400_000)) : 0,
      productsHeld: rel?.productsHeld.length ?? 0,
      existingCreditCents: rel?.existingCreditCents ?? 0,
      avgBalanceAtNorthgateCents: northgate.length
        ? Math.round(mean(dailyBalances(northgate, input.transactions, view.windowStart, view.windowEnd).map((d) => d.balanceCents)))
        : 0,
    },
    income: detectIncomePattern(view, incomeTxns),
    monthly: months,
  }
}

/**
 * Loan payments to the same payee in at least 3 months. The monthly amount is
 * the median of that payee's monthly totals. Card payments are not counted
 * here (they are often paid in full); shared card accounts are measured by
 * utilization instead.
 */
export function detectRecurringDebts(view: LedgerView): RecurringDebt[] {
  const byPayee = new Map<string, Map<string, number>>()
  for (const t of view.cashFlow) {
    if (t.category !== "LOAN_PAYMENT" || t.debitCreditMemo !== "DEBIT") continue
    const payee = t.merchant ?? t.description.replace(/\s*\(.*\)$/, "")
    const months = byPayee.get(payee) ?? new Map<string, number>()
    const month = t.postedDate.slice(0, 7)
    months.set(month, (months.get(month) ?? 0) + t.amountCents)
    byPayee.set(payee, months)
  }
  return [...byPayee]
    .filter(([, months]) => months.size >= 3)
    .map(([payee, months]) => ({ payee, monthlyCents: Math.round(median([...months.values()])), months: months.size }))
    .sort((a, b) => b.monthlyCents - a.monthlyCents)
}

/**
 * Debt service coverage at a proposed payment: cash available for all debt
 * payments divided by those payments. Existing loan payments are added back,
 * because average net cash flow has already paid them.
 */
export function debtServiceCoverage(f: Pick<Features, "avgMonthlyNetCents" | "existingDebtMonthlyCents">, proposedPaymentCents: number): number {
  const service = f.existingDebtMonthlyCents + proposedPaymentCents
  if (service <= 0) return Infinity
  return round2((f.avgMonthlyNetCents + f.existingDebtMonthlyCents) / service)
}
