import { addBusinessDays } from "@/lib/rules/nsf"
import type { ReturnCode } from "@/lib/schemas"
import { account } from "./ledger"
import type { BookResult } from "./simulate"

/*
 * Reconciliation: the lender's settlement account at its bank, matched
 * against the ledger at each month-end cut-off. Lines match on reference,
 * direction and amount, dated on or before the cut-off.
 *
 * The bank statement is simulated from what the bank would see. Two breaks
 * are planted so reconciliation has something real to find:
 * - a returned PAD the bank processed but whose return file never reached
 *   servicing (the ledger still shows the payment as collected)
 * - a timing difference: a collection the ledger settled on the last
 *   business day of a month that the bank posts the next business day
 */

export interface StatementLine {
  date: string
  /** Positive: money into the settlement account. Negative: money out. */
  amountCents: number
  reference: string
  description: string
}

export interface LedgerLine {
  date: string
  amountCents: number
  reference: string
  entryId: string
  loanId?: string
  description: string
}

export type BreakKind = "returned_pad_not_applied" | "timing_difference" | "amount_mismatch" | "missing_from_bank" | "missing_from_ledger"

export interface Break {
  kind: BreakKind
  reference: string
  loanId?: string
  ledger?: LedgerLine
  bank?: StatementLine
  differenceCents: number
  /** What a person should do about it. */
  action: string
}

export interface ReconciliationReport {
  institutionId: string
  cutoff: string
  matched: { ledger: LedgerLine; bank: StatementLine }[]
  breaks: Break[]
  /** Share of ledger and bank lines that matched. */
  matchRate: number
  /** Ledger plus bank lines in the period (the match rate's denominator). */
  linesCompared: number
  ledgerTotalCents: number
  bankTotalCents: number
}

export interface PlantedBreaks {
  /** A settled collection the bank later returned; the return never reached the ledger. */
  returnNotApplied?: { reference: string; code: ReturnCode }
  /** A settlement the bank posts one business day after the ledger. */
  timingDifference?: { reference: string }
}

/** The planted breaks in each lender's statement (only Northgate's, January 2027). */
export const PLANTED_BREAKS: Record<string, PlantedBreaks> = {
  northgate: {
    returnNotApplied: { reference: "col_main-street-hardware-cu-a3", code: "901" },
    timingDifference: { reference: "col_grace-cu-a8" },
  },
}

/** Settlement-account movements as the ledger records them. */
export function ledgerLines(book: BookResult): LedgerLine[] {
  const acct = account.settlement(book.institutionId)
  const out: LedgerLine[] = []
  for (const e of book.ledger.all) {
    for (const l of e.lines) {
      if (l.account !== acct) continue
      out.push({
        date: e.date,
        amountCents: l.debitCents - l.creditCents,
        reference: e.type === "disbursement" ? `dsb_${e.loanId!.replace(/^loan_/, "")}` : e.ref?.kind === "payment_return" ? e.ref.id : e.ref?.id ?? e.id,
        entryId: e.id,
        loanId: e.loanId,
        description: e.memo,
      })
    }
  }
  return out
}

/** The bank's statement for the settlement account, with the planted breaks. */
export function bankStatement(book: BookResult, planted: PlantedBreaks = PLANTED_BREAKS[book.institutionId] ?? {}): StatementLine[] {
  const lines: StatementLine[] = ledgerLines(book).map((l) => ({
    date: l.reference === planted.timingDifference?.reference ? addBusinessDays(l.date, 1) : l.date,
    amountCents: l.amountCents,
    reference: l.reference,
    description: l.amountCents > 0 ? "PAD settlement credit" : l.reference.startsWith("ret_") ? "Returned item" : "Outgoing funds",
  }))
  if (planted.returnNotApplied) {
    const settled = lines.find((l) => l.reference === planted.returnNotApplied!.reference && l.amountCents > 0)
    if (settled) {
      lines.push({
        date: addBusinessDays(settled.date, 2),
        amountCents: -settled.amountCents,
        reference: `ret_${planted.returnNotApplied.reference.replace(/^col_/, "")}`,
        description: `Returned item ${planted.returnNotApplied.code}`,
      })
    }
  }
  return lines.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference))
}

/** Reconciles the ledger with the bank statement at a cut-off date. */
export function reconcile(book: BookResult, cutoff: string, statement: StatementLine[] = bankStatement(book)): ReconciliationReport {
  const ledger = ledgerLines(book)
  const inPeriodLedger = ledger.filter((l) => l.date <= cutoff)
  const inPeriodBank = statement.filter((l) => l.date <= cutoff)
  const key = (r: string, amount: number) => `${r}|${Math.sign(amount)}`
  const bankByKey = new Map(inPeriodBank.map((b) => [key(b.reference, b.amountCents), b]))
  const laterBank = new Map(statement.filter((l) => l.date > cutoff).map((b) => [key(b.reference, b.amountCents), b]))
  const usedBank = new Set<StatementLine>()

  const matched: ReconciliationReport["matched"] = []
  const breaks: Break[] = []
  for (const l of inPeriodLedger) {
    const b = bankByKey.get(key(l.reference, l.amountCents))
    if (b) {
      usedBank.add(b)
      if (b.amountCents === l.amountCents) matched.push({ ledger: l, bank: b })
      else breaks.push({ kind: "amount_mismatch", reference: l.reference, loanId: l.loanId, ledger: l, bank: b, differenceCents: b.amountCents - l.amountCents, action: "Amounts differ: check the collection file and the bank's record, then correct with a reversing entry." })
      continue
    }
    const later = laterBank.get(key(l.reference, l.amountCents))
    breaks.push(
      later
        ? { kind: "timing_difference", reference: l.reference, loanId: l.loanId, ledger: l, bank: later, differenceCents: -l.amountCents, action: `Timing difference: in the ledger on ${l.date}, at the bank on ${later.date}. No action; it clears next period.` }
        : { kind: "missing_from_bank", reference: l.reference, loanId: l.loanId, ledger: l, differenceCents: -l.amountCents, action: "In the ledger but not at the bank: investigate before month-end close." },
    )
  }
  for (const b of inPeriodBank) {
    if (usedBank.has(b)) continue
    const isReturn = b.reference.startsWith("ret_") && b.amountCents < 0
    breaks.push(
      isReturn
        ? {
            kind: "returned_pad_not_applied",
            reference: b.reference,
            loanId: `loan_${b.reference.replace(/^ret_/, "").replace(/-a\d+$/, "")}`,
            bank: b,
            differenceCents: b.amountCents,
            action: `The bank returned this debit (${b.description}) but the return never reached the loan, which still shows it paid. Apply the return to the loan and start recovery.`,
          }
        : { kind: "missing_from_ledger", reference: b.reference, bank: b, differenceCents: b.amountCents, action: "At the bank but not in the ledger: find the source and post it." },
    )
  }

  const total = inPeriodLedger.length + inPeriodBank.length
  return {
    institutionId: book.institutionId,
    cutoff,
    matched,
    breaks,
    matchRate: total ? Math.round(((matched.length * 2) / total) * 1000) / 1000 : 1,
    linesCompared: total,
    ledgerTotalCents: inPeriodLedger.reduce((t, l) => t + l.amountCents, 0),
    bankTotalCents: inPeriodBank.reduce((t, l) => t + l.amountCents, 0),
  }
}

/** Month-end cut-offs (last calendar day of each month) between two dates. */
export function monthEnds(from: string, to: string): string[] {
  const out: string[] = []
  let y = Number(from.slice(0, 4))
  let m = Number(from.slice(5, 7))
  for (;;) {
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    if (end > to) break
    if (end >= from) out.push(end)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}
