import type { Mode } from "@/lib/modes"
import type { JournalEntry } from "@/lib/schemas"
import type { FundingResult } from "./funding"
import type { GateCheck } from "./gate"
import { monthEnds, reconcile, type BreakKind } from "./reconcile"
import type { Attempt, BookResult, LoanEvent, LoanResult, LoanStatus } from "./simulate"
import type { Draw, ScheduledDebit } from "@/lib/engine/repayment"
import type { BorrowerFee } from "./borrower-bank"
import type { ProductType } from "@/lib/schemas"

/*
 * Plain, serializable views of the simulated loan books for pages. The
 * simulation runs once at build time; pages pick what to show "as of" a
 * date on the client.
 */

export const CLOCK_START = "2026-10-06"

export interface LoanBreak {
  kind: BreakKind
  reference: string
  action: string
  /** Bank minus ledger, in cents. */
  differenceCents: number
  firstSeen: string
  /** First month-end cut-off at which it no longer appears, if any. */
  resolvedBy: string | null
}

export interface LoanView {
  id: string
  mode: Mode
  institutionId: string
  applicantSlug: string
  applicantName: string
  kind: "personal" | "business"
  product: ProductType
  principalCents: number
  funding: FundingResult
  /** Pre-funding checks and when the last cleared. */
  gate: GateCheck[]
  gateReadyAt: string
  borrowerBank: "bank" | "credit_union"
  schedule: ScheduledDebit[]
  /** Present for lines drawn over time: the limit is principalCents. */
  draws: Draw[] | null
  operatingReserveCents: number | null
  events: LoanEvent[]
  attempts: Attempt[]
  statusTimeline: { date: string; status: LoanStatus }[]
  borrowerFees: { date: string; fee: BorrowerFee }[]
  entries: JournalEntry[]
  breaks: LoanBreak[]
  chargedOffOn: string | null
}

/** Breaks found at each month-end, grouped by item, with when they appeared and cleared. */
export function breaksByLoan(book: BookResult): Map<string, LoanBreak[]> {
  const cutoffs = monthEnds(CLOCK_START, book.horizon)
  const seen = new Map<string, LoanBreak & { loanId: string; lastSeen: string }>()
  for (const cut of cutoffs) {
    for (const b of reconcile(book, cut).breaks) {
      const k = `${b.kind}|${b.reference}`
      const existing = seen.get(k)
      if (existing) existing.lastSeen = cut
      else seen.set(k, { kind: b.kind, reference: b.reference, action: b.action, differenceCents: b.differenceCents, firstSeen: cut, lastSeen: cut, resolvedBy: null, loanId: b.loanId ?? "" })
    }
  }
  const out = new Map<string, LoanBreak[]>()
  for (const b of seen.values()) {
    const next = cutoffs.find((c) => c > b.lastSeen)
    const { loanId, lastSeen, ...rest } = b
    const resolvedBy = next ?? null
    const entry: LoanBreak = { ...rest, resolvedBy: lastSeen === cutoffs.at(-1) ? null : resolvedBy }
    out.set(loanId, [...(out.get(loanId) ?? []), entry])
  }
  return out
}

export function toLoanView(book: BookResult, loan: LoanResult, breaks: LoanBreak[] = []): LoanView {
  const s = loan.setup
  return {
    id: s.id,
    mode: s.mode,
    institutionId: s.institutionId,
    applicantSlug: s.applicantSlug,
    applicantName: s.applicantName,
    kind: s.kind,
    product: s.product,
    principalCents: s.principalCents,
    funding: s.funding,
    gate: s.gate,
    gateReadyAt: s.gateReadyAt,
    borrowerBank: s.borrowerAccount.institutionType,
    schedule: s.schedule,
    draws: s.draws ?? null,
    operatingReserveCents: s.operatingReserveCents ?? null,
    events: loan.events,
    attempts: loan.attempts,
    statusTimeline: loan.statusTimeline,
    borrowerFees: loan.borrowerFees,
    entries: book.ledger.forLoan(s.id),
    breaks,
    chargedOffOn: loan.chargedOffOn,
  }
}

// --- helpers used by pages (pure, client-safe) -------------------------------

export function statusAsOf(v: Pick<LoanView, "statusTimeline">, date: string): LoanStatus {
  let s: LoanStatus = "active"
  for (const t of v.statusTimeline) if (t.date <= date) s = t.status
  return s
}

/** Principal plus interest receivable, from the loan's ledger entries up to `date`. */
export function outstandingAsOf(v: Pick<LoanView, "entries" | "id">, date: string): number {
  let owed = 0
  for (const e of v.entries) {
    if (e.date > date) break
    for (const l of e.lines) if (l.account === `principal:${v.id}` || l.account === `interest:${v.id}`) owed += l.debitCents - l.creditCents
  }
  return owed
}

/** For a drawn line: limit, what's drawn and not yet repaid, and what's still available, as of a date. */
export function lineAsOf(v: Pick<LoanView, "entries" | "id" | "principalCents" | "draws">, date: string): { limitCents: number; drawnCents: number; availableCents: number; drawnToDateCents: number } | null {
  if (!v.draws) return null
  let drawn = 0
  for (const e of v.entries) {
    if (e.date > date) break
    for (const l of e.lines) if (l.account === `principal:${v.id}`) drawn += l.debitCents - l.creditCents
  }
  const drawnToDateCents = v.draws.filter((d) => d.date <= date).reduce((t, d) => t + d.amountCents, 0)
  return { limitCents: v.principalCents, drawnCents: drawn, availableCents: v.principalCents - drawn, drawnToDateCents }
}

export function daysPastDueAsOf(v: Pick<LoanView, "statusTimeline">, date: string): number {
  let since: string | null = null
  for (const t of v.statusTimeline) {
    if (t.date > date) break
    since = t.status === "delinquent" ? (since ?? t.date) : null
  }
  return since ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000) + 1 : 0
}

/** The simulator's time control: funding day, then fast-forward 1, 3 or 12 months. */
export const CLOCK_OPTIONS = [
  { label: "Funding day", short: "Today", date: "2026-10-06" },
  { label: "+1 month", short: "+1 mo", date: "2026-11-06" },
  { label: "+3 months", short: "+3 mo", date: "2027-01-06" },
  { label: "+12 months", short: "+12 mo", date: "2027-10-06" },
] as const

export interface LoanSnapshot {
  status: LoanStatus
  outstandingCents: number
  daysPastDue: number
  returns: number
  debitsCollected: number
  /** On-time payments in a row (first-attempt debits that settled), most recent first. */
  onTimeStreak: number
  monthsSinceFunding: number
}

export function snapshot(v: LoanView, date: string): LoanSnapshot {
  return {
    status: statusAsOf(v, date),
    outstandingCents: outstandingAsOf(v, date),
    daysPastDue: daysPastDueAsOf(v, date),
    returns: v.attempts.filter((a) => a.returnedOn && a.returnedOn <= date).length,
    debitsCollected: v.attempts.filter((a) => a.settledOn && a.settledOn <= date && a.outcome === "settled").length,
    onTimeStreak: onTimeStreak(v, date),
    monthsSinceFunding: Math.max(0, monthsBetween(v.funding.fundedOn, date)),
  }
}

function monthsBetween(a: string, b: string): number {
  const d = (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)))
  return Number(b.slice(8, 10)) >= Number(a.slice(8, 10)) ? d : d - 1
}

/** Consecutive on-time payments up to `date`: a returned debit resets the count. */
function onTimeStreak(v: LoanView, date: string): number {
  let streak = 0
  for (const a of v.attempts) {
    const resolvedOn = a.outcome === "returned" ? a.returnedOn : a.settledOn
    if (!resolvedOn || resolvedOn > date) continue
    streak = a.outcome === "returned" ? 0 : a.isRetry ? streak : streak + 1
  }
  return streak
}

export interface LoanSummary {
  id: string
  mode: Mode
  applicantSlug: string
  applicantName: string
  product: ProductType
  principalCents: number
  rail: FundingResult["rail"]
  railLabel?: string
  timeToFundMinutes: number
  snapshots: Record<string, LoanSnapshot>
  cures: { failedOn: string; curedOn: string | null }[]
}

export function summarize(v: LoanView, cures: LoanSummary["cures"]): LoanSummary {
  return {
    id: v.id,
    mode: v.mode,
    applicantSlug: v.applicantSlug,
    applicantName: v.applicantName,
    product: v.product,
    principalCents: v.principalCents,
    rail: v.funding.rail,
    railLabel: v.funding.label,
    timeToFundMinutes: v.funding.timeToFundMinutes,
    snapshots: Object.fromEntries(CLOCK_OPTIONS.map((o) => [o.date, snapshot(v, o.date)])),
    cures,
  }
}
