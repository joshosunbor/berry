import type { Account, EngineInput, Transaction } from "@/lib/schemas"
import { CONFIGS } from "@/lib/engine/config"
import { computeFeatures, type Features } from "@/lib/engine/features"
import type { ModeContext } from "@/lib/engine/types"
import type { Mode } from "@/lib/modes"
import type { IncomePattern } from "@/lib/engine/patterns"

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


const BASE_PATTERN: IncomePattern = {
  type: "salaried",
  peakMonths: [1, 2, 3],
  peakShare: 0.25,
  quietMonths: [],
  payroll: { cadenceDays: 14, lastPayDate: "2026-06-26", nextExpectedDate: "2026-07-10", typicalNetCents: 200_000 },
  depositsPerMonth: 2.2,
  avgDepositCents: 200_000,
  sources: { PAYROLL: 1 },
}

/** Healthy baseline features (12 months, salaried, $1,500/month net), with overrides. */
export function features(over: Omit<Partial<Features>, "income"> & { income?: Partial<IncomePattern> } = {}): Features {
  const { income, ...rest } = over
  return {
    asOf: "2026-09-30",
    windowMonths: 12,
    avgMonthlyIncomeCents: 450_000,
    avgMonthlyInflowCents: 450_000,
    avgMonthlyOutflowCents: 300_000,
    avgMonthlyNetCents: 150_000,
    medianMonthlyNetCents: 150_000,
    annualNetCents: 1_800_000,
    incomeCv: 0.1,
    incomeTrend: 0,
    avgDailyBalanceCents: 300_000,
    daysCashOnHand: 30,
    nsf90: 0,
    nsf12m: 0,
    returns12m: 0,
    recurringDebts: [],
    existingDebtMonthlyCents: 0,
    creditUtilization: null,
    creditBalanceChangeCents: null,
    creditHistoryMonths: 96,
    foreignReportAvailable: false,
    relationship: { member: false, tenureYears: 0, productsHeld: 0, avgBalanceAtNorthgateCents: 0 },
    monthly: [],
    ...rest,
    income: { ...BASE_PATTERN, ...income },
  }
}

/** A mode context: request overrides go on the input; features are given directly. */
export function ctx(mode: Mode, f: Features, request: Partial<EngineInput["request"]> = {}, kind: EngineInput["kind"] = "personal"): ModeContext {
  const base = input([])
  return {
    input: { ...base, kind, request: { ...base.request, ...request } },
    features: f,
    config: CONFIGS[mode],
  }
}

export { computeFeatures }
