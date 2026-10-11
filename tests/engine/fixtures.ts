import type { Account, EngineInput, Transaction } from "@/lib/schemas"

/** Minimal engine input for unit tests: one chequing account unless more are given. */
export function input(transactions: Partial<Transaction>[], opts: Partial<EngineInput> & { accounts?: Account[] } = {}): EngineInput {
  const accounts: Account[] = opts.accounts ?? [
    { accountId: "acc_t-chq", accountType: "CHECKING", provider: "other", nickname: "Chequing", openedDate: "2020-01-01", currency: "CAD", openingBalanceCents: 100_000 },
  ]
  return {
    id: "apl_t",
    slug: "t",
    kind: "personal",
    request: { product: "personal_loan", amountCents: 1_000_000, termMonths: 36, purpose: "Test" },
    creditFile: { historyMonths: 60, bureauBand: "good", foreignReport: { available: false } },
    relationship: null,
    business: null,
    generated: { seed: 1, windowStart: "2026-01-01", windowEnd: "2026-06-30", generatorVersion: "test" },
    ...opts,
    accounts,
    transactions: transactions.map((t, i) => txn({ transactionId: `txn_t-${i + 1}`, ...t })),
  }
}

export function txn(t: Partial<Transaction>): Transaction {
  const date = t.postedDate ?? "2026-01-15"
  return {
    transactionId: "txn_t-0",
    accountId: "acc_t-chq",
    postedDate: date,
    transactionTimestamp: `${date}T12:00:00-05:00`,
    amountCents: 10_000,
    debitCreditMemo: "DEBIT",
    description: "Test",
    category: "OTHER_SPENDING",
    channel: "CARD",
    ...t,
  }
}

/** Income credit helper. */
export const pay = (postedDate: string, amountCents: number, category: Transaction["category"] = "PAYROLL"): Partial<Transaction> => ({
  postedDate,
  amountCents,
  debitCreditMemo: "CREDIT",
  category,
  channel: "EFT",
})

/** Spending debit helper. */
export const spend = (postedDate: string, amountCents: number, category: Transaction["category"] = "OTHER_SPENDING", extra: Partial<Transaction> = {}): Partial<Transaction> => ({
  postedDate,
  amountCents,
  debitCreditMemo: "DEBIT",
  category,
  ...extra,
})

/** One credit per month on `day`, for every month from Jan to Jun 2026. */
export function monthlyCredits(amounts: number[], day = 15, category: Transaction["category"] = "PAYROLL"): Partial<Transaction>[] {
  return amounts.map((a, i) => pay(`2026-${String(i + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`, a, category))
}
