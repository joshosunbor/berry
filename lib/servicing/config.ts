import { z } from "zod"
import servicingJson from "@/data/servicing.json"

/** Illustrative servicing settings (rails, collections timing, charge-off, borrower bank fees). */
export const ServicingConfig = z.object({
  version: z.number().int().positive(),
  rails: z.object({
    aft: z.object({ costCents: z.number().int().nonnegative(), cutoffLocal: z.string(), availableLocal: z.string() }),
    etransfer: z.object({ costCents: z.number().int().nonnegative(), limitCents: z.number().int().positive(), minutesToComplete: z.number().positive() }),
    rtr_simulated: z.object({ costCents: z.number().int().nonnegative(), secondsToComplete: z.number().positive() }),
  }),
  collections: z.object({
    settlementBusinessDays: z.number().int().positive(),
    returnBusinessDaysAfterSettlement: z.number().int().nonnegative(),
    cureWindowDays: z.number().int().positive(),
  }),
  chargeOffDaysPastDue: z.number().int().positive(),
  /** Illustrative: seasonal lines are drawn only to keep this many months of average spending in the borrower's account. */
  operatingReserveMonthsOfSpending: z.number().positive(),
  /** Thin-file credit-building milestones (illustrative). */
  creditBuilding: z.object({
    onTimePaymentsForReview: z.number().int().positive(),
    reviewLimitCents: z.number().int().positive(),
    monthsForUnsecuredLine: z.number().int().positive(),
  }),
  /** Illustrative poor-harvest stress test for seasonal operating lines. */
  stress: z.object({
    poorHarvestRevenueDropPct: z.number().int().min(1).max(90),
    optionsPct: z.array(z.number().int().min(1).max(90)).min(1),
  }),
  borrowerBank: z.object({
    standardNsfFeeCents: z.number().int().nonnegative(),
    provincialCreditUnionNsfFeeCents: z.number().int().nonnegative(),
  }),
})

export type ServicingConfig = z.infer<typeof ServicingConfig>
export const SERVICING: ServicingConfig = ServicingConfig.parse(servicingJson)
