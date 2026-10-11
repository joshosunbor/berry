import { describe, expect, it } from "vitest"
import { counterfactuals, explain } from "@/lib/engine/explain"
import { REASONS, type ReasonHit, type ReasonKey } from "@/lib/engine/reasons"

// Evidence that answers any key: numbers by default, months and labels where text is expected.
const evidence = new Proxy({} as Record<string, number | string>, {
  get: (_t, key: string) => (key === "peakMonths" ? "9,10,11" : key === "incomeType" ? "gig" : key === "basis" ? "coverage" : 3),
})
const codes = Object.keys(REASONS) as ReasonKey[]

describe("reason catalogue", () => {
  it.each(codes)("%s renders both registers cleanly", (code) => {
    const def = REASONS[code]
    for (const text of [def.customer(evidence), def.lender(evidence)]) {
      expect(text.length).toBeGreaterThan(10)
      expect(text).not.toMatch(/undefined|NaN|\[object|\$\{/)
    }
  })

  it.each(codes)("%s customer text avoids lender jargon", (code) => {
    expect(REASONS[code].customer(evidence)).not.toMatch(/\b(CV|DSCR|NSF|utilization|bureau|tier)\b/i)
  })

  it("gives every decline-driving reason a 'what would change this' line", () => {
    for (const code of ["RECENT_NSF", "NSF_HISTORY", "LOW_COVERAGE", "INCOME_TOO_VARIABLE", "SHORT_ACCOUNT_HISTORY", "SHORT_CREDIT_HISTORY", "HIGH_CARD_UTILIZATION", "NEGATIVE_TYPICAL_MONTH", "INCOME_NEEDS_DOCUMENTS"] as ReasonKey[]) {
      expect("counterfactual" in REASONS[code], code).toBe(true)
    }
  })
})

describe("ranking", () => {
  const hits: ReasonHit[] = [
    { code: "STABLE_PAYROLL", weight: 0.6, evidence },
    { code: "RECENT_NSF", weight: 1, evidence },
    { code: "STRONG_COVERAGE", weight: 0.7, evidence },
    { code: "LIMIT_REDUCED", weight: 0.9, evidence },
  ]

  it("leads a decline with what held it back", () => {
    expect(explain("decline", hits)[0].code).toBe("RECENT_NSF")
  })
  it("leads a full approval with strengths", () => {
    expect(explain("approve", hits).map((r) => r.code).slice(0, 2)).toEqual(["STRONG_COVERAGE", "STABLE_PAYROLL"])
  })
  it("ranks a reduced approval by weight alone", () => {
    expect(explain("approve", hits, true).map((r) => r.code)).toEqual(["RECENT_NSF", "LIMIT_REDUCED", "STRONG_COVERAGE", "STABLE_PAYROLL"])
  })
  it("never repeats a code", () => {
    expect(explain("approve", [...hits, ...hits])).toHaveLength(4)
  })
  it("orders counterfactuals by importance, without duplicates, max 3", () => {
    const cf = counterfactuals([...hits, { code: "SHORT_ACCOUNT_HISTORY", weight: 0.5, evidence }, { code: "NSF_HISTORY", weight: 0.4, evidence }, { code: "RECENT_NSF", weight: 1, evidence }])
    expect(cf).toHaveLength(3)
    expect(cf[0]).toMatch(/90 days/)
    expect(new Set(cf).size).toBe(cf.length)
  })
})
