import type { Features } from "@/lib/engine/features"
import { buildPadPlan, type Draw, type PadPlan } from "@/lib/engine/repayment"
import type { Decision } from "@/lib/schemas"
import { SERVICING } from "./config"

/*
 * Poor-harvest stress test for seasonal operating lines (illustrative).
 *
 * Assumes the coming year looks like the borrower's past year, by calendar
 * month, except that peak-season revenue is `dropPct` lower and costs are
 * unchanged. This season's draws happen before the harvest, so they don't
 * change. The question is what the harvest can repay, and what next
 * season then needs:
 *
 * - Before the sweep, the account holds what it held at the end of last
 *   year's harvest, plus what was drawn, less interest paid and the lost
 *   revenue. The sweep takes what's above the operating reserve, up to the
 *   drawn balance. Anything it can't take is carried into next season.
 * - Next season's draws are sized by the same function as this season's
 *   (buildPadPlan), starting from wherever the account ended up. If the
 *   carried balance plus those draws is above the limit, the difference is
 *   the shortfall: it is shown, never capped away.
 *
 * With dropPct = 0 the same steps reproduce the base plan, and a test
 * checks that.
 */

export interface SeasonResult {
  /** Highest drawn balance this season (draws happen before the harvest). */
  peakDrawnCents: number
  peakUtilization: number
  /** Interest this season; under stress, plus a year's interest on any carried balance. */
  seasonInterestCents: number
  carriedInterestCents: number
  sweepRepaidCents: number
  sweepFullyRepays: boolean
  carriedCents: number
  /** What next season needs at its peak: carried balance plus next season's draws, uncapped. */
  nextSeasonNeedCents: number
  nextSeasonDraws: Draw[]
  /** Need above the limit (0 if within it). */
  overLimitCents: number
}

export interface StressResult {
  dropPct: number
  limitCents: number
  reserveCents: number
  peakRevenueCents: number
  lostRevenueCents: number
  /** Cash above the reserve after a normal harvest and a full sweep: the cushion a poor harvest eats into. */
  cushionCents: number
  base: SeasonResult
  stressed: SeasonResult
  /** A limit that would cover next season's need under stress, rounded up to the next $5,000 (0 if the current limit covers it). */
  requestedLimitCents: number
  /** Options a lender would consider if the sweep falls short (none is chosen). */
  options: { carryOver: { interestCents: number }; termOut: { months: number; paymentCents: number }; limitReview: { newLimitCents: number } } | null
}

export interface StressInput {
  decision: Decision
  features: Pick<Features, "income" | "monthly" | "avgMonthlyOutflowCents">
  kind: "personal" | "business"
  agreementSignedOn: string
  plan: PadPlan
  dropPct: number
  operatingReserveMonths?: number
}

const lastPeakMonth = (peak: number[]) => peak.find((m) => !peak.includes((m % 12) + 1)) ?? peak.at(-1)!
const nextYear = (iso: string) => `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function amortizedPayment(principal: number, aprBps: number, months: number) {
  const r = aprBps / 10_000 / 12
  return r === 0 ? Math.ceil(principal / months) : Math.ceil((principal * r) / (1 - Math.pow(1 + r, -months)))
}

function season(input: StressInput, dropPct: number, reserve: number) {
  const { decision, features, plan } = input
  const peak = features.income.peakMonths
  const inPeak = (m: { month: string }) => peak.includes(Number(m.month.slice(5, 7)))
  const peakRevenue = sum(features.monthly.filter(inPeak).map((m) => m.incomeCents))
  const lost = Math.round((peakRevenue * dropPct) / 100)

  const drawn = sum((plan.draws ?? []).map((d) => d.amountCents))
  const interest = plan.totalInterestCents
  const end = features.monthly.filter((m) => Number(m.month.slice(5, 7)) === lastPeakMonth(peak))
  const closingAfterHarvest = Math.min(...end.map((m) => m.closingBalanceCents))

  // The sweep: what's above the reserve once the harvest is in, up to what's drawn.
  const beforeSweep = closingAfterHarvest + drawn - interest - lost
  const repaid = Math.max(0, Math.min(drawn, beforeSweep - reserve))
  const carried = drawn - repaid
  const after = beforeSweep - repaid
  // How much lower than after a normal year the account starts next season.
  const normalAfter = closingAfterHarvest - interest
  const shift = normalAfter - after

  // Next season's draws, by the same function, from the lower starting point; the limit is lifted so nothing is capped.
  const next = buildPadPlan({
    decision: { ...decision, limitCents: decision.limitCents * 100 },
    features: { ...features, monthly: features.monthly.map((m) => ({ ...m, lowBalanceCents: m.lowBalanceCents - shift })) },
    kind: input.kind,
    agreementSignedOn: nextYear(input.agreementSignedOn),
    operatingReserveMonths: input.operatingReserveMonths,
  })
  const nextDraws = next.draws ?? []
  const need = carried + sum(nextDraws.map((d) => d.amountCents))
  const carriedInterest = Math.round((carried * decision.aprBps!) / 10_000)

  const result: SeasonResult = {
    peakDrawnCents: drawn,
    peakUtilization: drawn / decision.limitCents,
    seasonInterestCents: interest + carriedInterest,
    carriedInterestCents: carriedInterest,
    sweepRepaidCents: repaid,
    sweepFullyRepays: carried === 0,
    carriedCents: carried,
    nextSeasonNeedCents: need,
    nextSeasonDraws: nextDraws,
    overLimitCents: Math.max(0, need - decision.limitCents),
  }
  return { result, peakRevenue, lost, cushion: normalAfter - reserve }
}

export function stressSeason(input: StressInput): StressResult {
  if (input.decision.structure !== "seasonal_operating" || !input.plan.draws) throw new Error("The stress test applies to seasonal operating lines")
  const reserve = Math.round(input.features.avgMonthlyOutflowCents * (input.operatingReserveMonths ?? SERVICING.operatingReserveMonthsOfSpending))
  const base = season(input, 0, reserve)
  const stressed = season(input, input.dropPct, reserve)
  const s = stressed.result
  const apr = input.decision.aprBps!
  // Rounded up to the next $5,000, the usual step for a limit.
  const requestedLimitCents = s.overLimitCents > 0 ? Math.ceil(s.nextSeasonNeedCents / 500_000) * 500_000 : 0
  return {
    dropPct: input.dropPct,
    limitCents: input.decision.limitCents,
    reserveCents: reserve,
    peakRevenueCents: stressed.peakRevenue,
    lostRevenueCents: stressed.lost,
    cushionCents: base.cushion,
    base: base.result,
    stressed: s,
    requestedLimitCents,
    options:
      s.carriedCents > 0
        ? {
            carryOver: { interestCents: s.carriedInterestCents },
            termOut: { months: 12, paymentCents: amortizedPayment(s.carriedCents, apr, 12) },
            limitReview: { newLimitCents: requestedLimitCents || input.decision.limitCents },
          }
        : null,
  }
}
