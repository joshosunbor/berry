import { z } from "zod"
import type { ProductType } from "@/lib/schemas"
import type { ReasonHit } from "../reasons"
import type { ModeContext, ModeResult } from "../types"
import { assessedPayment, chooseTerm, lendingPolicy, commonStrengths, concerns, coverageAt, decline, maxAffordableCents, productTerms, roundLimit, structureFor } from "./common"

/*
 * Kite: instant and automated. Cash flow only, no relationship factors.
 * Sizes everything on the median month so a few big months can't inflate
 * a limit. Short reason list; conservative limits.
 */

const Thresholds = z.object({
  minHistoryMonths: z.number(),
  maxNsf90: z.number(),
  maxCreditUtilization: z.number(),
  minDscrOnMedian: z.number(),
  personalRevolvingToMedianNet: z.number(),
  businessRevolvingToMedianNet: z.number(),
  maxRevolvingPaymentShareOfMedianNet: z.number(),
  thinFileMaxCents: z.number().int(),
  thinFileHistoryMonths: z.number(),
})

export const FINTECH_INPUTS = [
  "windowMonths",
  "nsf90",
  "creditUtilization",
  "medianMonthlyNetCents",
  "existingDebtMonthlyCents",
  "creditHistoryMonths",
  "foreignReportAvailable",
  "income.type",
]

export function decideFintech({ input, features: f, config }: ModeContext): ModeResult {
  const p = lendingPolicy(config)
  const t = Thresholds.parse(config.thresholds)
  const requestedProduct = input.request.product
  const reject = (hit: ReasonHit) => decline(requestedProduct, [hit], FINTECH_INPUTS)
  const median = f.medianMonthlyNetCents

  const failed: ReasonHit[] = []
  if (f.windowMonths < t.minHistoryMonths) {
    failed.push({ code: "SHORT_ACCOUNT_HISTORY", weight: 1, evidence: { months: f.windowMonths, min: t.minHistoryMonths } })
  }
  if (f.nsf90 > t.maxNsf90) failed.push({ code: "RECENT_NSF", weight: 0.98, evidence: { count: f.nsf90, max: t.maxNsf90 } })
  if (f.creditUtilization !== null && f.creditUtilization > t.maxCreditUtilization) {
    failed.push({ code: "HIGH_CARD_UTILIZATION", weight: 0.96, evidence: { utilization: f.creditUtilization, max: t.maxCreditUtilization } })
  }
  if (median <= 0) failed.push({ code: "NEGATIVE_TYPICAL_MONTH", weight: 0.94, evidence: { medianNetCents: median } })
  if (failed.length) return decline(requestedProduct, [...failed, ...concerns(f)], FINTECH_INPUTS)

  const reasons: ReasonHit[] = commonStrengths(f).slice(0, 2)

  // No seasonal structuring: offer a standard line instead.
  let product: ProductType = requestedProduct
  let terms = productTerms(config, product)
  if (!terms && product === "seasonal_operating_line") {
    product = "business_line_of_credit"
    terms = productTerms(config, product)
    reasons.push({ code: "NO_SEASONAL_STRUCTURE", weight: 0.75, evidence: { medianNetCents: median } })
  }
  if (!terms) return reject({ code: "PRODUCT_MAX", weight: 1, evidence: { requestedCents: input.request.amountCents, maxCents: 0 } })

  const structure = structureFor(product)
  const termMonths = chooseTerm(terms, input.request.termMonths)
  const requested = input.request.amountCents

  let cap = Math.min(requested, terms.maxCents)
  let basis = "product maximum"
  if (structure !== "term") {
    const multiple = input.kind === "business" ? t.businessRevolvingToMedianNet : t.personalRevolvingToMedianNet
    const byMedian = Math.floor(median * multiple)
    const byPayment = Math.floor((median * t.maxRevolvingPaymentShareOfMedianNet) / p.revolvingRate)
    const sized = Math.min(byMedian, byPayment)
    if (sized < cap) {
      cap = sized
      basis = `${multiple}x median monthly net cash flow`
    }
  } else {
    const affordable = maxAffordableCents(p, median, f, t.minDscrOnMedian, structure, terms.aprBps, termMonths)
    if (affordable < cap) {
      cap = affordable
      basis = `minimum coverage ${t.minDscrOnMedian}x on the median month`
    }
  }

  const thinFile = f.creditHistoryMonths < t.thinFileHistoryMonths && !f.foreignReportAvailable
  if (thinFile && t.thinFileMaxCents < cap) {
    cap = t.thinFileMaxCents
    reasons.push({ code: "THIN_FILE_LIMIT", weight: 0.85, evidence: { months: f.creditHistoryMonths, capCents: t.thinFileMaxCents } })
    basis = "thin-file starter cap"
  }

  const limit = roundLimit(p, cap)
  if (limit < terms.minCents) {
    // Say what actually declined it: a term loan that fails coverage even at the product
    // minimum, or a line whose sizing rule comes out under the minimum.
    if (structure === "term") {
      const payment = assessedPayment(p, structure, terms.minCents, terms.aprBps, termMonths)
      return decline(
        requestedProduct,
        [{ code: "LOW_COVERAGE", weight: 1, evidence: { dscr: coverageAt(median, f, payment), minDscr: t.minDscrOnMedian, paymentCents: payment, maxAffordableCents: 0 } }],
        FINTECH_INPUTS,
      )
    }
    return decline(requestedProduct, [{ code: "BELOW_PRODUCT_MINIMUM", weight: 1, evidence: { limitCents: limit, minCents: terms.minCents, basis } }], FINTECH_INPUTS)
  }
  // Below the request only because limits come in round amounts isn't a reduction.
  if (limit < roundLimit(p, Math.min(requested, terms.maxCents)) && basis !== "thin-file starter cap") {
    reasons.push({ code: "LIMIT_REDUCED", weight: 0.9, evidence: { limitCents: limit, requestedCents: requested, basis } })
  }

  // Only mention the product maximum when it is what actually limited the offer.
  if (requested > terms.maxCents && limit === terms.maxCents) {
    reasons.push({ code: "PRODUCT_MAX", weight: 0.8, evidence: { requestedCents: requested, maxCents: terms.maxCents } })
  }
  const payment = assessedPayment(p, structure, limit, terms.aprBps, termMonths)
  reasons.push({ code: "STRONG_COVERAGE", weight: 0.65, evidence: { dscr: coverageAt(median, f, payment), minDscr: t.minDscrOnMedian, paymentCents: payment } })

  return {
    outcome: "approve",
    product,
    structure,
    limitCents: limit,
    aprBps: terms.aprBps,
    termMonths,
    paymentCents: payment,
    reasons,
    inputsUsed: FINTECH_INPUTS,
  }
}
