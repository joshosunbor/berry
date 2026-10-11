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
  borrowerBank: z.object({
    standardNsfFeeCents: z.number().int().nonnegative(),
    provincialCreditUnionNsfFeeCents: z.number().int().nonnegative(),
  }),
})

export type ServicingConfig = z.infer<typeof ServicingConfig>
export const SERVICING: ServicingConfig = ServicingConfig.parse(servicingJson)
