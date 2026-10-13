import { z } from "zod"
import { Bps, Illustrative, InstitutionId, IsoDate, Mode, PositiveCents, ProductType } from "./common"
import { AuthorityTier } from "./decision"

/*
 * Institution configuration (/data/institutions/*.json). Limits, rates and
 * thresholds are config, not code, and every config is versioned so policy
 * changes (Day 5) can be logged and previewed.
 */

export const ProductTerms = z.object({
  product: ProductType,
  offered: z.boolean(),
  aprBps: Bps,
  minCents: PositiveCents,
  maxCents: PositiveCents,
  /** Allowed terms for term products; empty for revolving credit. */
  termMonths: z.array(z.number().int().positive()),
})

export const RecoveryRules = z.object({
  /** Retries after a returned PAD before outreach. */
  maxRetries: z.number().int().nonnegative(),
  /** Align the retry to the borrower's next detected deposit date. */
  alignRetryToNextDeposit: z.boolean(),
  /**
   * Minimum business days between attempts, so a retry never lands inside
   * the borrower's bank's 2-business-day NSF fee window (NSF rules in force
   * 2026-03-12; FCAC news release).
   */
  minBusinessDaysBetweenAttempts: z.number().int().min(2),
  notifyOnFirstFailure: z.boolean(),
  outreachAfterFailures: z.number().int().positive(),
  hardshipSignalThreshold: z.number().int().positive(),
})

export const InstitutionConfig = z.object({
  id: InstitutionId,
  mode: Mode,
  name: z.string(),
  version: z.number().int().positive(),
  effectiveFrom: IsoDate,
  changeNote: z.string(),
  products: z.array(ProductTerms),
  /**
   * Mode-specific numeric thresholds (e.g. minHistoryMonths, maxIncomeCv,
   * minDscr). Each mode module parses the keys it needs with its own schema.
   */
  thresholds: z.record(z.string(), z.number()),
  /** Delegated authority tiers, ordered lowest to highest. Credit union only. */
  authorityTiers: z.array(AuthorityTier).optional(),
  /** Bank mode documentation checklist. */
  documentChecklist: z.array(z.string()).optional(),
  /** Bank mode: income types referred for tax documents instead of decided on cash flow. */
  referIncomeTypes: z.array(z.enum(["salaried", "pension", "gig", "seasonal", "invoice", "steady_business", "irregular"])).optional(),
  recovery: RecoveryRules,
  illustrative: Illustrative,
})

export type ProductTerms = z.infer<typeof ProductTerms>
export type RecoveryRules = z.infer<typeof RecoveryRules>
export type InstitutionConfig = z.infer<typeof InstitutionConfig>
