import { addBusinessDays, businessDaysBetween, earliestSafeRetry, isBusinessDay } from "@/lib/rules/nsf"
import { Rng, hashSeed } from "@/lib/rng"
import type { InstitutionId, Mode } from "@/lib/modes"
import type { ProductType, ReturnCode, RecoveryRules } from "@/lib/schemas"
import { PAD_RULES, type Draw, type ScheduledDebit } from "@/lib/engine/repayment"
import { borrowerNsfFee, type BorrowerAccount, type BorrowerFee } from "./borrower-bank"
import { SERVICING, type ServicingConfig } from "./config"
import { RTR_FULL_NAME, type FundingResult } from "./funding"
import type { GateCheck } from "./gate"
import {
  applyPayment,
  Ledger,
  postChargeOff,
  postCollectionSent,
  postCollectionSettled,
  postDisbursement,
  postDraw,
  postInterestAccrual,
  postReturn,
  type CollectionPosting,
} from "./ledger"
import { planRetry, RECOVERY_PATH, RETURNED_BEFORE_SETTLEMENT } from "./recovery"

/*
 * Servicing simulator. A pure function of the loan book and a horizon date:
 * every collection, settlement, return, retry, notice, hardship offer and
 * charge-off is decided by fixed rules and a seeded random source, so the
 * same book always plays out the same way. Views "as of" any date in the
 * horizon are read from the recorded timeline.
 *
 * Invariants (tested):
 * - the lender's ledger is balanced after every posting
 * - no debit is sent to an account before earliestSafeRetry(last return)
 * - any two debits to the same account are at least 2 business days apart
 */

export type LoanStatus = "active" | "delinquent" | "hardship" | "paid_off" | "charged_off"

export interface LoanSetup {
  id: string
  mode: Mode
  institutionId: InstitutionId
  applicantSlug: string
  applicantName: string
  kind: "personal" | "business"
  product: ProductType
  /** The amount lent, or for a line of credit with draws, its limit. */
  principalCents: number
  schedule: ScheduledDebit[]
  /** Lines of credit drawn over time (seasonal operating lines). Absent: the full amount is disbursed at funding. */
  draws?: Draw[]
  /** For drawn lines: the operating reserve the draws protect (illustrative). */
  operatingReserveCents?: number
  funding: FundingResult
  borrowerAccount: BorrowerAccount
  payroll: { lastPayDate: string; cadenceDays: number } | null
  recovery: RecoveryRules
  /** Probability a regular debit is returned NSF when not scripted. */
  baseReturnRate: number
  /** Planted returns, keyed by scheduled debit number and attempt. */
  script?: Script
  /** The lender's maker-checker decision on a hardship request, from the Hardship queue. Absent: still pending. */
  hardshipDecision?: HardshipDecision
  /** Pre-funding checks, each cleared before funding started. */
  gate: GateCheck[]
  /** When the last pre-funding check cleared. */
  gateReadyAt: string
}

export interface HardshipDecision {
  /** The day the second person's approval (or rejection) completed. */
  on: string
  approved: boolean
  by: string
}

export interface Script {
  returns: { n: number; attempt: number; code: ReturnCode }[]
  /** After a non-retry return, debits resume this many days later (e.g. the borrower signs a new agreement). */
  resumeAfterDays?: number
}

export type LoanEventType =
  | "funded"
  | "line_opened"
  | "drawn"
  | "interest_accrued"
  | "debit_sent"
  | "debit_settled"
  | "debit_returned"
  | "borrower_fee"
  | "borrower_notified"
  | "retry_scheduled"
  | "outreach_task"
  | "banking_details_requested"
  | "borrower_contacted"
  | "debits_resumed"
  | "hardship_offered"
  | "hardship_approved"
  | "hardship_declined"
  | "payments_deferred"
  | "cured"
  | "status_changed"
  | "charged_off"
  | "paid_off"

export interface LoanEvent {
  date: string
  type: LoanEventType
  text: string
  amountCents?: number
  code?: ReturnCode
  stage?: "clearing" | "settled"
  attemptId?: string
  status?: LoanStatus
  fee?: BorrowerFee
}

export interface Attempt {
  id: string
  sentOn: string
  amountCents: number
  items: string[]
  isRetry: boolean
  outcome: "settled" | "returned"
  settledOn?: string
  returnedOn?: string
  code?: ReturnCode
  stage?: "clearing" | "settled"
}

export interface LoanResult {
  setup: LoanSetup
  events: LoanEvent[]
  attempts: Attempt[]
  statusTimeline: { date: string; status: LoanStatus }[]
  borrowerFees: { date: string; fee: BorrowerFee }[]
  /** Balances tracked by the simulator; must equal the ledger's. */
  balances: { principalCents: number; interestCents: number }
  cures: { failedOn: string; curedOn: string | null }[]
  chargedOffOn: string | null
}

export interface BookResult {
  institutionId: InstitutionId
  mode: Mode
  horizon: string
  ledger: Ledger
  loans: LoanResult[]
}

// ---------------------------------------------------------------------------

interface Item {
  id: string
  n: number
  scheduledOn: string
  dueOn: string
  amountCents: number
  interestCents: number
  attempts: number
  state: "open" | "in_flight" | "paid" | "held"
  firstFailedOn?: string
  /** Moved to the end of the loan by a hardship deferral: collected as a regular payment, not a retry. */
  rescheduled?: boolean
}

interface Posting {
  date: string
  order: number
  loanId: string
  apply: (l: Ledger) => void
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
/** Same day `n` months later, or the month's last day when it's shorter. */
const addMonths = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number)
  const lastDay = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m - 1 + n, Math.min(day, lastDay))).toISOString().slice(0, 10)
}

function simulateLoan(s: LoanSetup, horizon: string, config: ServicingConfig, postings: Posting[]): LoanResult {
  const events: LoanEvent[] = []
  const attempts: Attempt[] = []
  const statusTimeline: { date: string; status: LoanStatus }[] = []
  const borrowerFees: { date: string; fee: BorrowerFee }[] = []
  const cures: { failedOn: string; curedOn: string | null }[] = []
  const rng = new Rng(hashSeed(`servicing:${s.id}`))
  let order = 0
  const post = (date: string, apply: (l: Ledger) => void) => postings.push({ date, order: order++, loanId: s.id, apply })

  let principal = 0
  let interest = 0
  // Typed via casts: these are reassigned inside closures, which TypeScript can't see from the loop.
  let status = "active" as LoanStatus
  const setStatus = (date: string, next: LoanStatus, why: string) => {
    if (next === status && statusTimeline.length) return
    status = next
    statusTimeline.push({ date, status: next })
    events.push({ date, type: "status_changed", status: next, text: why })
  }

  // Funding: a lump sum, or for a drawn line, the limit is opened and money moves only on each draw.
  const fundedOn = s.funding.fundedOn
  const railName = s.funding.rail === "rtr_simulated" ? RTR_FULL_NAME : s.funding.rail === "aft" ? "AFT" : "Interac e-Transfer"
  if (s.draws) {
    events.push({ date: fundedOn, type: "line_opened", amountCents: s.principalCents, text: "Operating line opened. Nothing is drawn yet; draws go by AFT." })
  } else {
    post(fundedOn, (l) => postDisbursement(l, s.id, s.principalCents, fundedOn, railName))
    principal += s.principalCents
    events.push({ date: fundedOn, type: "funded", amountCents: s.principalCents, text: `Funded ${s.funding.rail === "rtr_simulated" ? `by ${RTR_FULL_NAME}` : s.funding.rail === "aft" ? "by AFT" : "by Interac e-Transfer"}.` })
  }
  setStatus(fundedOn, "active", s.draws ? "Line opened." : "Loan funded.")
  const pendingDraws = [...(s.draws ?? [])]
  let drawCount = 0
  let drawnTotal = 0

  const items: Item[] = s.schedule.map((d) => ({
    id: `${s.id.replace(/^loan_/, "")}-${d.n}`,
    n: d.n,
    scheduledOn: d.date,
    dueOn: d.date,
    amountCents: d.amountCents,
    interestCents: d.interestCents,
    attempts: 0,
    state: "open",
  }))
  const accrued = new Set<string>()

  let nextAllowed = fundedOn
  let lastSent: string | null = null
  let blocked = null as { until: string | null; code: ReturnCode } | null
  let hardshipUntil = null as string | null
  let hardshipOffered = false
  let hardshipRequestedOn = null as string | null
  let hardshipDecided = false
  let failures = 0
  let chargedOffOn: string | null = null
  type InFlight = { attempt: Attempt; split: CollectionPosting; items: Item[]; settleOn: string | null; returnOn: string | null; code: ReturnCode | null; stage: "clearing" | "settled" | null }
  const inFlight: InFlight[] = []

  const openCure = (it: Item) => {
    if (!cures.some((c) => c.failedOn === it.firstFailedOn && c.curedOn === null)) cures.push({ failedOn: it.firstFailedOn!, curedOn: null })
  }

  /** One handler for both return paths: before settlement (reverse clearing) and after (reverse settlement). */
  const handleReturn = (f: InFlight, day: string) => {
    inFlight.splice(inFlight.indexOf(f), 1)
    const code = f.code!
    const stage = f.stage!
    const split = f.split
    post(day, (l) => postReturn(l, s.id, split, day, stage, `ret_${f.attempt.id}`, code))
    principal += split.principalCents
    interest += split.interestCents
    f.attempt.outcome = "returned"
    f.attempt.returnedOn = day
    failures++
    events.push({
      date: day,
      type: "debit_returned",
      amountCents: f.attempt.amountCents,
      code,
      stage,
      attemptId: f.attempt.id,
      text: `Debit returned: ${code} (${stage === "clearing" ? "before settlement" : "after settlement"}).`,
    })
    // Nothing more goes to this account until after the 2-business-day NSF window.
    if (earliestSafeRetry(day) > nextAllowed) nextAllowed = earliestSafeRetry(day)

    if (code === "901" || code === "908") {
      const prior = borrowerFees.filter((b) => b.fee.feeCents > 0 && b.fee.rule !== "provincially_regulated").map((b) => b.date)
      const fee = borrowerNsfFee(s.borrowerAccount, { date: day, shortfallCents: f.attempt.amountCents, priorFeeDates: prior })
      borrowerFees.push({ date: day, fee })
      events.push({ date: day, type: "borrower_fee", fee, amountCents: fee.feeCents, text: `Borrower's own bank NSF fee: ${fee.explanation}` })
    }
    for (const it of f.items) {
      it.attempts++
      it.rescheduled = false
      it.firstFailedOn ??= day
      openCure(it)
    }
    if (s.recovery.notifyOnFirstFailure) {
      events.push({ date: day, type: "borrower_notified", text: "Borrower notified in plain language: the payment didn't go through, what happens next, and how to reach us." })
    }

    const path = RECOVERY_PATH[code]
    if (path === "retry") {
      const retryable = f.items.filter((it) => it.attempts <= s.recovery.maxRetries)
      const exhausted = f.items.filter((it) => it.attempts > s.recovery.maxRetries)
      if (retryable.length) {
        let plan = planRetry(day, s.recovery, s.payroll)
        // A retry is never combined with a scheduled payment (Rule H1): if one falls
        // within 2 business days of the planned date, the retry follows it instead.
        const near = (a: string, b: string) => (a <= b ? businessDaysBetween(a, b) : businessDaysBetween(b, a)) < 2
        const clash = items.filter((it) => it.state === "open" && it.attempts === 0 && !retryable.includes(it) && near(it.dueOn, plan.date)).sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0]
        if (clash) {
          const date = addBusinessDays(clash.dueOn, 2)
          plan = { date, reason: `Retry on ${date}: planned for ${plan.date}, but a scheduled payment goes out on ${clash.dueOn}, so the retry follows it rather than being combined with it.` }
        }
        for (const it of retryable) {
          it.dueOn = plan.date
          it.state = "open"
        }
        events.push({ date: day, type: "retry_scheduled", text: plan.reason })
      }
      for (const it of exhausted) it.state = "held"
      if (exhausted.length && failures >= s.recovery.outreachAfterFailures) {
        events.push({ date: day, type: "outreach_task", text: "Retry failed: outreach task created for the Collections queue. No more automatic retries on this payment." })
      }
    } else {
      for (const it of f.items) it.state = "held"
      const resume = s.script?.resumeAfterDays && path === "contact_borrower" ? addDays(day, s.script.resumeAfterDays) : null
      blocked = { until: resume, code }
      events.push(
        path === "new_banking_details"
          ? { date: day, type: "banking_details_requested", text: "The account can't take debits: asked the borrower for new banking details. Debits stop until they're provided." }
          : { date: day, type: "borrower_contacted", text: "Contacted the borrower about the refused or stopped debit. No retry." },
      )
    }

    // Hardship signal: repeated NSF returns in 90 days. The deferral is only
    // offered here; nothing on the loan changes until a second person approves it.
    const recentNsf = attempts.filter((a) => a.outcome === "returned" && (a.code === "901" || a.code === "908") && daysBetween(a.returnedOn!, day) < 90).length
    if (!hardshipOffered && recentNsf >= s.recovery.hardshipSignalThreshold) {
      hardshipOffered = true
      hardshipRequestedOn = day
      const amount = deferrable(day).reduce((t, it) => t + it.amountCents, 0)
      events.push({
        date: day,
        type: "hardship_offered",
        amountCents: amount,
        text: `${recentNsf} returned payments in 90 days: offered a 3-month payment deferral (illustrative). It needs a lender's approval and a second person's sign-off; until then nothing on the loan changes.`,
      })
    }
  }

  /** The payments a deferral requested on `from` would move: anything unpaid falling due in the next 90 days, and any missed. */
  const deferrable = (from: string) => items.filter((x) => (x.state === "open" || x.state === "held") && x.dueOn < addDays(from, 90))

  /** Applies the lender's decision on the hardship request, on the day it was made. */
  const decideHardship = (day: string) => {
    const d = s.hardshipDecision
    if (!d || hardshipDecided || !hardshipRequestedOn || day < d.on || day < hardshipRequestedOn) return
    hardshipDecided = true
    if (!d.approved) {
      events.push({ date: day, type: "hardship_declined", text: `Deferral declined at the second-person check (${d.by}). Normal recovery continues.` })
      return
    }
    const moved = deferrable(hardshipRequestedOn)
    hardshipUntil = addMonths(day, 3)
    events.push({ date: day, type: "hardship_approved", amountCents: moved.reduce((t, it) => t + it.amountCents, 0), text: `Deferral signed off by a second person (${d.by}, maker-checker). Debits pause for 3 months.` })
    // Every payment still to come moves back three months, keeping its amount.
    // Missed payments move to the end of the loan, one per period, so nothing
    // is collected as a lump when the deferral ends.
    const unpaid = items.filter((x) => x.state === "open" || x.state === "held").sort((a, b) => a.n - b.n)
    const missed = unpaid.filter((x) => x.scheduledOn < day)
    const upcoming = unpaid.filter((x) => x.scheduledOn >= day)
    for (const it of upcoming) {
      it.scheduledOn = addMonths(it.scheduledOn, 3)
      it.dueOn = it.scheduledOn
    }
    const dates = items.map((x) => x.scheduledOn).sort()
    const gapDays = dates.length > 1 ? daysBetween(dates[dates.length - 2], dates[dates.length - 1]) : 30
    let last = dates[dates.length - 1] < hardshipUntil ? hardshipUntil : dates[dates.length - 1]
    for (const it of missed) {
      last = gapDays >= 28 && gapDays <= 31 ? addMonths(last, 1) : addDays(last, gapDays)
      it.scheduledOn = last
      it.dueOn = last
      it.state = "open"
      it.rescheduled = true
    }
    events.push({
      date: day,
      type: "payments_deferred",
      text: `Payments from ${day} move back three months; ${missed.length ? `${missed.length} missed payment(s) move to the end of the loan` : "no missed payments to move"}. Nothing is collected until ${hardshipUntil}.`,
    })
    setStatus(day, "hardship", "Hardship deferral approved.")
  }

  for (let day = fundedOn; day <= horizon; day = addDays(day, 1)) {
    // 1. Interest falls due on each scheduled date (illustrative accrual).
    for (const it of items) {
      if (it.scheduledOn === day && !accrued.has(it.id) && it.interestCents > 0) {
        accrued.add(it.id)
        const amt = it.interestCents
        post(day, (l) => postInterestAccrual(l, s.id, amt, day))
        interest += amt
        events.push({ date: day, type: "interest_accrued", amountCents: amt, text: "Interest for the period." })
      }
    }

    // 2. Settlements, then returns that arrive after settlement.
    for (const f of inFlight.filter((x) => x.settleOn === day)) {
      const split = f.split
      post(day, (l) => postCollectionSettled(l, s.id, split, day))
      f.attempt.settledOn = day
      if (!f.returnOn) {
        inFlight.splice(inFlight.indexOf(f), 1)
        f.attempt.outcome = "settled"
        for (const it of f.items) {
          it.state = "paid"
          const cure = cures.find((c) => c.failedOn === it.firstFailedOn && c.curedOn === null)
          if (cure && daysBetween(cure.failedOn, day) <= config.collections.cureWindowDays) {
            cure.curedOn = day
            events.push({ date: day, type: "cured", text: "Missed payment collected: cured." })
          }
        }
        events.push({ date: day, type: "debit_settled", amountCents: f.attempt.amountCents, attemptId: f.attempt.id, text: "Debit settled." })
      }
    }
    for (const f of inFlight.filter((x) => x.returnOn === day)) handleReturn(f, day)

    // 3. Resume after a contact, or after a hardship deferral.
    if (blocked?.until === day) {
      // The missed payment is a debit on a new date, so the borrower gets Rule H1's notice first.
      const on = addDays(day, PAD_RULES.preNotificationDays)
      const held = items.filter((x) => x.state === "held")
      events.push({
        date: day,
        type: "debits_resumed",
        text: `Borrower confirmed: debits resume. ${held.length ? `The missed payment is collected on ${on}, after ${PAD_RULES.preNotificationDays} days' notice of its date and amount.` : "Nothing was missed."}`,
      })
      for (const it of held) {
        it.state = "open"
        it.dueOn = on
      }
      blocked = null
    }
    if (hardshipUntil === day) {
      hardshipUntil = null
      events.push({ date: day, type: "debits_resumed", text: "Deferral ended: debits resume." })
    }

    // 4. Send today's debit: one debit for everything due, never too close to the last.
    const canSend = isBusinessDay(day) && !blocked && !hardshipUntil && day >= nextAllowed && (!lastSent || businessDaysBetween(lastSent, day) >= 2)
    // Rule H1: one payment per debit, at its own amount; never a combined or catch-up debit.
    // A payment that has never been tried goes before a retry; otherwise the oldest first.
    const ready = canSend ? items.filter((it) => it.state === "open" && it.dueOn <= day) : []
    const pick = ready.sort((a, b) => Number(b.attempts === 0) - Number(a.attempts === 0) || a.n - b.n)[0]
    const due = pick ? [pick] : []
    if (due.length) {
      const amount = due.reduce((t, it) => t + it.amountCents, 0)
      const split = applyPayment(amount, interest)
      const attempt: Attempt = {
        id: `${s.id.replace(/^loan_/, "")}-a${attempts.length + 1}`,
        sentOn: day,
        amountCents: amount,
        items: due.map((it) => it.id),
        isRetry: due.some((it) => it.attempts > 0 && !it.rescheduled),
        outcome: "settled",
      }
      attempts.push(attempt)
      const posting: CollectionPosting = { collectionId: `col_${attempt.id}`, ...split }
      post(day, (l) => postCollectionSent(l, s.id, posting, day))
      principal -= split.principalCents
      interest -= split.interestCents
      for (const it of due) it.state = "in_flight"
      lastSent = day
      events.push({ date: day, type: "debit_sent", amountCents: amount, attemptId: attempt.id, text: attempt.isRetry ? "Retry debit sent: the same payment and amount, under the existing agreement." : "Scheduled debit sent." })

      // Will it come back? Planted returns first, then a seeded chance.
      const attemptNo = Math.max(...due.map((it) => it.attempts)) + 1
      const firstN = Math.min(...due.map((it) => it.n))
      const scripted = s.script?.returns.find((r) => r.n === firstN && r.attempt === attemptNo)
      const random = !s.script && rng.chance(attemptNo > 1 ? 0.15 : s.baseReturnRate) ? ("901" as ReturnCode) : null
      const code = scripted?.code ?? random
      const f: InFlight = { attempt, split: posting, items: due, settleOn: addBusinessDays(day, config.collections.settlementBusinessDays), returnOn: null, code: null, stage: null }
      if (code) {
        f.code = code
        f.stage = RETURNED_BEFORE_SETTLEMENT.has(code) ? "clearing" : "settled"
        if (f.stage === "clearing") {
          f.settleOn = null
          f.returnOn = day
        } else {
          f.returnOn = addBusinessDays(f.settleOn!, config.collections.returnBusinessDaysAfterSettlement)
        }
        attempt.code = code
        attempt.stage = f.stage
      }
      inFlight.push(f)
      // An account-level problem comes straight back, before settlement.
      if (f.returnOn === day) handleReturn(f, day)
    }

    // Draws on the line (after any debit that day), never beyond the limit.
    while (pendingDraws.length && pendingDraws[0].date === day && !chargedOffOn) {
      const dr = pendingDraws.shift()!
      if (drawnTotal + dr.amountCents > s.principalCents) throw new Error(`${s.id}: draw would exceed the limit`)
      drawCount++
      drawnTotal += dr.amountCents
      const k = drawCount
      post(day, (l) => postDraw(l, s.id, dr.amountCents, day, k))
      principal += dr.amountCents
      events.push({ date: day, type: "drawn", amountCents: dr.amountCents, text: `Draw ${k} on the line, by AFT.` })
    }

    // The lender's decision on a hardship request takes effect the day the approval completes.
    decideHardship(day)

    // 5. Delinquency, charge-off and payoff.
    // A payment is past due from its scheduled date once it has failed, or once that date has passed unpaid.
    // A retry in flight is still past due until it settles.
    const overdue = items.filter(
      (it) => {
        const failed = it.attempts > 0 && !it.rescheduled
        return it.scheduledOn < day && (((it.state === "open" || it.state === "held") && (failed || it.dueOn < day)) || (it.state === "in_flight" && failed))
      },
    )
    const oldest = overdue.length ? overdue.reduce((a, b) => (a.scheduledOn < b.scheduledOn ? a : b)) : null
    const dpd = oldest ? daysBetween(oldest.scheduledOn, day) : 0
    if (!hardshipUntil) {
      if (dpd >= config.chargeOffDaysPastDue && principal + interest > 0 && !inFlight.length) {
        post(day, (l) => postChargeOff(l, s.id, day, dpd))
        events.push({ date: day, type: "charged_off", amountCents: principal + interest, text: `Charged off at ${dpd} days past due: what's still owed is recognized as a credit loss. Recovery efforts can continue.` })
        principal = 0
        interest = 0
        chargedOffOn = day
        setStatus(day, "charged_off", `Charged off at ${dpd} days past due.`)
        break
      }
      if (dpd > 0 && status === "active") setStatus(day, "delinquent", `${dpd} day(s) past due.`)
      if (dpd === 0 && (status === "delinquent" || status === "hardship")) setStatus(day, "active", "Back up to date.")
    }
    // A line that was never drawn isn't "paid off": it's simply open and unused.
    const everOwed = !s.draws || drawnTotal > 0
    if (everOwed && items.every((it) => it.state === "paid") && principal + interest === 0 && pendingDraws.length === 0) {
      events.push({ date: day, type: "paid_off", text: "Paid in full." })
      setStatus(day, "paid_off", "Paid in full.")
      break
    }
  }

  return { setup: s, events, attempts, statusTimeline, borrowerFees, balances: { principalCents: principal, interestCents: interest }, cures, chargedOffOn }
}

/** Simulates a lender's whole book to `horizon` and posts every entry to one balanced ledger, in date order. */
export function simulateBook(institutionId: InstitutionId, mode: Mode, setups: LoanSetup[], horizon: string, config: ServicingConfig = SERVICING): BookResult {
  const postings: Posting[] = []
  const loans = setups.map((s) => simulateLoan(s, horizon, config, postings))
  const ledger = new Ledger(institutionId)
  postings
    .sort((a, b) => a.date.localeCompare(b.date) || a.loanId.localeCompare(b.loanId) || a.order - b.order)
    .forEach((p) => p.apply(ledger))
  return { institutionId, mode, horizon, ledger, loans }
}

/** The loan's status on a given date. */
export function statusOn(loan: LoanResult, date: string): LoanStatus {
  let s: LoanStatus = "active"
  for (const t of loan.statusTimeline) if (t.date <= date) s = t.status
  return s
}

export { daysBetween }
