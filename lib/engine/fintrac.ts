import type { ComplianceFlag, Transaction } from "@/lib/schemas"

/*
 * FINTRAC Large Cash Transaction Report (LCTR) candidates.
 *
 * A report is required when a reporting entity receives $10,000 or more in
 * cash in a single transaction, or two or more cash amounts totalling
 * $10,000 or more within a consecutive 24-hour window, by or on behalf of the
 * same person or entity. Reports are due within 15 calendar days.
 * Source: https://fintrac-canafe.canada.ca/guidance-directives/transaction-operation/lctr-doie/lctr-doie-eng
 *
 * This is a compliance flag routed to a review queue. It is never a credit
 * factor: no mode reads it when deciding.
 */

export const LCTR_THRESHOLD_CENTS = 1_000_000
export const LCTR_WINDOW_MS = 24 * 60 * 60 * 1000
export const LCTR_SOURCE = "https://fintrac-canafe.canada.ca/guidance-directives/transaction-operation/lctr-doie/lctr-doie-eng"

export interface LargeCashEvent {
  rule: "single" | "24_hour"
  transactions: Transaction[]
  totalCents: number
  windowStart: string
  windowEnd: string
}

/** Finds cash deposits that could require an LCTR. Each deposit belongs to at most one event. */
export function findLargeCashEvents(transactions: Transaction[]): LargeCashEvent[] {
  const cash = transactions
    .filter((t) => t.channel === "CASH" && t.debitCreditMemo === "CREDIT")
    .sort((a, b) => Date.parse(a.transactionTimestamp) - Date.parse(b.transactionTimestamp))
  const events: LargeCashEvent[] = []
  let i = 0
  while (i < cash.length) {
    const start = Date.parse(cash[i].transactionTimestamp)
    let j = i
    let total = 0
    while (j < cash.length && Date.parse(cash[j].transactionTimestamp) - start < LCTR_WINDOW_MS) {
      total += cash[j].amountCents
      j++
    }
    if (total >= LCTR_THRESHOLD_CENTS) {
      const group = cash.slice(i, j)
      events.push({
        rule: group.length === 1 ? "single" : "24_hour",
        transactions: group,
        totalCents: total,
        windowStart: group[0].transactionTimestamp,
        windowEnd: group[group.length - 1].transactionTimestamp,
      })
      i = j
    } else {
      i++
    }
  }
  return events
}

const fmt = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100)

export function toComplianceFlag(event: LargeCashEvent): ComplianceFlag {
  const what =
    event.rule === "single"
      ? `A single cash deposit of ${fmt(event.totalCents)}`
      : `${event.transactions.length} cash deposits totalling ${fmt(event.totalCents)} within 24 hours`
  return {
    type: "FINTRAC_LCTR_CANDIDATE",
    summary: `${what} on ${event.windowStart.slice(0, 10)}. Possible Large Cash Transaction Report; route to FINTRAC review. Not a credit factor.`,
    transactionIds: event.transactions.map((t) => t.transactionId),
    totalCents: event.totalCents,
    windowStart: event.windowStart,
    windowEnd: event.windowEnd,
    rule: event.rule,
    creditFactor: false,
    source: LCTR_SOURCE,
  }
}
