import type { Account, EngineInput, Transaction, TransactionCategory } from "@/lib/schemas"

/*
 * A cleaned view of an applicant's transactions, shared by every feature:
 * - only deposit accounts count toward cash flow (cards are tracked separately)
 * - transfers between the applicant's own accounts are dropped (both legs)
 * - a returned debit and its reversal cancel out and are both dropped; the
 *   NSF fee, if any, stays as a real outflow
 */

export const INCOME_CATEGORIES = new Set<TransactionCategory>([
  "PAYROLL",
  "GIG_INCOME",
  "BUSINESS_REVENUE",
  "CASH_DEPOSIT",
  "GOVERNMENT_BENEFIT",
  "OTHER_INCOME",
])

const DEPOSIT_TYPES = new Set<Account["accountType"]>(["CHECKING", "SAVINGS", "BUSINESS_CHECKING", "BUSINESS_SAVINGS"])
const CREDIT_TYPES = new Set<Account["accountType"]>(["CREDIT_CARD", "LINE_OF_CREDIT"])

export interface MonthTotals {
  /** `YYYY-MM` */
  month: string
  incomeCents: number
  inflowCents: number
  outflowCents: number
  netCents: number
}

export interface CreditAccountView {
  account: Account
  owedStartCents: number
  owedEndCents: number
}

export interface LedgerView {
  windowStart: string
  windowEnd: string
  depositAccounts: Account[]
  /** Cleaned deposit-account transactions, in time order. */
  cashFlow: Transaction[]
  /** Every month in the window, including months with no activity. */
  months: MonthTotals[]
  /** End-of-day total balance across deposit accounts, one entry per day. */
  dailyBalances: { date: string; balanceCents: number }[]
  creditAccounts: CreditAccountView[]
  /** Reversal credits for returned debits (they carry `returnOf`). */
  returns: Transaction[]
}

export function buildLedgerView(input: EngineInput): LedgerView {
  const { windowStart, windowEnd } = input.generated
  const deposit = input.accounts.filter((a) => DEPOSIT_TYPES.has(a.accountType))
  const depositIds = new Set(deposit.map((a) => a.accountId))
  const all = input.transactions.filter((t) => t.postedDate >= windowStart && t.postedDate <= windowEnd)

  const returns = all.filter((t) => t.returnOf)
  const returnedIds = new Set(returns.map((t) => t.returnOf!.transactionId))
  const ownTransfers = findOwnTransfers(all.filter((t) => depositIds.has(t.accountId)))

  const cashFlow = all.filter(
    (t) => depositIds.has(t.accountId) && !t.returnOf && !returnedIds.has(t.transactionId) && !ownTransfers.has(t.transactionId),
  )

  return {
    windowStart,
    windowEnd,
    depositAccounts: deposit,
    cashFlow,
    months: monthTotals(cashFlow, windowStart, windowEnd),
    dailyBalances: dailyBalances(deposit, all, windowStart, windowEnd),
    creditAccounts: input.accounts
      .filter((a) => CREDIT_TYPES.has(a.accountType))
      .map((account) => {
        const txns = all.filter((t) => t.accountId === account.accountId)
        const change = txns.reduce((s, t) => s + (t.debitCreditMemo === "DEBIT" ? t.amountCents : -t.amountCents), 0)
        return { account, owedStartCents: account.openingBalanceCents, owedEndCents: account.openingBalanceCents + change }
      }),
    returns,
  }
}

/**
 * Transfer legs that have a matching opposite leg (same date and amount) in
 * another of the applicant's deposit accounts. Unmatched transfers, such as
 * an owner draw to an outside account, stay as real cash flow.
 */
function findOwnTransfers(txns: Transaction[]): Set<string> {
  const isTransfer = (t: Transaction) => t.category === "TRANSFER_IN" || t.category === "TRANSFER_OUT"
  const outs = txns.filter((t) => isTransfer(t) && t.debitCreditMemo === "DEBIT")
  const ins = txns.filter((t) => isTransfer(t) && t.debitCreditMemo === "CREDIT")
  const matched = new Set<string>()
  for (const o of outs) {
    const i = ins.find(
      (c) => !matched.has(c.transactionId) && c.accountId !== o.accountId && c.postedDate === o.postedDate && c.amountCents === o.amountCents,
    )
    if (i) {
      matched.add(o.transactionId)
      matched.add(i.transactionId)
    }
  }
  return matched
}

function monthKeys(start: string, end: string): string[] {
  const keys: string[] = []
  let y = Number(start.slice(0, 4))
  let m = Number(start.slice(5, 7))
  const last = end.slice(0, 7)
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`
    if (key > last) break
    keys.push(key)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return keys
}

function monthTotals(cashFlow: Transaction[], start: string, end: string): MonthTotals[] {
  const byMonth = new Map(monthKeys(start, end).map((month) => [month, { month, incomeCents: 0, inflowCents: 0, outflowCents: 0, netCents: 0 }]))
  for (const t of cashFlow) {
    const m = byMonth.get(t.postedDate.slice(0, 7))!
    if (t.debitCreditMemo === "CREDIT") {
      m.inflowCents += t.amountCents
      if (INCOME_CATEGORIES.has(t.category)) m.incomeCents += t.amountCents
    } else {
      m.outflowCents += t.amountCents
    }
  }
  for (const m of byMonth.values()) m.netCents = m.inflowCents - m.outflowCents
  return [...byMonth.values()]
}

/** Uses every transaction (including transfers and returns): they all move the real balance. */
export function dailyBalances(deposit: Account[], all: Transaction[], start: string, end: string) {
  const ids = new Set(deposit.map((a) => a.accountId))
  const deltas = new Map<string, number>()
  for (const t of all) {
    if (!ids.has(t.accountId)) continue
    deltas.set(t.postedDate, (deltas.get(t.postedDate) ?? 0) + (t.debitCreditMemo === "CREDIT" ? t.amountCents : -t.amountCents))
  }
  let balance = deposit.reduce((s, a) => s + a.openingBalanceCents, 0)
  const out: { date: string; balanceCents: number }[] = []
  for (let d = new Date(`${start}T00:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10)
    balance += deltas.get(date) ?? 0
    out.push({ date, balanceCents: balance })
  }
  return out
}
