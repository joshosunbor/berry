import { describe, expect, it } from "vitest"
import {
  account,
  applyPayment,
  Ledger,
  postChargeOff,
  postCollectionSent,
  postCollectionSettled,
  postDisbursement,
  postInterestAccrual,
  postReturn,
} from "@/lib/servicing/ledger"
import { expectBalanced } from "./helpers"

const LOAN = "loan_t-cu"

function funded(amount = 1_000_000) {
  const l = new Ledger("northgate")
  postDisbursement(l, LOAN, amount, "2026-10-06", "AFT")
  return l
}

describe("double-entry ledger", () => {
  it("funding: loan receivable up, settlement account down, in balance", () => {
    const l = funded()
    expect(l.balance(account.principal(LOAN))).toBe(1_000_000)
    expect(l.balance(account.settlement("northgate"))).toBe(-1_000_000)
    expectBalanced(l)
  })

  it("rejects an entry whose debits don't equal its credits", () => {
    const l = funded()
    expect(() =>
      l.post({ type: "disbursement", date: "2026-10-07", memo: "bad", lines: [{ account: account.principal(LOAN), debitCents: 100 }, { account: account.settlement("northgate"), creditCents: 99 }] }),
    ).toThrow(/debits must equal credits/)
    expectBalanced(l)
  })

  it("rejects fractional cents, negative amounts and one-line entries", () => {
    const l = funded()
    const two = (d: number, c: number) => [{ account: account.principal(LOAN), debitCents: d }, { account: account.settlement("northgate"), creditCents: c }]
    expect(() => l.post({ type: "disbursement", date: "2026-10-07", memo: "x", lines: two(10.5, 10.5) })).toThrow()
    expect(() => l.post({ type: "disbursement", date: "2026-10-07", memo: "x", lines: two(-5, -5) })).toThrow()
    expect(() => l.post({ type: "disbursement", date: "2026-10-07", memo: "x", lines: [{ account: account.principal(LOAN), debitCents: 0 }] })).toThrow()
    expectBalanced(l)
  })

  it("is append-only: posted entries can't be changed", () => {
    const l = funded()
    const e = l.all[0]
    expect(() => {
      ;(e.lines[0] as { debitCents: number }).debitCents = 1
    }).toThrow()
    expect(() => (l.all as unknown as unknown[]).push({})).toThrow()
    expect(l.all[0].lines[0].debitCents).toBe(1_000_000)
    expectBalanced(l)
  })

  it("posts in date order", () => {
    const l = funded()
    expect(() => postInterestAccrual(l, LOAN, 100, "2026-10-01")).toThrow(/date order/)
    expectBalanced(l)
  })

  it("corrects by reversal, never by editing", () => {
    const l = funded()
    const accrual = postInterestAccrual(l, LOAN, 7_500, "2026-11-01")!
    l.reverse(accrual.id, "2026-11-02", "Accrual posted in error")
    expect(l.balance(account.interest(LOAN))).toBe(0)
    expect(l.all.at(-1)!.reversesEntryId).toBe(accrual.id)
    expectBalanced(l)
  })

  it("applies payments to interest first, then principal, in whole cents", () => {
    expect(applyPayment(30_000, 7_499)).toEqual({ interestCents: 7_499, principalCents: 22_501 })
    expect(applyPayment(5_000, 7_499)).toEqual({ interestCents: 5_000, principalCents: 0 })
  })

  it("collection sent then settled: outstanding = funded + accrued − collected", () => {
    const l = funded()
    postInterestAccrual(l, LOAN, 7_500, "2026-11-01")
    const c = { collectionId: "col_t-1", ...applyPayment(30_000, 7_500) }
    postCollectionSent(l, LOAN, c, "2026-11-02")
    expect(l.balance(account.clearing("northgate"))).toBe(30_000)
    postCollectionSettled(l, LOAN, c, "2026-11-03")
    expect(l.balance(account.clearing("northgate"))).toBe(0)
    expect(l.outstanding(LOAN)).toBe(1_000_000 + 7_500 - 30_000)
    expect(l.balance(account.interestIncome("northgate"))).toBe(-7_500)
    expectBalanced(l)
  })

  it("a return before settlement reverses clearing", () => {
    const l = funded()
    postInterestAccrual(l, LOAN, 7_500, "2026-11-01")
    const c = { collectionId: "col_t-1", ...applyPayment(30_000, 7_500) }
    postCollectionSent(l, LOAN, c, "2026-11-02")
    const settlementBefore = l.balance(account.settlement("northgate"))
    postReturn(l, LOAN, c, "2026-11-02", "clearing", "ret_t-1", "905")
    expect(l.all.at(-1)!.type).toBe("return_from_clearing")
    expect(l.balance(account.clearing("northgate"))).toBe(0)
    expect(l.balance(account.settlement("northgate"))).toBe(settlementBefore)
    expect(l.outstanding(LOAN)).toBe(1_007_500)
    expectBalanced(l)
  })

  it("a return after settlement takes the money back out of the settlement account", () => {
    const l = funded()
    postInterestAccrual(l, LOAN, 7_500, "2026-11-01")
    const c = { collectionId: "col_t-1", ...applyPayment(30_000, 7_500) }
    postCollectionSent(l, LOAN, c, "2026-11-02")
    postCollectionSettled(l, LOAN, c, "2026-11-03")
    const settlementAfterSettle = l.balance(account.settlement("northgate"))
    postReturn(l, LOAN, c, "2026-11-05", "settled", "ret_t-1", "901")
    expect(l.all.at(-1)!.type).toBe("return_after_settlement")
    expect(l.balance(account.settlement("northgate"))).toBe(settlementAfterSettle - 30_000)
    expect(l.balance(account.clearing("northgate"))).toBe(0)
    expect(l.outstanding(LOAN)).toBe(1_007_500)
    expectBalanced(l)
  })

  it("charge-off moves what's owed to credit loss and leaves nothing receivable", () => {
    const l = funded()
    postInterestAccrual(l, LOAN, 7_500, "2026-11-01")
    postChargeOff(l, LOAN, "2027-03-01", 120)
    expect(l.outstanding(LOAN)).toBe(0)
    expect(l.balance(account.creditLoss("northgate"))).toBe(1_007_500)
    expect(l.all.at(-1)!.memo).toMatch(/120 days past due/)
    expect(() => postChargeOff(l, LOAN, "2027-03-02", 121)).toThrow()
    expectBalanced(l)
  })

  it("keeps several loans separate and the whole book in balance", () => {
    const l = new Ledger("kite")
    postDisbursement(l, "loan_a", 500_000, "2026-10-06", "RTR")
    postDisbursement(l, "loan_b", 250_000, "2026-10-06", "AFT")
    postInterestAccrual(l, "loan_a", 3_333, "2026-11-01")
    expect(l.outstanding("loan_a")).toBe(503_333)
    expect(l.outstanding("loan_b")).toBe(250_000)
    expect(l.forLoan("loan_b")).toHaveLength(1)
    expectBalanced(l)
  })
})
