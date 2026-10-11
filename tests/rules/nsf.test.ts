import { describe, expect, it } from "vitest"
import { addBusinessDays, businessDaysBetween, earliestSafeRetry, nsfFee, NSF_RULES } from "@/lib/rules/nsf"

const base = { accountKind: "personal" as const, date: "2026-07-15", shortfallCents: 25_000, bankFeeCents: 4_800, priorFeeDates: [] as string[] }

describe("business days", () => {
  it("skips weekends", () => {
    expect(addBusinessDays("2026-07-17", 1)).toBe("2026-07-20") // Fri → Mon
    expect(addBusinessDays("2026-07-15", 2)).toBe("2026-07-17")
    expect(businessDaysBetween("2026-07-17", "2026-07-20")).toBe(1)
    expect(businessDaysBetween("2026-07-15", "2026-07-15")).toBe(0)
  })
})

describe("NSF fee rules (personal accounts, from 2026-03-12)", () => {
  it("caps the fee at $10", () => {
    expect(nsfFee(base)).toMatchObject({ feeCents: 1_000, rule: "capped" })
  })
  it("charges no fee when overdrawn by less than $10, and does at exactly $10", () => {
    expect(nsfFee({ ...base, shortfallCents: 999 })).toMatchObject({ feeCents: 0, rule: "under_minimum_overdraft" })
    expect(nsfFee({ ...base, shortfallCents: 1_000 }).feeCents).toBe(1_000)
  })
  it("allows only one fee in a period of 2 business days", () => {
    expect(nsfFee({ ...base, priorFeeDates: ["2026-07-15"] }).rule).toBe("one_fee_per_window")
    expect(nsfFee({ ...base, date: "2026-07-16", priorFeeDates: ["2026-07-15"] }).rule).toBe("one_fee_per_window")
    expect(nsfFee({ ...base, date: "2026-07-17", priorFeeDates: ["2026-07-15"] }).feeCents).toBe(1_000)
    // Friday then Monday is one business day apart: still inside the window.
    expect(nsfFee({ ...base, date: "2026-07-20", priorFeeDates: ["2026-07-17"] }).rule).toBe("one_fee_per_window")
  })
  it("does not apply before 12 March 2026 or to business accounts", () => {
    expect(nsfFee({ ...base, date: "2026-03-11" })).toMatchObject({ feeCents: 4_800, rule: "not_regulated" })
    expect(nsfFee({ ...base, date: NSF_RULES.inForce }).feeCents).toBe(1_000)
    expect(nsfFee({ ...base, accountKind: "business" })).toMatchObject({ feeCents: 4_800, rule: "not_regulated" })
  })
  it("keeps a fee already under the cap", () => {
    expect(nsfFee({ ...base, bankFeeCents: 800 })).toMatchObject({ feeCents: 800, rule: "standard" })
  })
})

describe("earliest safe retry", () => {
  it("waits until after the 2-business-day window", () => {
    expect(earliestSafeRetry("2026-07-15")).toBe("2026-07-17") // Wed → Fri
    expect(earliestSafeRetry("2026-07-17")).toBe("2026-07-21") // Fri → Tue
  })
  it("a retry on that date could never fall inside the fee window", () => {
    for (const d of ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17"]) {
      expect(nsfFee({ ...base, date: earliestSafeRetry(d), priorFeeDates: [d] }).rule).not.toBe("one_fee_per_window")
    }
  })
})
