import { z } from "zod"
import { routeApproval } from "../authority"
import type { Features } from "../features"
import { round2, sum } from "../stats"
import type { ReasonHit } from "../reasons"
import type { ModeContext, ModeResult } from "../types"
import { assessedPayment, chooseTerm, lendingPolicy, commonStrengths, concerns, coverageAt, decline, maxAffordableCents, productTerms, REVOLVING, roundLimit, structureFor } from "./common"

/*
 * Northgate Credit Union: relationship-based. Weighs membership depth,
 * reads seasonal income on an annual basis and structures the product
 * around it, and routes every approval to the right delegated authority.
 */

const Thresholds = z.object({
  minDscr: z.number(),
  relationshipMinDscr: z.number(),
  strongRelationship: z.number(),
  fullTenureYears: z.number(),
  seasonalPeakCoverage: z.number(),
  relationshipSeasonalPeakCoverage: z.number(),
  maxNsf90: z.number(),
  recentNsfLimitMonthsOfNet: z.number(),
  maxCreditUtilization: z.number(),
  nonMemberRevolvingMaxCents: z.number().int(),
  thinFileMemberMaxCents: z.number().int(),
  thinFileHistoryMonths: z.number(),
  relationshipTenureWeight: z.number(),
  relationshipProductsWeight: z.number(),
  relationshipDepositsWeight: z.number(),
  relationshipFullProducts: z.number().int().positive(),
  seasonalTermMonths: z.number().int().positive(),
})
type Thresholds = z.infer<typeof Thresholds>

export const CREDIT_UNION_INPUTS = [
  "relationship.tenureYears",
  "relationship.productsHeld",
  "relationship.avgBalanceAtNorthgateCents",
  "relationship.existingCreditCents",
  "nsf90",
  "creditUtilization",
  "avgMonthlyNetCents",
  "annualNetCents",
  "existingDebtMonthlyCents",
  "income.type",
  "income.peakMonths",
  "monthly",
  "creditHistoryMonths",
  "foreignReportAvailable",
  "daysCashOnHand",
]

/**
 * Relationship depth, 0–1: tenure, products held and deposit balance
 * relative to a month of spending, weighted as the config says (by default
 * 50%, 30% and 20%). Zero for non-members.
 */
export function relationshipScore(
  f: Features,
  t: Pick<Thresholds, "fullTenureYears" | "relationshipTenureWeight" | "relationshipProductsWeight" | "relationshipDepositsWeight" | "relationshipFullProducts">,
): number {
  const r = f.relationship
  if (!r.member) return 0
  const tenure = Math.min(r.tenureYears / t.fullTenureYears, 1)
  const products = Math.min(r.productsHeld / t.relationshipFullProducts, 1)
  const deposits = f.avgMonthlyOutflowCents > 0 ? Math.min(r.avgBalanceAtNorthgateCents / f.avgMonthlyOutflowCents, 1) : 0
  return round2(t.relationshipTenureWeight * tenure + t.relationshipProductsWeight * products + t.relationshipDepositsWeight * deposits)
}

export function decideCreditUnion(ctx: ModeContext): ModeResult {
  const { input, features: f, config } = ctx
  const t = Thresholds.parse(config.thresholds)
  const product = input.request.product

  const failed: ReasonHit[] = []
  if (f.nsf90 > t.maxNsf90) failed.push({ code: "RECENT_NSF", weight: 1, evidence: { count: f.nsf90, max: t.maxNsf90 } })
  if (f.creditUtilization !== null && f.creditUtilization > t.maxCreditUtilization) {
    failed.push({ code: "HIGH_CARD_UTILIZATION", weight: 0.98, evidence: { utilization: f.creditUtilization, max: t.maxCreditUtilization } })
  }
  if (failed.length) return decline(product, [...failed, ...concerns(f)], CREDIT_UNION_INPUTS)

  const score = relationshipScore(f, t)
  const strong = score >= t.strongRelationship
  const reasons: ReasonHit[] = commonStrengths(f)
  if (f.relationship.member && f.relationship.tenureYears >= 1) {
    reasons.push({ code: "LONG_MEMBERSHIP", weight: strong ? 0.75 : 0.5, evidence: { tenureYears: f.relationship.tenureYears, products: f.relationship.productsHeld, score } })
  }

  const result =
    // A seasonal operating line is a business product: only businesses are moved onto it.
    product === "seasonal_operating_line" || (f.income.type === "seasonal" && input.kind === "business")
      ? seasonal(ctx, t, strong, reasons)
      : f.creditHistoryMonths < t.thinFileHistoryMonths && !f.foreignReportAvailable
        ? thinFile(ctx, t, reasons)
        : standard(ctx, t, strong, reasons)

  if (result.outcome !== "decline" && config.authorityTiers?.length) {
    // Delegated authority covers the member's whole exposure to Northgate, not just the new limit.
    result.approver = routeApproval(config.authorityTiers, result.limitCents + f.relationship.existingCreditCents, result.relationshipException)
  }
  return result
}

/** Seasonal income: assess the year, size the line to what peak season can repay. */
function seasonal({ input, features: f, config }: ModeContext, t: Thresholds, strong: boolean, reasons: ReasonHit[]): ModeResult {
  const p = lendingPolicy(config)
  const product = "seasonal_operating_line"
  const terms = productTerms(config, product)!
  const peak = f.income.peakMonths
  const peakSurplus = sum(f.monthly.filter((m) => peak.includes(Number(m.month.slice(5, 7)))).map((m) => m.netCents))
  const minCoverage = strong ? t.relationshipSeasonalPeakCoverage : t.seasonalPeakCoverage
  const requested = Math.min(input.request.amountCents, terms.maxCents)
  const sized = roundLimit(p, Math.min(requested, Math.floor(peakSurplus / minCoverage)))

  if (sized < terms.minCents || f.annualNetCents <= 0) {
    return decline(product, [{ code: "SEASONAL_SURPLUS_TOO_LOW", weight: 1, evidence: { peakMonths: peak.join(","), peakSurplusCents: Math.max(0, peakSurplus), coverage: round2(peakSurplus / requested), minCoverage, minCents: terms.minCents } }], CREDIT_UNION_INPUTS)
  }
  if (sized < requested) {
    reasons.push({ code: "PEAK_SURPLUS_LIMITS_LINE", weight: 0.85, evidence: { limitCents: sized, peakSurplusCents: peakSurplus, minCoverage } })
  }
  reasons.push({
    code: "SEASONAL_REPAYMENT_FITS",
    weight: 0.95,
    evidence: { peakMonths: peak.join(","), peakShare: f.income.peakShare, peakSurplusCents: peakSurplus, coverage: round2(peakSurplus / sized), minCoverage },
  })
  const lastPeak = peak[peak.length - 1]
  const repayBy = new Date(Date.UTC(2000, lastPeak, 0)).toLocaleString("en-CA", { month: "long", timeZone: "UTC" })
  return {
    outcome: "approve",
    product,
    structure: "seasonal_operating",
    limitCents: sized,
    aprBps: terms.aprBps,
    termMonths: t.seasonalTermMonths,
    paymentCents: assessedPayment(p, "seasonal_operating", sized, terms.aprBps, t.seasonalTermMonths),
    reasons,
    conditions: [`Interest-only monthly payments; line repaid to zero by the end of ${repayBy} each year from peak-season sales`, "Annual review of the line"],
    inputsUsed: CREDIT_UNION_INPUTS,
  }
}

/** Thin credit file: members with steady pay can start with a small limit. */
function thinFile({ input, features: f, config }: ModeContext, t: Thresholds, reasons: ReasonHit[]): ModeResult {
  const p = lendingPolicy(config)
  const product = input.request.product
  const terms = productTerms(config, product)!
  const eligible = f.relationship.member && f.income.type === "salaried" && f.avgMonthlyNetCents > 0
  if (!eligible) {
    return decline(product, [{ code: "SHORT_CREDIT_HISTORY", weight: 1, evidence: { months: f.creditHistoryMonths, min: t.thinFileHistoryMonths } }], CREDIT_UNION_INPUTS)
  }
  const structure = structureFor(product)
  const capped = roundLimit(p, Math.min(input.request.amountCents, terms.maxCents, t.thinFileMemberMaxCents))
  // The same coverage test as any other approval: shrink to what the member can afford.
  const affordable = roundLimit(p, maxAffordableCents(p, f.avgMonthlyNetCents, f, t.minDscr, structure, terms.aprBps, null))
  const limit = Math.min(capped, affordable)
  if (limit < terms.minCents) {
    const payment = assessedPayment(p, structure, terms.minCents, terms.aprBps, null)
    return decline(product, [{ code: "LOW_COVERAGE", weight: 1, evidence: { dscr: coverageAt(f.avgMonthlyNetCents, f, payment), minDscr: t.minDscr, paymentCents: payment, maxAffordableCents: 0 } }], CREDIT_UNION_INPUTS)
  }
  if (limit < capped) reasons.push({ code: "LIMIT_REDUCED", weight: 0.85, evidence: { limitCents: limit, requestedCents: input.request.amountCents, basis: "debt service coverage" } })
  reasons.push({ code: "STARTER_PATH", weight: 0.95, evidence: { limitCents: limit, historyMonths: f.creditHistoryMonths, days: f.daysCashOnHand } })
  if (f.relationship.avgBalanceAtNorthgateCents > 0) {
    reasons.push({ code: "SAVINGS_HABIT", weight: 0.5, evidence: { avgBalanceCents: f.relationship.avgBalanceAtNorthgateCents } })
  }
  return {
    outcome: "approve",
    product,
    structure,
    limitCents: limit,
    aprBps: terms.aprBps,
    termMonths: null,
    paymentCents: assessedPayment(p, structure, limit, terms.aprBps, null),
    reasons,
    inputsUsed: CREDIT_UNION_INPUTS,
  }
}

function standard({ input, features: f, config }: ModeContext, t: Thresholds, strong: boolean, reasons: ReasonHit[]): ModeResult {
  const p = lendingPolicy(config)
  const product = input.request.product
  const terms = productTerms(config, product)!
  const structure = structureFor(product)
  const termMonths = chooseTerm(terms, input.request.termMonths)
  const requested = input.request.amountCents
  let cap = Math.min(requested, terms.maxCents)

  const conditions: string[] = []
  const fundingConditions: ModeResult["fundingConditions"] = []
  if (!f.relationship.member && input.kind === "personal" && REVOLVING.has(product) && t.nonMemberRevolvingMaxCents < cap) {
    cap = t.nonMemberRevolvingMaxCents
    reasons.push({ code: "NON_MEMBER_CAP", weight: 0.85, evidence: { capCents: t.nonMemberRevolvingMaxCents } })
  }
  if (f.nsf90 > 0) {
    const nsfCap = Math.floor(f.avgMonthlyNetCents * t.recentNsfLimitMonthsOfNet)
    if (nsfCap < cap) cap = nsfCap
    reasons.push({ code: "RECENT_NSF_CAUTION", weight: 0.9, evidence: { count: f.nsf90, monthsOfNet: t.recentNsfLimitMonthsOfNet } })
    conditions.push("No returned payments in the 90 days before the first draw", "Monthly account statements for the first six months")
    fundingConditions.push({ kind: "no_recent_returns", days: 90 })
  }

  // Coverage: standard minimum, or the lower relationship minimum for strong members.
  let limit = roundLimit(p, cap)
  let payment = assessedPayment(p, structure, limit, terms.aprBps, termMonths)
  let dscr = coverageAt(f.avgMonthlyNetCents, f, payment)
  let relationshipException = false
  if (dscr < t.minDscr) {
    if (strong && dscr >= t.relationshipMinDscr) {
      relationshipException = true
      reasons.push({ code: "RELATIONSHIP_SUPPORTS_APPROVAL", weight: 0.8, evidence: { dscr, minDscr: t.relationshipMinDscr, standardMinDscr: t.minDscr } })
    } else {
      const minDscr = strong ? t.relationshipMinDscr : t.minDscr
      const affordable = roundLimit(p, maxAffordableCents(p, f.avgMonthlyNetCents, f, minDscr, structure, terms.aprBps, termMonths))
      if (affordable < terms.minCents) {
        return decline(product, [{ code: "LOW_COVERAGE", weight: 1, evidence: { dscr, minDscr, paymentCents: payment, maxAffordableCents: 0 } }], CREDIT_UNION_INPUTS)
      }
      limit = Math.min(limit, affordable)
      payment = assessedPayment(p, structure, limit, terms.aprBps, termMonths)
      dscr = coverageAt(f.avgMonthlyNetCents, f, payment)
    }
  }
  // A cap (returned payments, non-member) can push the limit under what the product allows.
  if (limit < terms.minCents || payment <= 0) {
    const basis = f.nsf90 > 0 ? "recent returned payments" : "non-member cap"
    return decline(product, [{ code: "BELOW_PRODUCT_MINIMUM", weight: 1, evidence: { limitCents: limit, minCents: terms.minCents, basis } }], CREDIT_UNION_INPUTS)
  }
  // Below the request only because limits come in round amounts isn't a reduction.
  if (limit < roundLimit(p, Math.min(requested, terms.maxCents)) && !reasons.some((r) => r.code === "NON_MEMBER_CAP")) {
    reasons.push({ code: "LIMIT_REDUCED", weight: 0.85, evidence: { limitCents: limit, requestedCents: requested, basis: f.nsf90 > 0 ? "recent returned payments" : "debt service coverage" } })
  }
  if (requested > terms.maxCents && limit === terms.maxCents) {
    reasons.push({ code: "PRODUCT_MAX", weight: 0.8, evidence: { requestedCents: requested, maxCents: terms.maxCents } })
  }
  if (!relationshipException) reasons.push({ code: "STRONG_COVERAGE", weight: 0.7, evidence: { dscr, minDscr: t.minDscr, paymentCents: payment } })

  return {
    outcome: conditions.length ? "approve_with_conditions" : "approve",
    product,
    structure,
    limitCents: limit,
    aprBps: terms.aprBps,
    termMonths,
    paymentCents: payment,
    reasons,
    conditions: conditions.length ? conditions : undefined,
    fundingConditions,
    relationshipException,
    inputsUsed: CREDIT_UNION_INPUTS,
  }
}
