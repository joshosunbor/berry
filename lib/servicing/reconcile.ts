import { addBusinessDays } from "@/lib/rules/nsf"
import type { ReturnCode } from "@/lib/schemas"
import { account } from "./ledger"
import type { BookResult } from "./simulate"

/*
 * Reconciliation: the lender's settlement account at its bank, matched
 * against the ledger month by month. Each month compares that month's
 * movements, plus anything left unresolved from earlier months; lines match
 * on reference, direction and amount.
 *
 * The bank statement is built from what the bank saw (the simulator's
 * funding, draws, settlements and returns), never from the ledger, so an
 * error in the ledger shows up as a break. Two breaks are planted so
 * reconciliation has something real to find:
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
    returnNotApplied: { reference: "col_fennick-hardware-cu-a3", code: "901" },
    timingDifference: { reference: "col_grace-cu-a9" },
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

/** The bank's statement for the settlement account, from the money movements themselves, with the planted breaks. */
export function bankStatement(book: BookResult, planted: PlantedBreaks = PLANTED_BREAKS[book.institutionId] ?? {}): StatementLine[] {
  const lines: StatementLine[] = []
  for (const loan of book.loans) {
    const short = loan.setup.id.replace(/^loan_/, "")
    const funded = loan.events.find((e) => e.type === "funded")
    if (funded) lines.push({ date: funded.date, amountCents: -funded.amountCents!, reference: `dsb_${short}`, description: "Outgoing funds" })
    loan.events
      .filter((e) => e.type === "drawn")
      .forEach((e, i) => lines.push({ date: e.date, amountCents: -e.amountCents!, reference: `draw-${short}-${i + 1}`, description: "Outgoing funds" }))
    for (const a of loan.attempts) {
      // Returned before settlement never reached the settlement account.
      if (!a.settledOn) continue
      const ref = `col_${a.id}`
      lines.push({ date: ref === planted.timingDifference?.reference ? addBusinessDays(a.settledOn, 1) : a.settledOn, amountCents: a.amountCents, reference: ref, description: "PAD settlement credit" })
      if (a.outcome === "returned" && a.stage === "settled") lines.push({ date: a.returnedOn!, amountCents: -a.amountCents, reference: `ret_${a.id}`, description: `Returned item ${a.code}` })
    }
  }
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

/** One month's comparison: lines in the period plus those still open, matched on reference and direction. */
function matchPeriod(ledger: LedgerLine[], bank: StatementLine[], laterBank: StatementLine[]) {
  const key = (r: string, amount: number) => `${r}|${Math.sign(amount)}`
  const bankByKey = new Map(bank.map((b) => [key(b.reference, b.amountCents), b]))
  const later = new Map(laterBank.map((b) => [key(b.reference, b.amountCents), b]))
  const usedBank = new Set<StatementLine>()
  const matched: ReconciliationReport["matched"] = []
  const breaks: Break[] = []
  const openLedger: LedgerLine[] = []
  const openBank: StatementLine[] = []
  for (const l of ledger) {
    const b = bankByKey.get(key(l.reference, l.amountCents))
    if (b) {
      usedBank.add(b)
      if (b.amountCents === l.amountCents) matched.push({ ledger: l, bank: b })
      else breaks.push({ kind: "amount_mismatch", reference: l.reference, loanId: l.loanId, ledger: l, bank: b, differenceCents: b.amountCents - l.amountCents, action: "Amounts differ: check the collection file and the bank's record, then correct with a reversing entry." })
      continue
    }
    openLedger.push(l)
    const lb = later.get(key(l.reference, l.amountCents))
    breaks.push(
      lb
        ? { kind: "timing_difference", reference: l.reference, loanId: l.loanId, ledger: l, bank: lb, differenceCents: -l.amountCents, action: `Timing difference: in the ledger on ${l.date}, at the bank on ${lb.date}. No action; it clears next period.` }
        : { kind: "missing_from_bank", reference: l.reference, loanId: l.loanId, ledger: l, differenceCents: -l.amountCents, action: "In the ledger but not at the bank: investigate before month-end close." },
    )
  }
  for (const b of bank) {
    if (usedBank.has(b)) continue
    openBank.push(b)
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
  return { matched, breaks, openLedger, openBank }
}

/**
 * Reconciles the month ending at `cutoff` (a month-end). Each earlier month
 * is reconciled in turn so that whatever it left unresolved is carried in.
 */
export function reconcile(book: BookResult, cutoff: string, statement: StatementLine[] = bankStatement(book)): ReconciliationReport {
  const ledger = ledgerLines(book)
  const first = [...ledger.map((l) => l.date), ...statement.map((l) => l.date)].sort()[0] ?? cutoff
  const ends = monthEnds(first.slice(0, 8) + "01", cutoff)
  if (ends.at(-1) !== cutoff) ends.push(cutoff)
  let openLedger: LedgerLine[] = []
  let openBank: StatementLine[] = []
  let start = "0000-01-01"
  let result: ReturnType<typeof matchPeriod> & { compared: number; ledgerTotal: number; bankTotal: number } = { matched: [], breaks: [], openLedger: [], openBank: [], compared: 0, ledgerTotal: 0, bankTotal: 0 }
  for (const end of ends) {
    const L = [...openLedger, ...ledger.filter((l) => l.date >= start && l.date <= end)]
    const B = [...openBank, ...statement.filter((l) => l.date >= start && l.date <= end)]
    const r = matchPeriod(L, B, statement.filter((l) => l.date > end))
    result = { ...r, compared: L.length + B.length, ledgerTotal: L.reduce((t, l) => t + l.amountCents, 0), bankTotal: B.reduce((t, l) => t + l.amountCents, 0) }
    openLedger = r.openLedger
    openBank = r.openBank
    start = new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  }
  return {
    institutionId: book.institutionId,
    cutoff,
    matched: result.matched,
    breaks: result.breaks,
    matchRate: result.compared ? Math.round(((result.matched.length * 2) / result.compared) * 1000) / 1000 : 1,
    linesCompared: result.compared,
    ledgerTotalCents: result.ledgerTotal,
    bankTotalCents: result.bankTotal,
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
