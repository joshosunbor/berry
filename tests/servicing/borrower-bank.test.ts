import { describe, expect, it } from "vitest"
import { borrowerNsfFee, PROVINCIAL_CU_LABEL } from "@/lib/servicing/borrower-bank"
import { SERVICING } from "@/lib/servicing/config"

const input = { date: "2026-12-01", shortfallCents: 30_000, priorFeeDates: [] as string[] }

describe("borrower's bank NSF fee", () => {
  it("applies the federal NSF fee rules to personal accounts at banks: capped at $10", () => {
    expect(borrowerNsfFee({ institutionType: "bank", kind: "personal" }, input)).toMatchObject({ feeCents: 1_000, rule: "capped" })
  })

  it("uses the illustrative config fee at a credit union, labelled as such", () => {
    const fee = borrowerNsfFee({ institutionType: "credit_union", kind: "personal" }, input)
    expect(fee.feeCents).toBe(SERVICING.borrowerBank.provincialCreditUnionNsfFeeCents)
    expect(fee.rule).toBe("provincially_regulated")
    expect(fee.label).toBe("provincially regulated — fee illustrative")
    expect(PROVINCIAL_CU_LABEL).toBe("provincially regulated — fee illustrative")
  })

  it("doesn't apply the bank rules to credit unions even inside the 2-day window", () => {
    const fee = borrowerNsfFee({ institutionType: "credit_union", kind: "personal" }, { ...input, priorFeeDates: ["2026-12-01"] })
    expect(fee.rule).toBe("provincially_regulated")
  })

  it("charges business accounts at banks the standard fee (outside the personal-account rules)", () => {
    expect(borrowerNsfFee({ institutionType: "bank", kind: "business" }, input)).toMatchObject({ feeCents: SERVICING.borrowerBank.standardNsfFeeCents, rule: "not_regulated" })
  })

  it("at a bank, a second NSF within 2 business days carries no fee", () => {
    expect(borrowerNsfFee({ institutionType: "bank", kind: "personal" }, { ...input, priorFeeDates: ["2026-11-30"] }).feeCents).toBe(0)
  })
})
