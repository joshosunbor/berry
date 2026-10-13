import { describe, expect, it } from "vitest"
import { getBooks } from "@/lib/data"
import { MODES } from "@/lib/modes"
import { postCollectionSent, postCollectionSettled } from "@/lib/servicing/ledger"
import { bankStatement, monthEnds, reconcile } from "@/lib/servicing/reconcile"
import { simulateBook } from "@/lib/servicing/simulate"
import { expectBalanced } from "./helpers"

const books = getBooks()
const cu = books.credit_union

describe("reconciliation is independent of the ledger", () => {
  it("catches an error in the ledger: the bank statement comes from what the bank saw, not the ledger", () => {
    const book = simulateBook("northgate", "credit_union", books.credit_union.loans.map((l) => l.setup), books.credit_union.horizon)
    // A collection posted to the ledger that never happened at the bank.
    const fake = { collectionId: "col_ghost-a1", principalCents: 10_000, interestCents: 0 }
    postCollectionSent(book.ledger, "loan_grace-cu", fake, "2028-01-05")
    postCollectionSettled(book.ledger, "loan_grace-cu", fake, "2028-01-06")
    const r = reconcile(book, "2028-01-31")
    expect(r.breaks.map((b) => [b.kind, b.reference])).toContainEqual(["missing_from_bank", "col_ghost-a1"])
  })

  it("reconciles each month on its own: only that month's lines match, unresolved items carry forward", () => {
    const feb = reconcile(cu, "2027-02-28")
    expect(feb.matched.length).toBeGreaterThan(0)
    for (const m of feb.matched) expect(m.bank.date >= "2027-02-01", m.ledger.reference).toBe(true)
    // The unapplied return from January is still open at the end of February.
    expect(feb.breaks.map((b) => b.kind)).toContain("returned_pad_not_applied")
  })
})

describe("reconciliation", () => {
  it("surfaces both planted breaks at the January cut-off instead of matching everything", () => {
    const r = reconcile(cu, "2027-01-31")
    expect(r.breaks.map((b) => b.kind).sort()).toEqual(["returned_pad_not_applied", "timing_difference"])
    expect(r.matchRate).toBeLessThan(1)
    expect(r.matched.length).toBeGreaterThan(10) // January's own movements only
    expectBalanced(cu.ledger)
  })

  it("the returned PAD: at the bank, missing from the loan, with an action to apply it", () => {
    const b = reconcile(cu, "2027-01-31").breaks.find((x) => x.kind === "returned_pad_not_applied")!
    expect(b.loanId).toBe("loan_fennick-hardware-cu")
    expect(b.bank!.amountCents).toBeLessThan(0)
    expect(b.bank!.description).toMatch(/901/)
    expect(b.ledger).toBeUndefined()
    expect(b.action).toMatch(/Apply the return to the loan/)
    // The ledger still shows that debit as collected: no return was ever posted for it.
    expect(cu.ledger.forLoan("loan_fennick-hardware-cu").some((e) => e.type.startsWith("return"))).toBe(false)
    expectBalanced(cu.ledger)
  })

  it("the timing difference: in the ledger on the last business day, at the bank the next, and it clears in February", () => {
    const jan = reconcile(cu, "2027-01-31").breaks.find((x) => x.kind === "timing_difference")!
    expect(jan.ledger!.date).toBe("2027-01-29")
    expect(jan.bank!.date).toBe("2027-02-01")
    const feb = reconcile(cu, "2027-02-28")
    expect(feb.breaks.some((x) => x.kind === "timing_difference")).toBe(false)
    expect(feb.matched.some((m) => m.ledger.reference === jan.reference)).toBe(true)
    expectBalanced(cu.ledger)
  })

  it("the returned PAD stays open until someone applies it", () => {
    for (const cut of monthEnds("2027-01-01", "2027-09-30")) {
      expect(reconcile(cu, cut).breaks.some((b) => b.kind === "returned_pad_not_applied"), cut).toBe(true)
    }
  })

  it("everything else matches: no breaks before January, and none in the other lenders' books", () => {
    for (const cut of monthEnds("2026-10-01", "2026-12-31")) expect(reconcile(cu, cut).breaks, cut).toEqual([])
    for (const m of MODES.filter((x) => x !== "credit_union")) {
      for (const cut of monthEnds("2026-10-01", "2027-09-30")) expect(reconcile(books[m], cut).breaks, `${m} ${cut}`).toEqual([])
      expectBalanced(books[m].ledger)
    }
  })

  it("matched lines agree on amount, and the difference between ledger and bank totals is exactly the breaks", () => {
    const r = reconcile(cu, "2027-01-31")
    for (const m of r.matched) expect(m.bank.amountCents).toBe(m.ledger.amountCents)
    const breakDiff = r.breaks.reduce((t, b) => t + b.differenceCents, 0)
    expect(r.bankTotalCents - r.ledgerTotalCents).toBe(breakDiff)
    expectBalanced(cu.ledger)
  })

  it("the bank statement is whole cents and in date order", () => {
    const s = bankStatement(cu)
    for (const l of s) expect(Number.isInteger(l.amountCents)).toBe(true)
    expect([...s].sort((a, b) => a.date.localeCompare(b.date)).map((l) => l.date)).toEqual(s.map((l) => l.date))
  })
})
