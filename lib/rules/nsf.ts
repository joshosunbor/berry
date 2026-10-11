/*
 * NSF (non-sufficient funds) fee rules for personal deposit accounts, in
 * force 2026-03-12 under the Regulations Amending the Financial Consumer
 * Protection Framework Regulations:
 * - an NSF fee is capped at $10
 * - at most one NSF fee on the same account in a period of 2 business days
 * - no NSF fee when the item would overdraw the account by less than $10
 * Source: FCAC news release, 2026-03-12
 * https://www.canada.ca/en/financial-consumer-agency/news/2026/03/new-nsf-fee-regulations-bring-down-cost-of-banking-for-canadians.html
 *
 * Berry applies these to the borrower's own bank account in its simulator.
 * Business days here are weekdays; statutory holidays are not modelled
 * (illustrative simplification).
 */

export const NSF_RULES = {
  inForce: "2026-03-12",
  capCents: 1_000,
  minOverdraftCents: 1_000,
  windowBusinessDays: 2,
  source: "https://www.canada.ca/en/financial-consumer-agency/news/2026/03/new-nsf-fee-regulations-bring-down-cost-of-banking-for-canadians.html",
} as const

const day = (d: string) => new Date(`${d}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const isWeekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6

export function isBusinessDay(date: string): boolean {
  return isWeekday(day(date))
}

/** The date `n` business days after `date`. */
export function addBusinessDays(date: string, n: number): string {
  const d = day(date)
  let added = 0
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (isWeekday(d)) added++
  }
  return iso(d)
}

/** Business days from `from` to `to` (0 if the same day or `to` is earlier). */
export function businessDaysBetween(from: string, to: string): number {
  let n = 0
  for (let d = day(from); iso(d) < to; ) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (isWeekday(d) && iso(d) <= to) n++
  }
  return n
}

export interface NsfFeeInput {
  accountKind: "personal" | "business"
  /** Date the item was returned unpaid. */
  date: string
  /** How far the item would have overdrawn the account. */
  shortfallCents: number
  /** The bank's standard NSF fee before any cap (illustrative). */
  bankFeeCents: number
  /** Dates of NSF fees already charged on this account. */
  priorFeeDates: string[]
}

export interface NsfFeeResult {
  feeCents: number
  rule: "not_regulated" | "under_minimum_overdraft" | "one_fee_per_window" | "capped" | "standard"
  explanation: string
}

/** The NSF fee the borrower's bank may charge for a returned item. */
export function nsfFee(input: NsfFeeInput): NsfFeeResult {
  if (input.accountKind === "business" || input.date < NSF_RULES.inForce) {
    return {
      feeCents: input.bankFeeCents,
      rule: "not_regulated",
      explanation:
        input.accountKind === "business"
          ? "Business accounts are outside the personal-account NSF fee rules; the bank's standard fee applies (illustrative)."
          : "Before 12 March 2026 the bank's standard NSF fee applied.",
    }
  }
  if (input.shortfallCents < NSF_RULES.minOverdraftCents) {
    return { feeCents: 0, rule: "under_minimum_overdraft", explanation: "No fee: the account would have been overdrawn by less than $10." }
  }
  const recent = input.priorFeeDates.some((p) => p <= input.date && businessDaysBetween(p, input.date) < NSF_RULES.windowBusinessDays)
  if (recent) {
    return { feeCents: 0, rule: "one_fee_per_window", explanation: "No fee: an NSF fee was already charged on this account within 2 business days." }
  }
  if (input.bankFeeCents > NSF_RULES.capCents) {
    return { feeCents: NSF_RULES.capCents, rule: "capped", explanation: "Fee capped at $10 for personal accounts." }
  }
  return { feeCents: input.bankFeeCents, rule: "standard", explanation: "The bank's fee is within the $10 cap." }
}

/**
 * The earliest date to re-present a returned debit: after the 2-business-day
 * window, and never on a weekend. Retrying sooner is unlikely to succeed and
 * adds pressure on the borrower without helping recovery.
 */
export function earliestSafeRetry(returnedDate: string): string {
  return addBusinessDays(returnedDate, NSF_RULES.windowBusinessDays)
}
