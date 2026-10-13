import type { Features } from "@/lib/engine/features"
import { INCOME_LABELS } from "@/lib/labels"
import { formatCents } from "@/lib/money"

/*
 * Turns engine feature keys (as listed in Decision.inputsUsed) into a label
 * and a readable value, for the "What this decision used" panel.
 */

const money = (c: number) => formatCents(c, { whole: true })
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function variability(cv: number): string {
  if (cv < 0.2) return "Steady"
  if (cv < 0.35) return "Varies a little"
  if (cv < 0.6) return "Varies a lot"
  return "Varies greatly"
}

const DISPLAY: Record<string, { label: string; value: (f: Features) => string }> = {
  windowMonths: { label: "Months of account history", value: (f) => `${f.windowMonths}` },
  avgMonthlyNetCents: { label: "Average monthly cash left over", value: (f) => money(f.avgMonthlyNetCents) },
  medianMonthlyNetCents: { label: "Typical month's cash left over (median)", value: (f) => money(f.medianMonthlyNetCents) },
  annualNetCents: { label: "Cash left over across a year", value: (f) => money(f.annualNetCents) },
  incomeCv: { label: "How much income varies", value: (f) => `${variability(f.incomeCv)} (CV ${f.incomeCv})` },
  nsf90: { label: "Bounced payments, last 90 days", value: (f) => `${f.nsf90}` },
  nsf12m: { label: "Bounced payments, last 12 months", value: (f) => `${f.nsf12m}` },
  existingDebtMonthlyCents: { label: "Existing loan payments per month", value: (f) => money(f.existingDebtMonthlyCents) },
  creditUtilization: { label: "Card balances vs limits", value: (f) => (f.creditUtilization === null ? "No cards shared" : `${Math.round(f.creditUtilization * 100)}%`) },
  creditHistoryMonths: { label: "Canadian credit history", value: (f) => `${f.creditHistoryMonths} months` },
  foreignReportAvailable: { label: "Foreign credit report", value: (f) => (f.foreignReportAvailable ? "Available" : "Not available") },
  daysCashOnHand: { label: "Days of spending covered by balance", value: (f) => `${f.daysCashOnHand}` },
  "income.type": { label: "Income pattern", value: (f) => INCOME_LABELS[f.income.type] },
  "income.peakMonths": { label: "Busiest months", value: (f) => `${f.income.peakMonths.map((m) => MONTHS[m - 1]).join(", ")} (${Math.round(f.income.peakShare * 100)}% of income)` },
  monthly: { label: "Month-by-month cash flow", value: (f) => `${f.monthly.length} months` },
  "relationship.tenureYears": { label: "Years as a Northgate member", value: (f) => (f.relationship.member ? `${Math.floor(f.relationship.tenureYears)}` : "Not a member") },
  "relationship.productsHeld": { label: "Northgate products held", value: (f) => `${f.relationship.productsHeld}` },
  "relationship.avgBalanceAtNorthgateCents": { label: "Average balance at Northgate", value: (f) => money(f.relationship.avgBalanceAtNorthgateCents) },
  "relationship.existingCreditCents": { label: "Already owed to Northgate (for who signs off)", value: (f) => money(f.relationship.existingCreditCents) },
}

export function displayInput(key: string, f: Features): { label: string; value: string } {
  const d = DISPLAY[key]
  return d ? { label: d.label, value: d.value(f) } : { label: key, value: "" }
}

/** What every decision deliberately ignores (CLAUDE.md §4.6), enforced by tests/fairness.test.ts. */
export const IGNORED = [
  "Name",
  "Age and date of birth",
  "Gender",
  "Nationality and immigration status",
  "Postal code and province",
]

/**
 * Shown with IGNORED: the one input that can track nationality. Foreign
 * credit report programs cover only some countries, so whether a report
 * exists depends on where someone has lived.
 */
export const FOREIGN_REPORT_NOTE =
  "One input can track nationality: a foreign credit report. Programs cover only some countries, so whether a report exists depends on where someone has lived. Berry uses only the report's rating (good or better counts as credit history), never the country."

/** Key facts for the applicant file's left column. */
export function keyFacts(f: Features): { label: string; value: string }[] {
  return [
    { label: "Income pattern", value: INCOME_LABELS[f.income.type] },
    { label: "Average monthly income", value: money(f.avgMonthlyIncomeCents) },
    { label: "Typical month left over", value: money(f.medianMonthlyNetCents) },
    { label: "Income from month to month", value: variability(f.incomeCv) },
    { label: "Bounced payments (90 days / 12 months)", value: `${f.nsf90} / ${f.nsf12m}` },
    { label: "Existing loan payments", value: `${money(f.existingDebtMonthlyCents)}/mo` },
    { label: "Days of spending in the bank", value: `${f.daysCashOnHand}` },
    { label: "Canadian credit history", value: `${f.creditHistoryMonths} months` },
  ]
}
