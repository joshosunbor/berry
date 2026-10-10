import { dollars } from "@/lib/money"
import type { InstitutionConfig, ProductTerms, RecoveryRules } from "@/lib/schemas"

/*
 * Starting institution configs (version 1). Every limit, rate, threshold and
 * authority tier is illustrative: chosen to make the three lending styles
 * visible, not taken from any real institution. Thresholds are tuned when
 * the engine is built.
 */

const EFFECTIVE_FROM = "2026-10-01"

function terms(product: ProductTerms["product"], aprPct: number, min: number, max: number, termMonths: number[] = []): ProductTerms {
  return { product, offered: true, aprBps: Math.round(aprPct * 100), minCents: dollars(min), maxCents: dollars(max), termMonths }
}

/** Retries respect the 2-business-day NSF fee window (FCAC, in force 2026-03-12). */
const RECOVERY: RecoveryRules = {
  maxRetries: 1,
  alignRetryToNextDeposit: true,
  minBusinessDaysBetweenAttempts: 2,
  notifyOnFirstFailure: true,
  outreachAfterFailures: 2,
  hardshipSignalThreshold: 3,
}

export const NORTHGATE: InstitutionConfig = {
  id: "northgate",
  mode: "credit_union",
  name: "Northgate Credit Union",
  version: 1,
  effectiveFrom: EFFECTIVE_FROM,
  changeNote: "Initial policy",
  products: [
    terms("personal_loan", 8.99, 1_000, 50_000, [12, 24, 36, 48, 60]),
    terms("line_of_credit", 9.49, 1_000, 50_000),
    terms("credit_card", 12.99, 500, 15_000),
    terms("starter_credit", 11.99, 300, 3_000),
    terms("business_term_loan", 8.25, 10_000, 500_000, [24, 36, 48, 60, 84]),
    terms("business_line_of_credit", 8.75, 5_000, 250_000),
    terms("equipment_financing", 7.75, 10_000, 750_000, [36, 48, 60, 84]),
    terms("seasonal_operating_line", 7.95, 10_000, 250_000),
  ],
  thresholds: {
    minDscr: 1.2,
    /** Seasonal or irregular income is assessed on annual, not monthly, cash flow. */
    seasonalAnnualDscr: 1.25,
    maxNsf90: 2,
    tenureYearsForFullRelationshipCredit: 5,
    maxLimitToAnnualNetInflow: 0.35,
  },
  authorityTiers: [
    { id: "msr", title: "Member Service Representative", order: 0, maxExposureCents: dollars(10_000) },
    { id: "lender", title: "Lender", order: 1, maxExposureCents: dollars(50_000) },
    { id: "branch_manager", title: "Branch Manager", order: 2, maxExposureCents: dollars(250_000) },
    { id: "credit_committee", title: "Credit Committee", order: 3, maxExposureCents: null },
  ],
  recovery: RECOVERY,
  illustrative: true,
}

export const KITE: InstitutionConfig = {
  id: "kite",
  mode: "fintech",
  name: "Kite",
  version: 1,
  effectiveFrom: EFFECTIVE_FROM,
  changeNote: "Initial policy",
  products: [
    terms("personal_loan", 13.99, 1_000, 20_000, [12, 24, 36]),
    terms("line_of_credit", 14.99, 500, 15_000),
    terms("credit_card", 19.99, 300, 5_000),
    terms("starter_credit", 17.99, 300, 1_500),
    terms("business_term_loan", 12.99, 5_000, 100_000, [12, 24, 36]),
    terms("business_line_of_credit", 13.99, 2_000, 50_000),
    terms("equipment_financing", 11.99, 5_000, 150_000, [24, 36, 48]),
    terms("seasonal_operating_line", 13.99, 2_000, 25_000),
  ],
  thresholds: {
    minHistoryMonths: 3,
    maxNsf90: 1,
    /** Limit as a share of average monthly net cash flow. */
    limitToMonthlyNet: 1.5,
    maxIncomeCv: 0.9,
  },
  recovery: RECOVERY,
  illustrative: true,
}

export const ASPEN: InstitutionConfig = {
  id: "aspen",
  mode: "bank",
  name: "Aspen Bank",
  version: 1,
  effectiveFrom: EFFECTIVE_FROM,
  changeNote: "Initial policy",
  products: [
    terms("personal_loan", 9.99, 2_000, 50_000, [12, 24, 36, 48, 60]),
    terms("line_of_credit", 10.49, 2_000, 50_000),
    terms("credit_card", 20.99, 500, 15_000),
    terms("starter_credit", 19.99, 500, 2_000),
    terms("business_term_loan", 8.95, 10_000, 1_000_000, [24, 36, 48, 60, 84]),
    terms("business_line_of_credit", 9.45, 10_000, 500_000),
    terms("equipment_financing", 8.45, 25_000, 1_000_000, [36, 48, 60, 84]),
    terms("seasonal_operating_line", 9.45, 25_000, 500_000),
  ],
  thresholds: {
    minHistoryMonths: 12,
    minCreditHistoryMonths: 24,
    maxIncomeCv: 0.35,
    minDscr: 1.25,
    maxNsf12m: 1,
  },
  documentChecklist: [
    "Government-issued photo ID",
    "Two most recent pay stubs or Notice of Assessment",
    "12 months of bank statements",
    "Business: two years of financial statements",
    "Business: articles of incorporation or registration",
  ],
  recovery: RECOVERY,
  illustrative: true,
}

export const INSTITUTIONS = [NORTHGATE, KITE, ASPEN]
