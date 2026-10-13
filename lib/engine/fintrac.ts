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
        // A deposit that meets the threshold on its own is a single large deposit, whatever came with it.
        rule: group.some((t) => t.amountCents >= LCTR_THRESHOLD_CENTS) ? "single" : "24_hour",
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

/** "A single cash deposit of $12,000.00", plus any smaller cash deposits in the same 24 hours. */
function singleText(event: LargeCashEvent): string {
  const largest = Math.max(...event.transactions.map((t) => t.amountCents))
  const others = event.transactions.length - 1
  return others
    ? `A single cash deposit of ${fmt(largest)}, with ${others} other cash deposit${others === 1 ? "" : "s"} in the same 24 hours (${fmt(event.totalCents)} in all)`
    : `A single cash deposit of ${fmt(largest)}`
}

export function toComplianceFlag(event: LargeCashEvent): ComplianceFlag {
  const what = event.rule === "single" ? singleText(event) : `${event.transactions.length} cash deposits totalling ${fmt(event.totalCents)} within 24 hours`
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

// ---------------------------------------------------------------------------
// Review view: how a file came to be flagged, and an illustrative report summary
// ---------------------------------------------------------------------------

/** FINTRAC: reports are due within 15 calendar days after the day the cash is received. */
export const LCTR_DEADLINE_DAYS = 15

export interface LctrReviewDeposit {
  transactionId: string
  timestamp: string
  amountCents: number
  /** Running total within the 24-hour window, after this deposit. */
  runningTotalCents: number
  hoursFromFirst: number
}

export interface LctrReview {
  rule: "single" | "24_hour"
  thresholdCents: number
  windowHours: 24
  deposits: LctrReviewDeposit[]
  totalCents: number
  /** Why the file went to the FINTRAC review queue, in plain language. */
  reason: string
  creditFactor: false
  reportSummary: {
    label: "Illustrative — not a filing"
    reportType: "Large Cash Transaction Report"
    reportingEntity: string
    onBehalfOf: string
    method: string
    dateOfFirstDeposit: string
    totalCents: number
    numberOfDeposits: number
    reportDueBy: string
    source: string
  }
}

export function reviewLargeCash(event: LargeCashEvent, ctx: { reportingEntity: string; customerName: string }): LctrReview {
  const first = Date.parse(event.windowStart)
  let running = 0
  const deposits = event.transactions.map((t) => {
    running += t.amountCents
    return {
      transactionId: t.transactionId,
      timestamp: t.transactionTimestamp,
      amountCents: t.amountCents,
      runningTotalCents: running,
      hoursFromFirst: Math.round(((Date.parse(t.transactionTimestamp) - first) / 3_600_000) * 10) / 10,
    }
  })
  const firstDay = event.windowStart.slice(0, 10)
  // Due 15 calendar days after the day the cash that met the threshold was received.
  const due = new Date(`${event.windowEnd.slice(0, 10)}T00:00:00Z`)
  due.setUTCDate(due.getUTCDate() + LCTR_DEADLINE_DAYS)
  const money = (c: number) => fmt(c)
  const reason =
    event.rule === "single"
      ? `${singleText(event)}. The single deposit meets the ${money(LCTR_THRESHOLD_CENTS)} threshold on its own.`
      : `${event.transactions.length} cash deposits within ${deposits[deposits.length - 1].hoursFromFirst} hours total ${money(event.totalCents)}, meeting the ${money(LCTR_THRESHOLD_CENTS)} threshold under the 24-hour rule. Each deposit alone is below the threshold.`
  return {
    rule: event.rule,
    thresholdCents: LCTR_THRESHOLD_CENTS,
    windowHours: 24,
    deposits,
    totalCents: event.totalCents,
    reason: `${reason} Sent to FINTRAC review so a person can confirm the deposits were made by or for the same customer and file the report. This does not affect the credit decision.`,
    creditFactor: false,
    reportSummary: {
      label: "Illustrative — not a filing",
      reportType: "Large Cash Transaction Report",
      reportingEntity: ctx.reportingEntity,
      onBehalfOf: ctx.customerName,
      method: "In-branch cash deposit",
      dateOfFirstDeposit: firstDay,
      totalCents: event.totalCents,
      numberOfDeposits: event.transactions.length,
      reportDueBy: due.toISOString().slice(0, 10),
      source: LCTR_SOURCE,
    },
  }
}
