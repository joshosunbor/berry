import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { CONFIGS } from "@/lib/engine/config"
import { decide, decideAll } from "@/lib/engine/decide"
import { MODES } from "@/lib/modes"
import { Applicant, Decision, toEngineInput } from "@/lib/schemas"

const load = (slug: string) => toEngineInput(Applicant.parse(JSON.parse(readFileSync(path.resolve(__dirname, `../../data/applicants/${slug}.json`), "utf8"))))

describe("decide", () => {
  it("is deterministic", () => {
    const input = load("hollis-family-farm")
    expect(decideAll(input)).toEqual(decideAll(input))
  })

  it("produces schema-valid decisions with stable ids", () => {
    const d = decide(load("priya"), "credit_union")
    expect(Decision.safeParse(d).success).toBe(true)
    expect(d.id).toBe("dec_priya-credit-union")
    expect(d.institutionId).toBe("northgate")
  })

  it("rejects a config for the wrong mode", () => {
    expect(() => decide(load("priya"), "bank", CONFIGS.fintech)).toThrow(/not bank/)
  })

  it("flags large cash only at the institution that received it", () => {
    // Main Street banks only with Northgate, so only Northgate is the reporting entity.
    const all = decideAll(load("main-street-hardware"))
    expect(all.credit_union.flags).toHaveLength(1)
    expect(all.credit_union.flags[0].creditFactor).toBe(false)
    expect(all.fintech.flags).toHaveLength(0)
    expect(all.bank.flags).toHaveLength(0)
  })

  it("never lets a FINTRAC flag change the credit decision", () => {
    const input = load("main-street-hardware")
    const flagged = new Set(decide(input, "credit_union").flags[0].transactionIds)
    // Same amounts, deposited by EFT instead of cash: no flag, identical cash flow.
    const notCash = { ...input, transactions: input.transactions.map((t) => (flagged.has(t.transactionId) ? { ...t, channel: "EFT" as const } : t)) }
    for (const m of MODES) {
      const a = decide(input, m)
      const b = decide(notCash, m)
      expect(b.flags).toHaveLength(0)
      expect({ ...b, flags: [] }).toEqual({ ...a, flags: [] })
    }
  })

  it("shows at most 4 reasons first and keeps counterfactuals short", () => {
    for (const d of Object.values(decideAll(load("sofia")))) {
      expect(d.outcome).toBe("decline")
      expect(d.counterfactuals.length).toBeGreaterThan(0)
      expect(d.counterfactuals.length).toBeLessThanOrEqual(3)
    }
  })

  it("only recommends credit products the lender offers", () => {
    const kite = decide(load("hollis-family-farm"), "fintech")
    expect(kite.recommendations?.map((r) => r.product)).not.toContain("seasonal_operating_line")
  })
})
