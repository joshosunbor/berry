import { describe, expect, it } from "vitest"
import { getApplicant } from "@/lib/data"

describe("the sample AFT file pays out what the loan actually pays out", () => {
  it("a drawn line: one credit per planned draw, on its date, not the whole limit", () => {
    const v = getApplicant("hollis-family-farm")!
    const plan = v.pad.credit_union!
    const file = v.aft.credit_union!
    expect("records" in file).toBe(true)
    if (!("records" in file)) return
    const draws = plan.draws!
    expect(draws.length).toBeGreaterThan(0)
    expect(file.totalCents).toBe(draws.reduce((t, d) => t + d.amountCents, 0))
    expect(file.totalCents).toBeLessThan(v.decisions.credit_union.limitCents)
    expect(file.records.filter((r) => r.type === "C")).toHaveLength(draws.length)
    expect(file.note).toMatch(/each draw/i)
  })

  it("a card limit: no AFT file, and it says why", () => {
    const v = getApplicant("amara")!
    expect(v.decisions.fintech.product).toBe("credit_card")
    const file = v.aft.fintech!
    expect("records" in file).toBe(false)
    expect(file).toMatchObject({ none: true })
    if ("none" in file) expect(file.reason).toMatch(/card/i)
  })

  it("a term loan: one credit for the amount lent", () => {
    const v = getApplicant("priya")!
    const file = v.aft.credit_union!
    if (!("records" in file)) throw new Error("expected a file")
    expect(file.totalCents).toBe(v.decisions.credit_union.limitCents)
  })
})
