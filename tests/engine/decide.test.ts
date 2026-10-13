import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { CONFIGS } from "@/lib/engine/config"
import { decide, decideAll } from "@/lib/engine/decide"
import { MODES } from "@/lib/modes"
import { Applicant, Decision, toEngineInput } from "@/lib/schemas"

const load = (slug: string) => toEngineInput(Applicant.parse(JSON.parse(readFileSync(path.resolve(__dirname, `../../data/applicants/${slug}.json`), "utf8"))))

describe("foreign credit reports", () => {
  const planted = (id: string) => toEngineInput(Applicant.parse(JSON.parse(readFileSync(path.resolve(__dirname, `../../data/planted/planted-${id}.json`), "utf8"))))
  const withReport = (band: "fair" | "good" | "excellent") => {
    const p = planted("p21")
    return { ...p, creditFile: { ...p.creditFile, foreignReport: { available: true, band } } }
  }

  it("count as credit history only when the report is good or better", () => {
    expect(decide(withReport("good"), "bank").outcome).not.toBe("decline")
    const fair = decide(withReport("fair"), "bank")
    expect(fair.outcome).toBe("decline")
    expect(fair.reasons.map((r) => r.code)).toContain("SHORT_CREDIT_HISTORY")
  })

  it("the 'what it ignores' panel says how report availability can track nationality", async () => {
    const { FOREIGN_REPORT_NOTE } = await import("@/lib/feature-display")
    expect(FOREIGN_REPORT_NOTE).toMatch(/country/i)
    expect(FOREIGN_REPORT_NOTE).toMatch(/never the country/i)
  })
})

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
    // Fennick banks only with Northgate, so only Northgate is the reporting entity.
    const all = decideAll(load("fennick-hardware"))
    expect(all.credit_union.flags).toHaveLength(1)
    expect(all.credit_union.flags[0].creditFactor).toBe(false)
    expect(all.fintech.flags).toHaveLength(0)
    expect(all.bank.flags).toHaveLength(0)
  })

  it("never lets a FINTRAC flag change the credit decision", () => {
    const input = load("fennick-hardware")
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
