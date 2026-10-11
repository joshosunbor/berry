import { addBusinessDays, earliestSafeRetry, isBusinessDay } from "@/lib/rules/nsf"
import { RETURN_CODES, type RecoveryRules } from "@/lib/schemas"

/*
 * Failed-payment recovery playbook. Return reasons come from Payments
 * Canada Standard 007; which reasons Berry retries is Berry's own policy
 * (ILLUSTRATIVE: the standards don't say which returns may be re-presented).
 *
 * Retries never land inside the borrower's bank's 2-business-day NSF fee
 * window: a retry is never earlier than earliestSafeRetry(returnDate) from
 * lib/rules/nsf.ts, and the simulator never sends two debits to the same
 * account less than 2 business days apart.
 */

export type RecoveryPath = "retry" | "new_banking_details" | "contact_borrower"

/** What Berry does after each return reason (illustrative policy). */
export const RECOVERY_PATH: Record<keyof typeof RETURN_CODES, RecoveryPath> = {
  "900": "contact_borrower",
  "901": "retry",
  "902": "new_banking_details",
  "903": "contact_borrower",
  "905": "new_banking_details",
  "907": "contact_borrower",
  "908": "retry",
  "909": "new_banking_details",
  "910": "contact_borrower",
  "911": "contact_borrower",
  "912": "new_banking_details",
  "914": "new_banking_details",
  "915": "contact_borrower",
  "916": "contact_borrower",
  "917": "contact_borrower",
  "918": "contact_borrower",
  "919": "contact_borrower",
  "920": "contact_borrower",
  "921": "contact_borrower",
  "922": "contact_borrower",
}

/**
 * Returns the receiving institution sends back before the debit settles
 * (account-level problems); NSF and stopped payments come back after
 * settlement. Timing is illustrative.
 */
export const RETURNED_BEFORE_SETTLEMENT = new Set(["902", "905", "907", "909", "911", "912", "914"])

export const pathLabel: Record<RecoveryPath, string> = {
  retry: "Retry once, after the 2-business-day window",
  new_banking_details: "Ask the borrower for new banking details; no retry",
  contact_borrower: "Contact the borrower; no retry",
}

/** Paydays on or after `from`, given a payroll cadence. */
export function nextPayday(from: string, payroll: { lastPayDate: string; cadenceDays: number } | null): string | null {
  if (!payroll) return null
  let d = new Date(`${payroll.lastPayDate}T00:00:00Z`)
  for (let i = 0; i < 200; i++) {
    const iso = d.toISOString().slice(0, 10)
    if (iso >= from) return iso
    d = new Date(d.getTime() + payroll.cadenceDays * 86_400_000)
  }
  return null
}

const nextBusinessDay = (d: string) => (isBusinessDay(d) ? d : addBusinessDays(d, 1))

export interface RetryPlan {
  date: string
  reason: string
}

/**
 * When to retry a debit returned on `returnedOn`. Never before the safe date;
 * aligned to the next payday when the lender's rules say so and the
 * borrower is paid by payroll.
 */
export function planRetry(returnedOn: string, rules: Pick<RecoveryRules, "alignRetryToNextDeposit" | "minBusinessDaysBetweenAttempts">, payroll: { lastPayDate: string; cadenceDays: number } | null): RetryPlan {
  const safe = addBusinessDays(returnedOn, Math.max(rules.minBusinessDaysBetweenAttempts, 2))
  const floor = safe < earliestSafeRetry(returnedOn) ? earliestSafeRetry(returnedOn) : safe
  if (rules.alignRetryToNextDeposit) {
    const payday = nextPayday(floor, payroll)
    if (payday) {
      const date = nextBusinessDay(payday)
      return { date, reason: `Retry on the borrower's next payday (${date}), after the 2-business-day window.` }
    }
  }
  return { date: floor, reason: `Retry on ${floor}, 2 business days after the return, outside the NSF fee window.` }
}
