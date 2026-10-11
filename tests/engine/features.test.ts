import { describe, expect, it } from "vitest"
import { computeFeatures, debtServiceCoverage } from "@/lib/engine/features"
import { buildLedgerView } from "@/lib/engine/ledger-view"
import { input, monthlyCredits, pay, spend } from "./fixtures"

const sixMonths = (amount: number) => monthlyCredits(Array(6).fill(amount))

describe("ledger view", () => {
  it("drops transfers between the applicant's own accounts, both legs", () => {
    const accounts = [
      { accountId: "acc_t-chq", accountType: "CHECKING" as const, provider: "other" as const, institutionType: "bank" as const, nickname: "C", openedDate: "2020-01-01", currency: "CAD" as const, openingBalanceCents: 0 },
      { accountId: "acc_t-sav", accountType: "SAVINGS" as const, provider: "other" as const, institutionType: "bank" as const, nickname: "S", openedDate: "2020-01-01", currency: "CAD" as const, openingBalanceCents: 0 },
    ]
    const view = buildLedgerView(
      input(
        [
          pay("2026-01-15", 300_000),
          spend("2026-01-20", 50_000, "TRANSFER_OUT", { channel: "INTERNAL" }),
          { ...pay("2026-01-20", 50_000, "TRANSFER_IN"), accountId: "acc_t-sav", channel: "INTERNAL" },
        ],
        { accounts },
      ),
    )
    expect(view.cashFlow).toHaveLength(1)
    expect(view.months[0].outflowCents).toBe(0)
  })

  it("keeps an unmatched transfer out (e.g. an owner draw) as a real outflow", () => {
    const view = buildLedgerView(input([pay("2026-01-15", 300_000), spend("2026-01-20", 50_000, "TRANSFER_OUT", { channel: "INTERNAL" })]))
    expect(view.months[0].outflowCents).toBe(50_000)
  })

  it("cancels a returned debit against its reversal but keeps the NSF fee", () => {
    const view = buildLedgerView(
      input([
        pay("2026-01-02", 300_000),
        { ...spend("2026-01-15", 40_000, "LOAN_PAYMENT", { channel: "PAD" }), transactionId: "txn_t-orig" },
        { ...pay("2026-01-15", 40_000, "PAYMENT_REVERSAL"), returnOf: { transactionId: "txn_t-orig", reasonCode: "901" } },
        spend("2026-01-15", 1_000, "NSF_FEE"),
      ]),
    )
    expect(view.returns).toHaveLength(1)
    expect(view.months[0].outflowCents).toBe(1_000)
    expect(view.months[0].inflowCents).toBe(300_000)
  })

  it("includes empty months in the window", () => {
    const view = buildLedgerView(input([pay("2026-03-15", 100_000)]))
    expect(view.months.map((m) => m.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"])
  })
})

describe("features", () => {
  it("averages income, outflow and net per month", () => {
    const f = computeFeatures(input([...sixMonths(400_000), ...Array.from({ length: 6 }, (_, i) => spend(`2026-0${i + 1}-20`, 300_000))]))
    expect(f.avgMonthlyIncomeCents).toBe(400_000)
    expect(f.avgMonthlyOutflowCents).toBe(300_000)
    expect(f.avgMonthlyNetCents).toBe(100_000)
    expect(f.annualNetCents).toBe(1_200_000)
    expect(f.incomeCv).toBe(0)
  })

  it("uses the median month so one big month can't lift it", () => {
    const f = computeFeatures(input(monthlyCredits([100_000, 100_000, 100_000, 100_000, 100_000, 2_000_000])))
    expect(f.medianMonthlyNetCents).toBe(100_000)
    expect(f.avgMonthlyNetCents).toBeGreaterThan(400_000)
  })

  it("measures income volatility (CV) and trend", () => {
    const f = computeFeatures(input(monthlyCredits([100_000, 100_000, 100_000, 200_000, 200_000, 200_000])))
    expect(f.incomeCv).toBe(0.33)
    expect(f.incomeTrend).toBe(1)
  })

  it("leaves trend empty with under 6 months of history", () => {
    const f = computeFeatures(input([pay("2026-05-15", 100_000)], { generated: { seed: 1, windowStart: "2026-03-01", windowEnd: "2026-06-30", generatorVersion: "t" } }))
    expect(f.windowMonths).toBe(4)
    expect(f.incomeTrend).toBeNull()
  })

  it("counts NSF returns in the last 90 days and 12 months", () => {
    const ret = (date: string, i: number) => ({ ...pay(date, 10_000, "PAYMENT_REVERSAL"), returnOf: { transactionId: `txn_t-x${i}`, reasonCode: "901" } })
    const f = computeFeatures(
      input([ret("2026-01-10", 1), ret("2026-04-20", 2), ret("2026-06-01", 3), { ...ret("2026-06-02", 4), returnOf: { transactionId: "txn_t-x4", reasonCode: "905" } }]),
    )
    expect(f.nsf90).toBe(2)
    expect(f.nsf12m).toBe(3)
    expect(f.returns12m).toBe(4)
  })

  it("detects recurring loan payments to the same payee in 3+ months", () => {
    const loan = (m: number) => spend(`2026-0${m}-15`, 41_237, "LOAN_PAYMENT", { merchant: "Autoline Finance", channel: "PAD" })
    const oneOff = spend("2026-02-03", 90_000, "LOAN_PAYMENT", { merchant: "One-off Lender" })
    const f = computeFeatures(input([...sixMonths(400_000), loan(1), loan(2), loan(3), loan(4), oneOff]))
    expect(f.recurringDebts).toEqual([{ payee: "Autoline Finance", monthlyCents: 41_237, months: 4 }])
    expect(f.existingDebtMonthlyCents).toBe(41_237)
  })

  it("computes days of cash on hand from average balance and daily outflow", () => {
    // Balance holds at $1,000 (in and out on the same day); outflow is $304/month, $10/day.
    const f = computeFeatures(input(Array.from({ length: 6 }, (_, i) => [pay(`2026-0${i + 1}-28`, 30_400), spend(`2026-0${i + 1}-28`, 30_400)]).flat()))
    expect(f.daysCashOnHand).toBe(100)
  })

  it("measures shared card utilization and balance change", () => {
    const accounts = [
      { accountId: "acc_t-chq", accountType: "CHECKING" as const, provider: "other" as const, institutionType: "bank" as const, nickname: "C", openedDate: "2020-01-01", currency: "CAD" as const, openingBalanceCents: 100_000 },
      { accountId: "acc_t-card", accountType: "CREDIT_CARD" as const, provider: "other" as const, institutionType: "bank" as const, nickname: "Card", openedDate: "2020-01-01", currency: "CAD" as const, openingBalanceCents: 400_000, creditLimitCents: 1_000_000 },
    ]
    const f = computeFeatures(input([{ ...spend("2026-02-01", 200_000, "SHOPPING"), accountId: "acc_t-card" }], { accounts }))
    expect(f.creditUtilization).toBe(0.6)
    expect(f.creditBalanceChangeCents).toBe(200_000)
  })

  it("reads relationship depth only from the membership record", () => {
    const f = computeFeatures(
      input(sixMonths(300_000), { relationship: { institutionId: "northgate", memberSince: "2021-06-30", productsHeld: ["chequing", "savings", "tfsa"] } }),
    )
    expect(f.relationship.member).toBe(true)
    expect(f.relationship.tenureYears).toBe(5)
    expect(f.relationship.productsHeld).toBe(3)
  })
})

describe("debt service coverage", () => {
  it("adds back existing payments that net cash flow already paid", () => {
    // $1,000 net after a $400 loan payment → $1,400 available for $400 + $300.
    expect(debtServiceCoverage({ avgMonthlyNetCents: 100_000, existingDebtMonthlyCents: 40_000 }, 30_000)).toBe(2)
  })
  it("is infinite with no debt service", () => {
    expect(debtServiceCoverage({ avgMonthlyNetCents: 100_000, existingDebtMonthlyCents: 0 }, 0)).toBe(Infinity)
  })
})
