import type { InstitutionId } from "@/lib/modes"
import { JournalEntry, type JournalEntryType, type JournalLine, type SubjectRef } from "@/lib/schemas"

/*
 * Double-entry, append-only ledger for a lender's loan book. All amounts are
 * integer cents. Every entry is validated (debits equal credits, each line a
 * debit or a credit) and frozen once posted; corrections are reversing
 * entries, never edits.
 *
 * Account balances are debit-positive: asset and expense accounts
 * (receivables, settlement, clearing, credit loss) carry positive balances;
 * income accounts carry negative ones.
 */

export const account = {
  principal: (loanId: string) => `principal:${loanId}`,
  interest: (loanId: string) => `interest:${loanId}`,
  settlement: (inst: InstitutionId) => `settlement:${inst}`,
  clearing: (inst: InstitutionId) => `clearing:${inst}`,
  interestIncome: (inst: InstitutionId) => `interest_income:${inst}`,
  creditLoss: (inst: InstitutionId) => `credit_loss:${inst}`,
}

export interface PostInput {
  type: JournalEntryType
  date: string
  memo: string
  loanId?: string
  ref?: SubjectRef
  reversesEntryId?: string
  lines: { account: string; debitCents?: number; creditCents?: number }[]
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.values(o).forEach(deepFreeze)
    Object.freeze(o)
  }
  return o
}

export class Ledger {
  private readonly entries: JournalEntry[] = []

  constructor(readonly institutionId: InstitutionId) {}

  /** Validates and appends an entry. Throws if it doesn't balance or isn't whole cents. */
  post(input: PostInput): JournalEntry {
    const seq = this.entries.length + 1
    const lines: JournalLine[] = input.lines.map((l) => ({ account: l.account, debitCents: l.debitCents ?? 0, creditCents: l.creditCents ?? 0 }))
    const entry = JournalEntry.parse({
      id: `jrn_${this.institutionId}-${String(seq).padStart(5, "0")}`,
      seq,
      institutionId: this.institutionId,
      loanId: input.loanId,
      type: input.type,
      date: input.date,
      memo: input.memo,
      ref: input.ref,
      reversesEntryId: input.reversesEntryId,
      lines,
    })
    const last = this.entries.at(-1)
    if (last && entry.date < last.date) throw new Error(`entries must be posted in date order: ${entry.date} after ${last.date}`)
    this.entries.push(deepFreeze(entry))
    return entry
  }

  /** Posts the exact opposite of an earlier entry. */
  reverse(entryId: string, date: string, memo: string): JournalEntry {
    const original = this.entries.find((e) => e.id === entryId)
    if (!original) throw new Error(`no entry ${entryId}`)
    return this.post({
      type: "reversal",
      date,
      memo,
      loanId: original.loanId,
      reversesEntryId: original.id,
      lines: original.lines.map((l) => ({ account: l.account, debitCents: l.creditCents, creditCents: l.debitCents })),
    })
  }

  /** A frozen copy: callers can read entries but never add, remove or change them. */
  get all(): readonly JournalEntry[] {
    return Object.freeze([...this.entries])
  }

  forLoan(loanId: string): JournalEntry[] {
    return this.entries.filter((e) => e.loanId === loanId)
  }

  /** Debit-positive balance of an account, optionally as of a date (inclusive). */
  balance(acct: string, asOf?: string): number {
    let b = 0
    for (const e of this.entries) {
      if (asOf && e.date > asOf) break
      for (const l of e.lines) if (l.account === acct) b += l.debitCents - l.creditCents
    }
    return b
  }

  /** What the borrower owes on a loan: principal plus interest receivable. */
  outstanding(loanId: string, asOf?: string): number {
    return this.balance(account.principal(loanId), asOf) + this.balance(account.interest(loanId), asOf)
  }

  /** Total debits and credits across every entry. They are always equal. */
  trialBalance(): { debitCents: number; creditCents: number; accounts: Record<string, number> } {
    let debitCents = 0
    let creditCents = 0
    const accounts: Record<string, number> = {}
    for (const e of this.entries) {
      for (const l of e.lines) {
        debitCents += l.debitCents
        creditCents += l.creditCents
        accounts[l.account] = (accounts[l.account] ?? 0) + l.debitCents - l.creditCents
      }
    }
    return { debitCents, creditCents, accounts }
  }
}

// ---------------------------------------------------------------------------
// Postings for each servicing event
// ---------------------------------------------------------------------------

const ref = (kind: SubjectRef["kind"], id: string): SubjectRef => ({ kind, id })

/** Funding: the loan becomes a receivable and cash leaves the settlement account. */
export function postDisbursement(l: Ledger, loanId: string, amountCents: number, date: string, rail: string) {
  return l.post({
    type: "disbursement",
    date,
    loanId,
    memo: `Loan funded by ${rail}`,
    ref: ref("loan", loanId),
    lines: [
      { account: account.principal(loanId), debitCents: amountCents },
      { account: account.settlement(l.institutionId), creditCents: amountCents },
    ],
  })
}

/** A draw on a line of credit: the borrower takes money up to the limit. */
export function postDraw(l: Ledger, loanId: string, amountCents: number, date: string, drawNumber: number) {
  return l.post({
    type: "draw",
    date,
    loanId,
    memo: `Draw ${drawNumber} on the line`,
    ref: ref("loan", `draw-${loanId.replace(/^loan_/, "")}-${drawNumber}`),
    lines: [
      { account: account.principal(loanId), debitCents: amountCents },
      { account: account.settlement(l.institutionId), creditCents: amountCents },
    ],
  })
}

/** Interest earned for a period (illustrative rates). */
export function postInterestAccrual(l: Ledger, loanId: string, amountCents: number, date: string) {
  if (amountCents === 0) return null
  return l.post({
    type: "interest_accrual",
    date,
    loanId,
    memo: "Interest accrued",
    lines: [
      { account: account.interest(loanId), debitCents: amountCents },
      { account: account.interestIncome(l.institutionId), creditCents: amountCents },
    ],
  })
}

/**
 * Splits a payment: interest owed first, then principal. Returns integer
 * cents that always add back up to the payment.
 */
export function applyPayment(paymentCents: number, interestOwedCents: number): { interestCents: number; principalCents: number } {
  const interestCents = Math.max(0, Math.min(paymentCents, interestOwedCents))
  return { interestCents, principalCents: paymentCents - interestCents }
}

export interface CollectionPosting {
  collectionId: string
  interestCents: number
  principalCents: number
}

/** A pre-authorized debit is sent: receivables come down, the money is in clearing. */
export function postCollectionSent(l: Ledger, loanId: string, c: CollectionPosting, date: string) {
  const lines: PostInput["lines"] = [{ account: account.clearing(l.institutionId), debitCents: c.interestCents + c.principalCents }]
  if (c.interestCents) lines.push({ account: account.interest(loanId), creditCents: c.interestCents })
  if (c.principalCents) lines.push({ account: account.principal(loanId), creditCents: c.principalCents })
  return l.post({ type: "collection_sent", date, loanId, memo: "Pre-authorized debit sent", ref: ref("collection", c.collectionId), lines })
}

/** The debit settles: clearing moves to the settlement account. */
export function postCollectionSettled(l: Ledger, loanId: string, c: CollectionPosting, date: string) {
  const amount = c.interestCents + c.principalCents
  return l.post({
    type: "collection_settled",
    date,
    loanId,
    memo: "Pre-authorized debit settled",
    ref: ref("collection", c.collectionId),
    lines: [
      { account: account.settlement(l.institutionId), debitCents: amount },
      { account: account.clearing(l.institutionId), creditCents: amount },
    ],
  })
}

/**
 * A debit comes back unpaid. Receivables go back up. If the debit was still
 * in clearing, clearing is reversed; if it had settled, the settlement
 * account gives the money back.
 */
export function postReturn(l: Ledger, loanId: string, c: CollectionPosting, date: string, stage: "clearing" | "settled", returnId: string, code: string) {
  const amount = c.interestCents + c.principalCents
  const lines: PostInput["lines"] = []
  if (c.interestCents) lines.push({ account: account.interest(loanId), debitCents: c.interestCents })
  if (c.principalCents) lines.push({ account: account.principal(loanId), debitCents: c.principalCents })
  lines.push({ account: stage === "clearing" ? account.clearing(l.institutionId) : account.settlement(l.institutionId), creditCents: amount })
  return l.post({
    type: stage === "clearing" ? "return_from_clearing" : "return_after_settlement",
    date,
    loanId,
    memo: `Debit returned (${code}) ${stage === "clearing" ? "before settlement" : "after settlement"}`,
    ref: ref("payment_return", returnId),
    lines,
  })
}

/** Charge-off: what's still owed is recognized as a credit loss. */
export function postChargeOff(l: Ledger, loanId: string, date: string, daysPastDue: number) {
  const principal = l.balance(account.principal(loanId))
  const interest = l.balance(account.interest(loanId))
  if (principal + interest <= 0) throw new Error(`nothing to charge off on ${loanId}`)
  const lines: PostInput["lines"] = [{ account: account.creditLoss(l.institutionId), debitCents: principal + interest }]
  if (principal) lines.push({ account: account.principal(loanId), creditCents: principal })
  if (interest) lines.push({ account: account.interest(loanId), creditCents: interest })
  return l.post({ type: "charge_off", date, loanId, memo: `Charged off at ${daysPastDue} days past due`, ref: ref("loan", loanId), lines })
}
