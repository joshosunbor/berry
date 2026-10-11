import type { Mode } from "@/lib/modes"
import { MODE_META, MODES } from "@/lib/modes"
import { formatCents } from "@/lib/money"
import { RETURN_CODES, type Decision, type JournalEntry, type QueueName, type ReturnCode, type VerificationCheck } from "@/lib/schemas"
import { SERVICING } from "@/lib/servicing/config"
import { RAILS } from "@/lib/servicing/funding"
import { monthEnds, reconcile, type ReconciliationReport } from "@/lib/servicing/reconcile"
import type { BookResult, LoanResult } from "@/lib/servicing/simulate"
import { CLOCK_START, daysPastDueAsOf, lineAsOf, outstandingAsOf, statusAsOf, type LoanView } from "@/lib/servicing/views"
import { OPS, member } from "./config"
import { slaState, type OpsItem } from "./queues"
import { businessMinutesBetween } from "./time"

/*
 * Operations KPIs (CLAUDE.md §5D), computed from their sources at a point
 * in simulated time: the ledger (losses, collected), the simulator's
 * attempts and status timelines (returns, cures, delinquency), the
 * reconciliation report (match rate), the funding results (time to
 * funding) and the queue engine (backlog, SLA). Nothing is hard-coded and
 * no KPI keeps its own copy of the numbers. Tie-out tests check each one
 * against its source.
 */

export type LenderFilter = Mode | "all"

export interface MetricSources {
  items: OpsItem[]
  loans: LoanView[]
  books: Record<Mode, BookResult>
  cast: {
    slug: string
    decisions: Record<Mode, Decision>
    checks: VerificationCheck[]
  }[]
}

export interface Kpi {
  id: string
  group: "front" | "funding" | "servicing" | "operations"
  label: string
  /** The headline, formatted. */
  value: string
  /** The headline as a number, for trends (null when there's nothing to measure yet). */
  raw: number | null
  /** One line: what it means. */
  definition: string
  /** How it's computed, from which source. */
  how: string
  breakdown?: { label: string; value: string }[]
  /** Set when the KPI uses illustrative inputs: says which. */
  illustrative?: string
  /** Higher is better (for trend colouring); null when neither. */
  better?: "higher" | "lower" | null
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—")
const share = (n: number, d: number) => (d ? n / d : null)
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
const hoursText = (min: number) => (min < 60 ? `${min} min` : min < 60 * 48 ? `${Math.round((min / 60) * 10) / 10} h` : `${Math.round((min / 1440) * 10) / 10} days`)
/** Business time: 8-hour working days. */
const businessText = (min: number) =>
  min < 60 ? `${min} min` : min < 480 ? `${Math.round((min / 60) * 10) / 10} business hours` : `${Math.round((min / 480) * 10) / 10} business days`
const inLender = (m: Mode | null, f: LenderFilter) => f === "all" || m === f
const modesFor = (f: LenderFilter): Mode[] => (f === "all" ? [...MODES] : [f])

// ---------------------------------------------------------------------------
// Sources, as of a time. Each KPI reads from one of these.
// ---------------------------------------------------------------------------

/** Ledger entries of the selected lenders' books, up to a date. */
export function ledgerEntries(src: MetricSources, f: LenderFilter, date: string): JournalEntry[] {
  return modesFor(f).flatMap((m) => src.books[m].ledger.all.filter((e) => e.date <= date))
}

const sumLines = (entries: JournalEntry[], type: JournalEntry["type"], acct: (e: JournalEntry) => string, side: "debitCents" | "creditCents") =>
  entries.filter((e) => e.type === type).reduce((t, e) => t + e.lines.filter((l) => l.account === acct(e)).reduce((x, l) => x + l[side], 0), 0)

/** Credit losses: the debit to the credit-loss account on every charge-off entry. */
export function lossesCents(src: MetricSources, f: LenderFilter, date: string): number {
  return sumLines(ledgerEntries(src, f, date), "charge_off", (e) => `credit_loss:${e.institutionId}`, "debitCents")
}

/** Cash collected: settled debits into the settlement account, less returns taken back out of it after settlement. */
export function collectedCents(src: MetricSources, f: LenderFilter, date: string): { settledCents: number; returnedCents: number; collectedCents: number } {
  const entries = ledgerEntries(src, f, date)
  const settledCents = sumLines(entries, "collection_settled", (e) => `settlement:${e.institutionId}`, "debitCents")
  const returnedCents = sumLines(entries, "return_after_settlement", (e) => `settlement:${e.institutionId}`, "creditCents")
  return {
    settledCents,
    returnedCents,
    collectedCents: settledCents - returnedCents,
  }
}

/** The latest month-end reconciliation on or before a date, per lender. */
export function reconciliations(src: MetricSources, f: LenderFilter, date: string): ReconciliationReport[] {
  const cut = monthEnds(CLOCK_START, date).at(-1)
  if (!cut) return []
  return modesFor(f).map((m) => reconcile(src.books[m], cut))
}

const loansFunded = (src: MetricSources, f: LenderFilter, at: string) => src.loans.filter((l) => inLender(l.mode, f) && l.funding.completedAt <= at)
const loanResults = (src: MetricSources, f: LenderFilter): LoanResult[] => modesFor(f).flatMap((m) => src.books[m].loans)
const itemsFor = (src: MetricSources, f: LenderFilter) => src.items.filter((i) => inLender(i.mode, f))

/** Manual minutes spent on items, from the queue engine's schedule (work finished by `at`). */
export function manualMinutes(items: OpsItem[], at: string): Map<QueueName, number> {
  const out = new Map<QueueName, number>()
  for (const i of items) for (const s of i.steps) if (s.end <= at) out.set(i.queue, (out.get(i.queue) ?? 0) + businessMinutesBetween(s.start, s.end))
  return out
}

// ---------------------------------------------------------------------------

export function computeKpis(src: MetricSources, f: LenderFilter, at: string): Kpi[] {
  const date = at.slice(0, 10)
  const kpis: Kpi[] = []
  const scope = f === "all" ? "all three lenders" : MODE_META[f].institution

  // --- Front end -----------------------------------------------------------
  const decisions = src.cast.flatMap((c) => modesFor(f).map((m) => ({ slug: c.slug, mode: m, d: c.decisions[m] })))
  const count = (o: Decision["outcome"]) => decisions.filter((x) => x.d.outcome === o).length
  const approved = count("approve") + count("approve_with_conditions")
  kpis.push({
    id: "decision_mix",
    group: "front",
    label: "Approval rate",
    value: pct(approved, decisions.length),
    raw: share(approved, decisions.length),
    definition: `Share of the ${decisions.length} applications decided by ${scope} that were approved (with or without conditions).`,
    how: "Counts the engine's outcome for every cast applicant at the selected lenders. Applications reach operations on Oct 1, so this doesn't change over time.",
    breakdown: [
      { label: "Approved", value: String(count("approve")) },
      {
        label: "With conditions",
        value: String(count("approve_with_conditions")),
      },
      { label: "Referred", value: String(count("refer")) },
      { label: "Declined", value: String(count("decline")) },
    ],
    better: null,
  })

  const cleared = src.cast.filter((c) => c.checks.every((x) => x.result === "pass")).length
  kpis.push({
    id: "auto_verification",
    group: "front",
    label: "Auto-verification rate",
    value: pct(cleared, src.cast.length),
    raw: share(cleared, src.cast.length),
    definition: "Share of applicants whose identity and business checks all passed with no person involved.",
    how: `Counts applicants whose simulated KYC/KYB checks are all "pass"; any "needs review" sends the applicant to the Verification queue. Shared across lenders: verification happens once per applicant.`,
    breakdown: [
      { label: "Cleared automatically", value: String(cleared) },
      { label: "Needed a person", value: String(src.cast.length - cleared) },
    ],
    illustrative: "Simulated checks on synthetic data.",
    better: "higher",
  })

  // Time to decision: instant when no person is needed; otherwise until the sign-off or referral item is completed.
  const creditItems = new Map(src.items.filter((i) => i.queue === "credit_referral").map((i) => [i.subject.id, i]))
  const waits: number[] = []
  let instant = 0
  let pending = 0
  for (const x of decisions) {
    const item = creditItems.get(x.d.id)
    if (!item) {
      instant++
      waits.push(0)
    } else if (item.completedAt && item.completedAt <= at) waits.push(businessMinutesBetween(item.createdAt, item.completedAt))
    else pending++
  }
  const medDecision = median(waits)
  kpis.push({
    id: "time_to_decision",
    group: "front",
    label: "Time to decision (median)",
    value: `${medDecision === null ? "—" : medDecision === 0 ? "Instant" : businessText(medDecision)}${pending ? ` · ${pending} waiting` : ""}`,
    raw: medDecision,
    definition: "From the application reaching operations to a final decision, in business time.",
    how: "Median over decisions made so far (ones still waiting are counted separately). Instant when the engine's decision needs no person (declines, Kite and Aspen approvals). Otherwise, the time until the Credit referrals and sign-offs item for that decision was completed, from the queue engine.",
    breakdown: [
      { label: "Instant", value: String(instant) },
      { label: "Needed sign-off", value: String(decisions.length - instant) },
      {
        label: "Median when sign-off was needed",
        value: (() => {
          const m = median(waits.filter((w) => w > 0))
          return m === null ? "—" : businessText(m)
        })(),
      },
      { label: "Still waiting", value: String(pending) },
    ],
    better: "lower",
  })

  // --- Funding -------------------------------------------------------------
  const funded = loansFunded(src, f, at)
  const ttf = median(funded.map((l) => l.funding.timeToFundMinutes))
  const byRail = Object.keys(RAILS).flatMap((r) => {
    const ls = funded.filter((l) => l.funding.rail === r)
    return ls.length
      ? [
          {
            label: `${RAILS[r as keyof typeof RAILS].name}${RAILS[r as keyof typeof RAILS].badge ? ` (${RAILS[r as keyof typeof RAILS].badge})` : ""}, ${ls.length} loan${ls.length === 1 ? "" : "s"}`,
            value: hoursText(median(ls.map((l) => l.funding.timeToFundMinutes))!),
          },
        ]
      : []
  })
  kpis.push({
    id: "time_to_funding",
    group: "funding",
    label: "Time to funding (median)",
    value: ttf === null ? "Nothing funded yet" : hoursText(ttf),
    raw: ttf,
    definition: "From the lender sending the money to it being in the borrower's account, by rail.",
    how: "Median of each funded loan's funding result (initiated → available), by rail. Instant rails wait for payee confirmation when the name is a close match.",
    breakdown: byRail,
    illustrative: "Rail timings and the Real-Time Rail are illustrative (RTR simulated — launching in phases).",
    better: "lower",
  })

  // --- Servicing -----------------------------------------------------------
  const cash = collectedCents(src, f, date)
  kpis.push({
    id: "collected",
    group: "servicing",
    label: "Collected",
    value: formatCents(cash.collectedCents, { whole: true }),
    raw: cash.collectedCents,
    definition: "Cash collected by pre-authorized debit, net of payments that came back after settling.",
    how: "From the ledger: settled collections into the settlement account, minus returns taken back out of it after settlement. Returns caught before settlement never reach the settlement account.",
    breakdown: [
      {
        label: "Settled debits",
        value: formatCents(cash.settledCents, { whole: true }),
      },
      {
        label: "Returned after settling",
        value: formatCents(cash.returnedCents, { whole: true }),
      },
    ],
    better: "higher",
  })

  const attempts = funded.flatMap((l) => l.attempts).filter((a) => (a.outcome === "returned" ? a.returnedOn : a.settledOn)! <= date)
  const returns = attempts.filter((a) => a.outcome === "returned")
  const codes = [...new Set(returns.map((a) => a.code!))].sort()
  kpis.push({
    id: "return_rate",
    group: "servicing",
    label: "Return rate",
    value: attempts.length ? pct(returns.length, attempts.length) : "No debits yet",
    raw: attempts.length ? returns.length / attempts.length : null,
    definition: "Share of pre-authorized debits (including retries) that came back unpaid, by return reason.",
    how: "From the simulator's debit attempts resolved by this date: returned ÷ all resolved. Reasons are Payments Canada Standard 007 return codes.",
    breakdown: codes.map((c) => ({
      label: `${c} ${RETURN_CODES[c as ReturnCode].label}`,
      value: String(returns.filter((a) => a.code === c).length),
    })),
    better: "lower",
  })

  const firsts = attempts.filter((a) => !a.isRetry)
  const onTime = firsts.filter((a) => a.outcome === "settled").length
  kpis.push({
    id: "on_time",
    group: "servicing",
    label: "On-time payment rate",
    value: firsts.length ? pct(onTime, firsts.length) : "No debits yet",
    raw: firsts.length ? onTime / firsts.length : null,
    definition: "Share of scheduled payments collected on the first try.",
    how: "From the simulator's debit attempts: first attempts (not retries) resolved by this date that settled ÷ all first attempts resolved.",
    breakdown: [
      { label: "First attempts", value: String(firsts.length) },
      { label: "Settled", value: String(onTime) },
    ],
    better: "higher",
  })

  const cures = loanResults(src, f)
    .flatMap((l) => l.cures)
    .filter((c) => c.failedOn <= date)
  const cured = cures.filter((c) => c.curedOn && c.curedOn <= date).length
  kpis.push({
    id: "cure_rate",
    group: "servicing",
    label: "Cure rate",
    value: cures.length ? pct(cured, cures.length) : "No missed payments",
    raw: cures.length ? cured / cures.length : null,
    definition: "Share of missed payments that were later brought up to date after recovery.",
    how: "From the simulator's cure records: missed payments by this date that were cured by this date ÷ all missed payments by this date.",
    breakdown: [
      { label: "Missed payments", value: String(cures.length) },
      { label: "Cured", value: String(cured) },
    ],
    better: "higher",
  })

  const live = funded.filter((l) => !["charged_off", "paid_off"].includes(statusAsOf(l, date)))
  const dpd = live.map((l) => ({
    l,
    d: daysPastDueAsOf(l, date),
    bal: outstandingAsOf(l, date),
  }))
  const book = dpd.reduce((t, x) => t + x.bal, 0)
  const bucket = (n: number) => dpd.filter((x) => x.d >= n)
  kpis.push({
    id: "delinquency",
    group: "servicing",
    label: "Delinquency, 30+ days",
    value: live.length
      ? pct(
          bucket(30).reduce((t, x) => t + x.bal, 0),
          book,
        )
      : "No loans yet",
    raw: live.length
      ? share(
          bucket(30).reduce((t, x) => t + x.bal, 0),
          book,
        )
      : null,
    definition: "Share of the outstanding book that is 30 or more days past due.",
    how: "Days past due come from each loan's status timeline; balances come from its ledger. Charged-off and paid-off loans are out of the book.",
    breakdown: [30, 60, 90].map((n) => ({
      label: `${n}+ days`,
      value: `${bucket(n).length} loan${bucket(n).length === 1 ? "" : "s"}, ${formatCents(
        bucket(n).reduce((t, x) => t + x.bal, 0),
        { whole: true },
      )}`,
    })),
    better: "lower",
  })

  const losses = lossesCents(src, f, date)
  const disbursed = ledgerEntries(src, f, date)
    .filter((e) => e.type === "disbursement" || e.type === "draw")
    .reduce((t, e) => t + e.lines.reduce((x, l) => x + (l.account.startsWith("principal:") ? l.debitCents : 0), 0), 0)
  kpis.push({
    id: "losses",
    group: "servicing",
    label: "Credit losses",
    value: formatCents(losses, { whole: true }),
    raw: losses,
    definition: "Balances written off as uncollectable.",
    how: "From the ledger: the sum of every charge-off entry's debit to the credit-loss account. Loss rate is losses ÷ everything disbursed or drawn.",
    breakdown: [
      { label: "Loss rate", value: pct(losses, disbursed) },
      {
        label: "Disbursed and drawn",
        value: formatCents(disbursed, { whole: true }),
      },
    ],
    illustrative: `Charge-off at ${SERVICING.chargeOffDaysPastDue} days past due is an illustrative policy.`,
    better: "lower",
  })

  const lines = funded.flatMap((l) => {
    const s = lineAsOf(l, date)
    return s ? [{ l, s }] : []
  })
  const limit = lines.reduce((t, x) => t + x.s.limitCents, 0)
  const drawn = lines.reduce((t, x) => t + x.s.drawnCents, 0)
  kpis.push({
    id: "line_utilization",
    group: "servicing",
    label: "Line utilization",
    value: lines.length ? pct(drawn, limit) : "No drawn lines",
    raw: lines.length ? share(drawn, limit) : null,
    definition: "How much of the seasonal operating lines' limits is drawn and not yet repaid.",
    how: "From each line's ledger: principal drawn less principal repaid, ÷ the limit. Only lines drawn over time are included.",
    breakdown: lines.map((x) => ({
      label: `${x.l.applicantName} (${MODE_META[x.l.mode].institution})`,
      value: `${formatCents(x.s.drawnCents, { whole: true })} of ${formatCents(x.s.limitCents, { whole: true })}`,
    })),
    illustrative: `Draws keep ${SERVICING.operatingReserveMonthsOfSpending} month's average spending in the account (illustrative operating reserve).`,
    better: null,
  })

  const fees = funded.flatMap((l) => l.borrowerFees.filter((b) => b.date <= date))
  kpis.push({
    id: "borrower_fees",
    group: "servicing",
    label: "NSF fees borrowers paid",
    value: formatCents(fees.reduce((t, b) => t + b.fee.feeCents, 0)),
    raw: fees.reduce((t, b) => t + b.fee.feeCents, 0),
    definition: "Fees borrowers' own banks charged when a debit bounced. Recovery is designed to keep this low.",
    how: "From the simulator's borrower-bank fees: bank accounts follow the $10 cap and the one-fee-per-2-business-days rule; credit union accounts use an illustrative fee.",
    breakdown: [
      {
        label: "Fees charged",
        value: String(fees.filter((b) => b.fee.feeCents > 0).length),
      },
      {
        label: "Returns with no fee",
        value: String(fees.filter((b) => b.fee.feeCents === 0).length),
      },
    ],
    illustrative: "Credit union NSF fees are provincially regulated; the fee used is illustrative.",
    better: "lower",
  })

  // --- Operations ----------------------------------------------------------
  const items = itemsFor(src, f)
  const visible = items.filter((i) => i.createdAt <= at)
  const states = visible.map((i) => ({ i, s: slaState(i, at) }))
  const open = states.filter((x) => x.s === "on_time" || x.s === "at_risk" || x.s === "breached")
  const oldest = open.reduce<string | null>((o, x) => (o === null || x.i.createdAt < o ? x.i.createdAt : o), null)
  kpis.push({
    id: "backlog",
    group: "operations",
    label: "Open queue items",
    value: String(open.length),
    raw: open.length,
    definition: "Work waiting in the operations queues right now, and how old the oldest item is.",
    how: "From the queue engine: items created by this time and not yet completed. Verification and FINTRAC items belong to the applicant, so they count under All lenders only.",
    breakdown: [
      ...(oldest
        ? [
            {
              label: "Oldest",
              value: businessText(businessMinutesBetween(oldest, at)),
            },
          ]
        : []),
      ...(Object.keys(OPS.queues) as QueueName[]).flatMap((q) => {
        const n = open.filter((x) => x.i.queue === q).length
        return n ? [{ label: OPS.queues[q].label, value: String(n) }] : []
      }),
    ],
    better: "lower",
  })

  const breached = states.filter((x) => x.s === "breached").length
  const missed = states.filter((x) => x.s === "missed").length
  const met = states.filter((x) => x.s === "met").length
  kpis.push({
    id: "sla_breaches",
    group: "operations",
    label: "SLA breaches",
    value: String(breached + missed),
    raw: breached + missed,
    definition: "Items past their service level: still open and overdue, or completed late.",
    how: "From the queue engine's SLA state for each item at this time (business hours, weekdays). Attainment is items completed on time ÷ all completed.",
    breakdown: [
      { label: "Open and overdue", value: String(breached) },
      { label: "Completed late", value: String(missed) },
      { label: "SLA attainment", value: pct(met, met + missed) },
    ],
    better: "lower",
  })

  const worked = new Map<string, number>()
  for (const i of items) for (const s of i.steps) if (s.end <= at) worked.set(s.who, (worked.get(s.who) ?? 0) + 1)
  const staff = OPS.team.filter((m) => m.role === "analyst" || m.role === "lead")
  const perPerson = staff.map((m) => worked.get(m.id) ?? 0)
  kpis.push({
    id: "items_per_analyst",
    group: "operations",
    label: "Items per analyst",
    value: String(Math.round((perPerson.reduce((a, b) => a + b, 0) / staff.length) * 10) / 10),
    raw: perPerson.reduce((a, b) => a + b, 0) / staff.length,
    definition: "Average number of queue steps each analyst or lead has finished so far.",
    how: "From the queue engine's schedule: finished steps (work, preparation or review) per person, averaged over the analysts and the lead.",
    breakdown: staff.map((m, i) => ({
      label: member(m.id)!.name,
      value: String(perPerson[i]),
    })),
    better: null,
  })

  const recs = reconciliations(src, f, date)
  const matched = recs.reduce((t, r) => t + r.matched.length * 2, 0)
  const compared = recs.reduce((t, r) => t + r.linesCompared, 0)
  kpis.push({
    id: "match_rate",
    group: "operations",
    label: "Reconciliation match rate",
    value: recs.length ? pct(matched, compared) : "No month-end yet",
    raw: recs.length ? share(matched, compared) : null,
    definition: "Share of ledger and bank-statement lines that matched at the latest month-end.",
    how: "From the reconciliation report at the latest month-end cut-off: matched lines (both sides) ÷ all lines compared. Breaks go to the Reconciliation queue.",
    breakdown: recs.map((r) => ({
      label: `${MODE_META[MODES.find((m) => MODE_META[m].institutionId === r.institutionId)!].institution}, ${r.cutoff}`,
      value: `${pct(r.matched.length * 2, r.linesCompared)}, ${r.breaks.length} break${r.breaks.length === 1 ? "" : "s"}`,
    })),
    better: "higher",
  })

  const minutes = manualMinutes(items, at)
  const manual = [...minutes.values()].reduce((a, b) => a + b, 0)
  const opsCost = Math.round((manual / 60) * OPS.cost.loadedHourlyCostCents)
  const railCost = funded.reduce((t, l) => t + l.funding.costCents, 0)
  kpis.push({
    id: "cost_per_loan",
    group: "operations",
    label: "Cost per loan",
    value: funded.length ? formatCents(Math.round((opsCost + railCost) / funded.length)) : "Nothing funded yet",
    raw: funded.length ? Math.round((opsCost + railCost) / funded.length) : null,
    definition: "Operating cost of manual work plus funding fees, spread over the loans funded.",
    how: `Minutes of manual work from the queue engine × an illustrative loaded cost of ${formatCents(OPS.cost.loadedHourlyCostCents)} an hour, plus each loan's funding rail fee, ÷ loans funded.`,
    breakdown: [
      {
        label: "Manual work",
        value: `${Math.round((manual / 60) * 10) / 10} hours, ${formatCents(opsCost)}`,
      },
      { label: "Funding fees", value: formatCents(railCost) },
      { label: "Loans funded", value: String(funded.length) },
    ],
    illustrative: "Loaded hourly cost, minutes per item and rail fees are illustrative inputs.",
    better: "lower",
  })

  return kpis
}

const ADVICE: Record<QueueName, string> = {
  verification: "pre-check business registrations against the registry before the file reaches a person, so only real exceptions need review.",
  credit_referral: "give analysts sign-off authority for clean files within their limit, and meet the Credit Committee twice a week instead of Mondays only.",
  fintrac_review: "flag large cash deposits at the branch the same day, so the review starts with the report already drafted.",
  collections: "move the retry date to the borrower's payday for more loans, so fewer retries fail and need a call.",
  reconciliation: "post returns to the loan automatically from the return file, so the ledger and bank never disagree.",
  hardship: "offer a short deferral in the borrower's online banking for repeat NSFs, with a lead approving in bulk.",
  payee_confirmation: "ask for a void cheque or bank-verified account details at application, so fewer instant sends need a call.",
}

/** The biggest bottleneck at this time: the queue taking the largest share of manual work, plus what's breaching. */
export function bottleneck(src: MetricSources, f: LenderFilter, at: string): { queue: QueueName; shareOfManual: number; text: string } | null {
  const items = itemsFor(src, f)
  const minutes = manualMinutes(items, at)
  const total = [...minutes.values()].reduce((a, b) => a + b, 0)
  if (!total) return null
  const [queue, m] = [...minutes.entries()].sort((a, b) => b[1] - a[1])[0]
  const late = items.filter((i) => i.queue === queue && ["breached", "missed"].includes(slaState(i, at))).length
  const share = m / total
  return {
    queue,
    shareOfManual: share,
    text: `${OPS.queues[queue].label} is ${Math.round(share * 100)}% of manual work so far${late ? `, with ${late} SLA breach${late === 1 ? "" : "es"}` : ""}. Next: ${ADVICE[queue]}`,
  }
}
