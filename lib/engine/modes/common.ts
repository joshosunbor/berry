import type { InstitutionConfig, ProductTerms, ProductType, Structure } from "@/lib/schemas"
import { debtServiceCoverage, type Features } from "../features"
import { amortizedPaymentCents, interestOnlyCents, maxPrincipalCents, revolvingAssessedPaymentCents, REVOLVING_ASSESSMENT_RATE, roundDownCents } from "../payment"
import type { ModeResult } from "../types"

export const REVOLVING = new Set<ProductType>(["line_of_credit", "credit_card", "starter_credit", "business_line_of_credit"])
export const TERM = new Set<ProductType>(["personal_loan", "business_term_loan", "equipment_financing"])

export function productTerms(config: InstitutionConfig, product: ProductType): ProductTerms | null {
  const t = config.products.find((p) => p.product === product)
  return t && t.offered ? t : null
}

/** The requested term if this lender offers it, otherwise the longest offered term not above it. */
export function chooseTerm(terms: ProductTerms, requested: number | undefined): number | null {
  if (!terms.termMonths.length) return null
  const sorted = [...terms.termMonths].sort((a, b) => a - b)
  if (requested && sorted.includes(requested)) return requested
  const below = sorted.filter((t) => !requested || t <= requested)
  return below.length ? below[below.length - 1] : sorted[0]
}

export function structureFor(product: ProductType): Structure {
  if (product === "seasonal_operating_line") return "seasonal_operating"
  if (product === "starter_credit") return "secured_starter"
  return REVOLVING.has(product) ? "revolving" : "term"
}

/** Monthly payment used for coverage, by structure. */
export function assessedPayment(structure: Structure, limitCents: number, aprBps: number, termMonths: number | null): number {
  if (structure === "term") return amortizedPaymentCents(limitCents, aprBps, termMonths ?? 12)
  if (structure === "seasonal_operating") return interestOnlyCents(limitCents, aprBps)
  return revolvingAssessedPaymentCents(limitCents)
}

/** Largest amount whose assessed payment still meets `minDscr`, given `netCents` of monthly net cash flow. */
export function maxAffordableCents(netCents: number, f: Features, minDscr: number, structure: Structure, aprBps: number, termMonths: number | null): number {
  const maxPayment = Math.floor((netCents + f.existingDebtMonthlyCents) / minDscr - f.existingDebtMonthlyCents)
  if (maxPayment <= 0) return 0
  if (structure === "term") return maxPrincipalCents(maxPayment, aprBps, termMonths ?? 12)
  return Math.floor(maxPayment / REVOLVING_ASSESSMENT_RATE)
}

export function coverageAt(netCents: number, f: Features, paymentCents: number): number {
  return debtServiceCoverage({ avgMonthlyNetCents: netCents, existingDebtMonthlyCents: f.existingDebtMonthlyCents }, paymentCents)
}

/** Limits are offered in round amounts: $500 steps under $10k, $1,000 to $50k, $5,000 above. */
export function roundLimit(cents: number): number {
  if (cents < 1_000_000) return roundDownCents(cents, 50_000)
  if (cents < 5_000_000) return roundDownCents(cents, 100_000)
  return roundDownCents(cents, 500_000)
}

export function decline(product: ProductType, reasons: ModeResult["reasons"], inputsUsed: string[], extra: Partial<ModeResult> = {}): ModeResult {
  return { outcome: "decline", product, structure: null, limitCents: 0, aprBps: null, termMonths: null, paymentCents: null, reasons, inputsUsed, ...extra }
}

/** Contributing concerns that don't decide on their own but are shown with a decline. */
export function concerns(f: Features): ModeResult["reasons"] {
  const out: ModeResult["reasons"] = []
  if (f.creditBalanceChangeCents !== null && f.creditBalanceChangeCents > 50_000 && (f.creditUtilization ?? 0) >= 0.5) {
    out.push({ code: "RISING_CARD_BALANCES", weight: 0.6, evidence: { changeCents: f.creditBalanceChangeCents, utilization: f.creditUtilization ?? 0 } })
  }
  return out
}

/** Positive reasons that apply in every mode, from income pattern and history. */
export function commonStrengths(f: Features): ModeResult["reasons"] {
  const out: ModeResult["reasons"] = []
  const p = f.income
  if (p.type === "salaried" && p.payroll) {
    out.push({ code: "STABLE_PAYROLL", weight: 0.6, evidence: { typicalPayCents: p.payroll.typicalNetCents, cadenceDays: p.payroll.cadenceDays, incomeCv: f.incomeCv } })
  }
  if (p.type === "steady_business") out.push({ code: "STEADY_REVENUE", weight: 0.6, evidence: { avgIncomeCents: f.avgMonthlyIncomeCents, incomeCv: f.incomeCv } })
  if (p.type === "gig") {
    out.push({ code: "CONSISTENT_GIG_INCOME", weight: 0.6, evidence: { avgIncomeCents: f.avgMonthlyIncomeCents, depositsPerMonth: p.depositsPerMonth, incomeCv: f.incomeCv } })
  }
  if (p.type !== "seasonal" && f.incomeTrend !== null && f.incomeTrend >= 0.05) {
    out.push({ code: "GROWING_REVENUE", weight: 0.45, evidence: { trend: f.incomeTrend } })
  }
  if (f.nsf12m === 0) out.push({ code: "NO_RETURNED_PAYMENTS", weight: 0.4, evidence: {} })
  if (f.daysCashOnHand >= 60) out.push({ code: "HEALTHY_CASH_BUFFER", weight: 0.35, evidence: { days: f.daysCashOnHand, avgBalanceCents: f.avgDailyBalanceCents } })
  return out
}
