import { addBusinessDays, businessDaysBetween, earliestSafeRetry, isBusinessDay } from "@/lib/rules/nsf"
import { Rng, hashSeed } from "@/lib/rng"
import type { InstitutionId, Mode } from "@/lib/modes"
import type { ReturnCode, RecoveryRules } from "@/lib/schemas"
import type { ScheduledDebit } from "@/lib/engine/repayment"
import { borrowerNsfFee, type BorrowerAccount, type BorrowerFee } from "./borrower-bank"
import { SERVICING, type ServicingConfig } from "./config"
import type { FundingResult } from "./funding"
import {
  applyPayment,
  Ledger,
  postChargeOff,
  postCollectionSent,
  postCollectionSettled,
  postDisbursement,
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
  principalCents: number
  schedule: ScheduledDebit[]
  funding: FundingResult
  borrowerAccount: BorrowerAccount
  payroll: { lastPayDate: string; cadenceDays: number } | null
  recovery: RecoveryRules
  /** Probability a regular debit is returned NSF when not scripted. */
  baseReturnRate: number
  /** Planted returns, keyed by scheduled debit number and attempt. */
  script?: Script
}

export interface Script {
  returns: { n: number; attempt: number; code: ReturnCode }[]
  /** After a non-retry return, debits resume this many days later (e.g. the borrower signs a new agreement). */
  resumeAfterDays?: number
}

export type LoanEventType =
  | "funded"
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
  deferred?: boolean
}

interface Posting {
  date: string
  order: number
  loanId: string
  apply: (l: Ledger) => void
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

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

  // Funding
  const fundedOn = s.funding.fundedOn
  post(fundedOn, (l) => postDisbursement(l, s.id, s.principalCents, fundedOn, s.funding.rail === "rtr_simulated" ? "Real-Time Rail (simulated)" : s.funding.rail === "aft" ? "AFT" : "Interac e-Transfer"))
  principal += s.principalCents
  events.push({ date: fundedOn, type: "funded", amountCents: s.principalCents, text: `Funded ${s.funding.rail === "rtr_simulated" ? "by Real-Time Rail (simulated — RTR launching)" : s.funding.rail === "aft" ? "by AFT" : "by Interac e-Transfer"}.` })
  setStatus(fundedOn, "active", "Loan funded.")

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
        const plan = planRetry(day, s.recovery, s.payroll)
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

    // Hardship signal: repeated NSF returns in 90 days.
    const recentNsf = attempts.filter((a) => a.outcome === "returned" && (a.code === "901" || a.code === "908") && daysBetween(a.returnedOn!, day) < 90).length
    if (!hardshipOffered && recentNsf >= s.recovery.hardshipSignalThreshold) {
      hardshipOffered = true
      hardshipUntil = addDays(day, 90)
      events.push({ date: day, type: "hardship_offered", text: `${recentNsf} returned payments in 90 days: offered a 3-month payment deferral (pending lender approval; illustrative). Debits pause.` })
      for (const it of items.filter((x) => x.state === "open" || x.state === "held")) {
        it.state = "open"
        it.deferred = true
        if (it.dueOn < hardshipUntil) it.dueOn = hardshipUntil
      }
      events.push({ date: day, type: "payments_deferred", text: `Payments due before ${hardshipUntil} move to ${hardshipUntil}.` })
      setStatus(day, "hardship", "Hardship deferral offered.")
    }
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
      events.push({ date: day, type: "debits_resumed", text: "Borrower confirmed: debits resume, including the missed amount." })
      for (const it of items.filter((x) => x.state === "held")) {
        it.state = "open"
        it.dueOn = day
      }
      blocked = null
    }
    if (hardshipUntil === day) {
      hardshipUntil = null
      events.push({ date: day, type: "debits_resumed", text: "Deferral ended: debits resume." })
    }

    // 4. Send today's debit: one debit for everything due, never too close to the last.
    const canSend = isBusinessDay(day) && !blocked && !hardshipUntil && day >= nextAllowed && (!lastSent || businessDaysBetween(lastSent, day) >= 2)
    const due = canSend ? items.filter((it) => it.state === "open" && it.dueOn <= day) : []
    if (due.length) {
      const amount = due.reduce((t, it) => t + it.amountCents, 0)
      const split = applyPayment(amount, interest)
      const attempt: Attempt = {
        id: `${s.id.replace(/^loan_/, "")}-a${attempts.length + 1}`,
        sentOn: day,
        amountCents: amount,
        items: due.map((it) => it.id),
        isRetry: due.some((it) => it.attempts > 0),
        outcome: "settled",
      }
      attempts.push(attempt)
      const posting: CollectionPosting = { collectionId: `col_${attempt.id}`, ...split }
      post(day, (l) => postCollectionSent(l, s.id, posting, day))
      principal -= split.principalCents
      interest -= split.interestCents
      for (const it of due) it.state = "in_flight"
      lastSent = day
      events.push({ date: day, type: "debit_sent", amountCents: amount, attemptId: attempt.id, text: attempt.isRetry ? "Retry debit sent (pre-notified)." : "Scheduled debit sent." })

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

    // 5. Delinquency, charge-off and payoff.
    // A payment is past due from its scheduled date once it has failed, or once that date has passed unpaid.
    // A retry in flight is still past due until it settles.
    const overdue = items.filter(
      (it) => !it.deferred && it.scheduledOn < day && (((it.state === "open" || it.state === "held") && (it.attempts > 0 || it.dueOn < day)) || (it.state === "in_flight" && it.attempts > 0)),
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
    if (items.every((it) => it.state === "paid") && principal + interest === 0) {
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
