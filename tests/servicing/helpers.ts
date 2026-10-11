import { expect } from "vitest"
import type { Ledger } from "@/lib/servicing/ledger"

/**
 * Asserts the ledger is in balance: every entry's debits equal its
 * credits, the trial balance does too, and every amount is whole cents.
 * Every test that moves money calls this.
 */
export function expectBalanced(ledger: Ledger) {
  for (const e of ledger.all) {
    const debits = e.lines.reduce((s, l) => s + l.debitCents, 0)
    const credits = e.lines.reduce((s, l) => s + l.creditCents, 0)
    expect(debits, `${e.id} ${e.memo}`).toBe(credits)
    for (const l of e.lines) {
      expect(Number.isInteger(l.debitCents) && Number.isInteger(l.creditCents), `${e.id} has fractional cents`).toBe(true)
    }
  }
  const tb = ledger.trialBalance()
  expect(tb.debitCents).toBe(tb.creditCents)
  expect(Object.values(tb.accounts).reduce((s, v) => s + v, 0)).toBe(0)
}
