import { formatCents } from "@/lib/money"
import { SERVICING, type ServicingConfig } from "./config"
import type { LoanSnapshot } from "./views"

/*
 * Thin-file credit-building path (CLAUDE.md §4A.3): a starter limit plus
 * visible milestones. It fills the gap foreign credit reports don't cover.
 * Milestones and amounts are illustrative.
 */

export interface Milestone {
  label: string
  detail: string
  progress: number
  target: number
  reached: boolean
}

export function milestones(s: LoanSnapshot, config: ServicingConfig = SERVICING): Milestone[] {
  const c = config.creditBuilding
  return [
    {
      label: `${c.onTimePaymentsForReview} on-time payments in a row`,
      detail: `Limit review to ${formatCents(c.reviewLimitCents, { whole: true })}`,
      progress: Math.min(s.onTimeStreak, c.onTimePaymentsForReview),
      target: c.onTimePaymentsForReview,
      reached: s.onTimeStreak >= c.onTimePaymentsForReview,
    },
    {
      label: `${c.monthsForUnsecuredLine} months of on-time history`,
      detail: "Eligible to apply for an unsecured line of credit",
      progress: Math.min(s.monthsSinceFunding, c.monthsForUnsecuredLine),
      target: c.monthsForUnsecuredLine,
      reached: s.monthsSinceFunding >= c.monthsForUnsecuredLine && s.returns === 0,
    },
  ]
}
