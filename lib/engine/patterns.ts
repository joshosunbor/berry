import type { Transaction } from "@/lib/schemas"
import type { LedgerView } from "./ledger-view"
import { cv, mean, median, round2, stdev, sum } from "./stats"

/*
 * Income regularity (CLAUDE.md §4.1): salaried, gig, seasonal, steady
 * business or irregular. Classification thresholds are part of the method,
 * not lending policy, so they live here rather than in institution config.
 */

export const PATTERN_RULES = {
  /** Seasonal: the best 3 consecutive calendar months bring at least this share of income. */
  seasonalPeakShare: 0.5,
  /** Seasonality needs a full year to see. */
  seasonalMinMonths: 12,
  /** Salaried: payroll is at least this share of income... */
  salariedPayrollShare: 0.7,
  /** ...arriving on a regular cadence (gap stdev within this many days). */
  salariedMaxGapStdevDays: 3,
  /** Gig: platform payouts are at least this share of income. */
  gigShare: 0.5,
  /** Steady business: business deposits are at least this share, with income CV at or below the max. */
  businessShare: 0.7,
  businessMaxCv: 0.35,
} as const

export type IncomeType = "salaried" | "gig" | "seasonal" | "steady_business" | "irregular"

export interface PayrollCadence {
  /** Typical days between paydays, e.g. 14. */
  cadenceDays: number
  lastPayDate: string
  nextExpectedDate: string
  typicalNetCents: number
}

export interface IncomePattern {
  type: IncomeType
  /** Best 3 consecutive calendar months (1–12) and their share of income. */
  peakMonths: number[]
  peakShare: number
  /** Calendar months with income below half the monthly average. */
  quietMonths: number[]
  payroll: PayrollCadence | null
  depositsPerMonth: number
  avgDepositCents: number
  /** Share of income by source category. */
  sources: Record<string, number>
}

export function detectIncomePattern(view: LedgerView, incomeTxns: Transaction[]): IncomePattern {
  const total = sum(incomeTxns.map((t) => t.amountCents))
  const share = (pred: (t: Transaction) => boolean) => (total > 0 ? sum(incomeTxns.filter(pred).map((t) => t.amountCents)) / total : 0)

  const sources: Record<string, number> = {}
  for (const t of incomeTxns) sources[t.category] = (sources[t.category] ?? 0) + t.amountCents
  for (const k of Object.keys(sources)) sources[k] = round2(sources[k] / total)

  const byCalendarMonth = Array.from({ length: 12 }, () => 0)
  for (const m of view.months) byCalendarMonth[Number(m.month.slice(5, 7)) - 1] += m.incomeCents
  const { months: peakMonths, share: peakShare } = bestConsecutive(byCalendarMonth, 3)
  const monthlyIncome = view.months.map((m) => m.incomeCents)
  const avgIncome = mean(monthlyIncome)
  const quietMonths = view.months.filter((m) => m.incomeCents < avgIncome * 0.5).map((m) => Number(m.month.slice(5, 7)))

  const payrollTxns = incomeTxns.filter((t) => t.category === "PAYROLL")
  const payroll = payrollCadence(payrollTxns)
  const incomeCv = cv(monthlyIncome)

  let type: IncomeType = "irregular"
  if (view.months.length >= PATTERN_RULES.seasonalMinMonths && peakShare >= PATTERN_RULES.seasonalPeakShare) {
    type = "seasonal"
  } else if (share((t) => t.category === "PAYROLL") >= PATTERN_RULES.salariedPayrollShare && payroll && payroll.gapStdevDays <= PATTERN_RULES.salariedMaxGapStdevDays) {
    type = "salaried"
  } else if (share((t) => t.category === "GIG_INCOME") >= PATTERN_RULES.gigShare) {
    type = "gig"
  } else if (
    share((t) => t.category === "BUSINESS_REVENUE" || t.category === "CASH_DEPOSIT") >= PATTERN_RULES.businessShare &&
    incomeCv <= PATTERN_RULES.businessMaxCv
  ) {
    type = "steady_business"
  }

  return {
    type,
    peakMonths,
    peakShare: round2(peakShare),
    quietMonths: [...new Set(quietMonths)].sort((a, b) => a - b),
    payroll: payroll ? { cadenceDays: payroll.cadenceDays, lastPayDate: payroll.lastPayDate, nextExpectedDate: payroll.nextExpectedDate, typicalNetCents: payroll.typicalNetCents } : null,
    depositsPerMonth: round2(incomeTxns.length / Math.max(1, view.months.length)),
    avgDepositCents: incomeTxns.length ? Math.round(total / incomeTxns.length) : 0,
    sources,
  }
}

/** Best run of `n` consecutive calendar months, wrapping December into January. */
export function bestConsecutive(byCalendarMonth: number[], n: number): { months: number[]; share: number } {
  const total = sum(byCalendarMonth)
  let best = { start: 0, value: -Infinity }
  for (let start = 0; start < 12; start++) {
    const value = sum(Array.from({ length: n }, (_, i) => byCalendarMonth[(start + i) % 12]))
    if (value > best.value) best = { start, value }
  }
  return {
    months: Array.from({ length: n }, (_, i) => ((best.start + i) % 12) + 1),
    share: total > 0 ? best.value / total : 0,
  }
}

function payrollCadence(payroll: Transaction[]) {
  if (payroll.length < 3) return null
  const days = payroll.map((t) => Date.parse(`${t.postedDate}T00:00:00Z`) / 86_400_000)
  const gaps = days.slice(1).map((d, i) => d - days[i])
  const cadenceDays = Math.round(median(gaps))
  const last = payroll[payroll.length - 1].postedDate
  const next = new Date(`${last}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + cadenceDays)
  return {
    cadenceDays,
    gapStdevDays: stdev(gaps),
    lastPayDate: last,
    nextExpectedDate: next.toISOString().slice(0, 10),
    typicalNetCents: Math.round(median(payroll.map((t) => t.amountCents))),
  }
}
