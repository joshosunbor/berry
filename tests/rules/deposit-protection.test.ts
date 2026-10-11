import { describe, expect, it } from "vitest"
import { LENDER_PROTECTION, PROVINCIAL_INSURERS } from "@/lib/rules/deposit-protection"

describe("deposit protection", () => {
  it("covers every province plus the territories", () => {
    expect(PROVINCIAL_INSURERS.filter((p) => p.province !== "Territories")).toHaveLength(10)
  })
  it("marks exactly the unconfirmed rows, each with a reason", () => {
    const unconfirmed = PROVINCIAL_INSURERS.filter((p) => !p.confirmed).map((p) => p.province).sort()
    expect(unconfirmed).toEqual(["British Columbia", "Ontario", "Quebec", "Territories"])
    for (const p of PROVINCIAL_INSURERS.filter((x) => !x.confirmed)) expect(p.note).toBeTruthy()
  })
  it("cites an https source for every row", () => {
    for (const p of PROVINCIAL_INSURERS) expect(p.source).toMatch(/^https:\/\//)
  })
  it("never places Northgate in a province", () => {
    const text = LENDER_PROTECTION.credit_union
    for (const p of PROVINCIAL_INSURERS) expect(text).not.toContain(p.province)
    expect(text).toContain("coverage depends on its province")
  })
})
