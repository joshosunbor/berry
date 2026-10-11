import { describe, expect, it } from "vitest"
import { amortizedPaymentCents, interestOnlyCents, maxPrincipalCents, revolvingAssessedPaymentCents, roundDownCents } from "@/lib/engine/payment"

describe("payment maths", () => {
  it("matches a known amortization: $10,000 at 12% over 12 months is $888.49", () => {
    expect(amortizedPaymentCents(1_000_000, 1200, 12)).toBe(88_849)
  })
  it("matches a known amortization: $200,000 at 6% over 30 years is $1,199.10 (rounded up: $1,199.11)", () => {
    expect(amortizedPaymentCents(20_000_000, 600, 360)).toBe(119_911)
  })
  it("handles a zero rate", () => {
    expect(amortizedPaymentCents(120_000, 0, 12)).toBe(10_000)
  })
  it("inverts: the max principal for a payment repays no more than that payment", () => {
    const p = maxPrincipalCents(50_000, 999, 36)
    expect(amortizedPaymentCents(p, 999, 36)).toBeLessThanOrEqual(50_000)
    expect(amortizedPaymentCents(p + 100, 999, 36)).toBeGreaterThan(50_000)
  })
  it("assesses revolving credit at 3% of the limit and interest-only lines monthly", () => {
    expect(revolvingAssessedPaymentCents(300_000)).toBe(9_000)
    expect(interestOnlyCents(6_000_000, 795)).toBe(39_750)
  })
  it("rounds down to whole steps, never below zero", () => {
    expect(roundDownCents(849_999, 100_000)).toBe(800_000)
    expect(roundDownCents(-5, 100)).toBe(0)
  })
  it("always returns integer cents", () => {
    for (const [p, r, n] of [[1_234_567, 899, 48], [99_999, 1999, 7]]) {
      expect(Number.isInteger(amortizedPaymentCents(p, r, n))).toBe(true)
      expect(Number.isInteger(maxPrincipalCents(p, r, n))).toBe(true)
    }
  })
})
