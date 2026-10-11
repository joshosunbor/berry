import { z } from "zod"
import type { ReasonHit } from "../reasons"
import type { ModeContext, ModeResult } from "../types"
import { assessedPayment, chooseTerm, commonStrengths, concerns, coverageAt, decline, maxAffordableCents, productTerms, roundLimit, structureFor } from "./common"

/*
 * Aspen Bank: policy-driven. Fixed thresholds checked in order; the first
 * failure declines (or refers). Approvals carry a documentation checklist
 * and standardized conditions.
 */

const Thresholds = z.object({
  minHistoryMonths: z.number(),
  minCreditHistoryMonths: z.number(),
  maxIncomeCv: z.number(),
  minDscr: z.number(),
  maxNsf12m: z.number(),
  maxCreditUtilization: z.number(),
})

export const BANK_INPUTS = [
  "windowMonths",
  "creditHistoryMonths",
  "foreignReportAvailable",
  "nsf12m",
  "creditUtilization",
  "incomeCv",
  "avgMonthlyNetCents",
  "existingDebtMonthlyCents",
  "income.type",
]

const STANDARD_CONDITIONS = {
  personal: ["Satisfactory receipt of all listed documents", "Pre-authorized debit agreement signed before funding"],
  business: [
    "Satisfactory receipt of all listed documents",
    "Annual financial statements within 120 days of year end",
    "Pre-authorized debit agreement signed before funding",
  ],
}

export function decideBank({ input, features: f, config }: ModeContext): ModeResult {
  const t = Thresholds.parse(config.thresholds)
  const product = input.request.product

  // Every policy check runs, so a decline lists all the reasons, not just the first.
  const failed: ReasonHit[] = []
  if (f.windowMonths < t.minHistoryMonths) {
    failed.push({ code: "SHORT_ACCOUNT_HISTORY", weight: 1, evidence: { months: f.windowMonths, min: t.minHistoryMonths } })
  }
  if (f.creditHistoryMonths < t.minCreditHistoryMonths && !f.foreignReportAvailable) {
    failed.push({ code: "SHORT_CREDIT_HISTORY", weight: 0.98, evidence: { months: f.creditHistoryMonths, min: t.minCreditHistoryMonths } })
  }
  if (f.nsf12m > t.maxNsf12m) failed.push({ code: "NSF_HISTORY", weight: 0.96, evidence: { count: f.nsf12m, max: t.maxNsf12m } })
  if (f.creditUtilization !== null && f.creditUtilization > t.maxCreditUtilization) {
    failed.push({ code: "HIGH_CARD_UTILIZATION", weight: 0.94, evidence: { utilization: f.creditUtilization, max: t.maxCreditUtilization } })
  }
  if (f.incomeCv > t.maxIncomeCv) failed.push({ code: "INCOME_TOO_VARIABLE", weight: 0.92, evidence: { incomeCv: f.incomeCv, max: t.maxIncomeCv } })
  if (failed.length) return decline(product, [...failed, ...concerns(f)], BANK_INPUTS)

  const terms = productTerms(config, product)!
  const structure = structureFor(product)
  const termMonths = chooseTerm(terms, input.request.termMonths)
  const kind = input.kind

  if (f.income.type === "gig" || f.income.type === "invoice" || f.income.type === "irregular") {
    return {
      outcome: "refer",
      product,
      structure: null,
      limitCents: 0,
      aprBps: null,
      termMonths: null,
      paymentCents: null,
      reasons: [{ code: "INCOME_NEEDS_DOCUMENTS", weight: 0.9, evidence: { incomeType: f.income.type } }],
      documents: [
        { name: "Notices of Assessment, two most recent years", received: false },
        ...(config.documentChecklist ?? []).slice(0, 1).map((name) => ({ name, received: false })),
      ],
      inputsUsed: BANK_INPUTS,
    }
  }

  const requested = Math.min(input.request.amountCents, terms.maxCents)
  const reasons: ReasonHit[] = commonStrengths(f)
  if (f.creditHistoryMonths >= t.minCreditHistoryMonths) {
    reasons.push({ code: "ESTABLISHED_CREDIT_HISTORY", weight: 0.3, evidence: { months: f.creditHistoryMonths } })
  }

  let limit = requested
  let payment = assessedPayment(structure, limit, terms.aprBps, termMonths)
  let dscr = coverageAt(f.avgMonthlyNetCents, f, payment)
  if (dscr < t.minDscr) {
    const affordable = roundLimit(maxAffordableCents(f.avgMonthlyNetCents, f, t.minDscr, structure, terms.aprBps, termMonths))
    if (affordable < terms.minCents) {
      return decline(product, [{ code: "LOW_COVERAGE", weight: 1, evidence: { dscr, minDscr: t.minDscr, paymentCents: payment, maxAffordableCents: 0 } }], BANK_INPUTS)
    }
    reasons.push({ code: "LIMIT_REDUCED", weight: 0.8, evidence: { limitCents: affordable, requestedCents: input.request.amountCents, basis: `minimum coverage ${t.minDscr}x` } })
    limit = affordable
    payment = assessedPayment(structure, limit, terms.aprBps, termMonths)
    dscr = coverageAt(f.avgMonthlyNetCents, f, payment)
  }
  if (input.request.amountCents > terms.maxCents && limit === terms.maxCents) {
    reasons.push({ code: "PRODUCT_MAX", weight: 0.8, evidence: { requestedCents: input.request.amountCents, maxCents: terms.maxCents } })
  }
  reasons.push({ code: "STRONG_COVERAGE", weight: 0.7, evidence: { dscr, minDscr: t.minDscr, paymentCents: payment } })

  const checklist = config.documentChecklist ?? []
  const documents = checklist.filter((d) => kind === "business" || !d.startsWith("Business:")).map((name) => ({ name, received: false }))

  return {
    outcome: "approve",
    product,
    structure,
    limitCents: limit,
    aprBps: terms.aprBps,
    termMonths,
    paymentCents: payment,
    reasons,
    conditions: STANDARD_CONDITIONS[kind],
    documents,
    inputsUsed: BANK_INPUTS,
  }
}
