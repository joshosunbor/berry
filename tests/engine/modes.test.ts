import { describe, expect, it } from "vitest"
import { CONFIGS } from "@/lib/engine/config"
import { decideBank } from "@/lib/engine/modes/bank"
import { decideCreditUnion, relationshipScore } from "@/lib/engine/modes/creditUnion"
import { decideFintech } from "@/lib/engine/modes/fintech"
import { explain } from "@/lib/engine/explain"
import { ctx, features } from "./fixtures"

const codes = (r: { reasons: { code: string }[] }) => r.reasons.map((x) => x.code)
// Northgate's configured weights, with five years for full tenure credit.
const T5 = { ...(CONFIGS.credit_union.thresholds as unknown as Parameters<typeof relationshipScore>[1]), fullTenureYears: 5 }
const member = (tenureYears: number, productsHeld = 3) => ({ member: true, tenureYears, productsHeld, avgBalanceAtNorthgateCents: 300_000, existingCreditCents: 0 })
const seasonalMonths = (peak: number[], peakNet: number, otherNet: number) =>
  Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, incomeCents: 0, inflowCents: 0, outflowCents: 0, netCents: peak.includes(i + 1) ? peakNet : otherNet, lowBalanceCents: 100_000, closingBalanceCents: 100_000 }))

describe("Aspen (bank): fixed thresholds", () => {
  const bank = (over: Parameters<typeof features>[0] = {}, request = {}) => decideBank(ctx("bank", features(over), request))

  it("approves a clean file with documents and standard conditions", () => {
    const r = bank()
    expect(r.outcome).toBe("approve")
    expect(r.documents?.length).toBeGreaterThan(0)
    expect(r.conditions?.length).toBeGreaterThan(0)
  })
  it.each([
    [{ windowMonths: 11 }, "SHORT_ACCOUNT_HISTORY"],
    [{ creditHistoryMonths: 23 }, "SHORT_CREDIT_HISTORY"],
    [{ nsf12m: 2 }, "NSF_HISTORY"],
    [{ incomeCv: 0.36 }, "INCOME_TOO_VARIABLE"],
    [{ creditUtilization: 0.91 }, "HIGH_CARD_UTILIZATION"],
  ])("declines just past the line: %o", (over, code) => {
    const r = bank(over)
    expect(r.outcome).toBe("decline")
    expect(codes(r)).toContain(code)
  })
  it.each([[{ windowMonths: 12 }], [{ creditHistoryMonths: 24 }], [{ nsf12m: 1 }], [{ incomeCv: 0.35 }], [{ creditUtilization: 0.9 }]])("approves exactly at the line: %o", (over) => {
    expect(bank(over).outcome).toBe("approve")
  })
  it("accepts an imported foreign credit report in place of Canadian history", () => {
    expect(bank({ creditHistoryMonths: 6, foreignReportAvailable: true }).outcome).toBe("approve")
  })
  it("lists every failed check, not just the first", () => {
    expect(codes(bank({ windowMonths: 7, creditHistoryMonths: 6 }))).toEqual(expect.arrayContaining(["SHORT_ACCOUNT_HISTORY", "SHORT_CREDIT_HISTORY"]))
  })
  it("refers gig income for tax documents", () => {
    const r = bank({ income: { type: "gig" } })
    expect(r.outcome).toBe("refer")
    expect(r.documents?.[0].name).toMatch(/Notices of Assessment/)
  })
  it("reduces the amount to meet minimum coverage, or declines below the product minimum", () => {
    const reduced = bank({ avgMonthlyNetCents: 30_000 })
    expect(reduced.outcome).toBe("approve")
    expect(reduced.limitCents).toBeLessThan(1_000_000)
    expect(codes(reduced)).toContain("LIMIT_REDUCED")
    expect(bank({ avgMonthlyNetCents: 1_000 }).outcome).toBe("decline")
  })
})

describe("Kite (fintech): cash flow only, sized on the median month", () => {
  const kite = (over: Parameters<typeof features>[0] = {}, request = {}, kind: "personal" | "business" = "personal") => decideFintech(ctx("fintech", features(over), request, kind))

  it.each([
    [{ nsf90: 2 }, "RECENT_NSF"],
    [{ medianMonthlyNetCents: 0 }, "NEGATIVE_TYPICAL_MONTH"],
    [{ windowMonths: 2 }, "SHORT_ACCOUNT_HISTORY"],
  ])("declines: %o", (over, code) => {
    expect(codes(kite(over))).toContain(code)
  })
  it("allows one recent NSF", () => {
    expect(kite({ nsf90: 1 }).outcome).toBe("approve")
  })
  it("ignores relationship depth entirely", () => {
    const a = kite({}, { product: "credit_card", amountCents: 500_000 })
    const b = kite({ relationship: member(20, 6) }, { product: "credit_card", amountCents: 500_000 })
    expect(b).toEqual(a)
  })
  it("sizes a personal card at 4.5x the median month, rounded down", () => {
    // $741 x 4.5 = $3,334.50 → $3,000
    expect(kite({ medianMonthlyNetCents: 74_100 }, { product: "credit_card", amountCents: 500_000 }).limitCents).toBe(300_000)
  })
  it("sizes a business line at 2x the median month", () => {
    // $4,189 x 2 = $8,378 → $8,000
    const r = kite({ medianMonthlyNetCents: 418_900 }, { product: "business_line_of_credit", amountCents: 4_000_000 }, "business")
    expect(r.limitCents).toBe(800_000)
    expect(codes(r)).toContain("LIMIT_REDUCED")
  })
  it("offers a standard line instead of a seasonal one", () => {
    const r = kite({ medianMonthlyNetCents: 418_900 }, { product: "seasonal_operating_line", amountCents: 6_000_000 }, "business")
    expect(r.product).toBe("business_line_of_credit")
    expect(r.structure).toBe("revolving")
    expect(codes(r)).toContain("NO_SEASONAL_STRUCTURE")
  })
  it("caps thin files, and lifts the cap with a foreign credit report", () => {
    const req = { product: "starter_credit" as const, amountCents: 200_000 }
    expect(kite({ creditHistoryMonths: 6 }, req).limitCents).toBe(100_000)
    expect(kite({ creditHistoryMonths: 6, foreignReportAvailable: true }, req).limitCents).toBe(150_000)
  })
  it("partially approves at the product maximum and says so", () => {
    const r = kite({ avgMonthlyNetCents: 3_000_000, medianMonthlyNetCents: 3_000_000 }, { product: "equipment_financing", amountCents: 35_000_000, termMonths: 84 }, "business")
    expect(r.limitCents).toBe(15_000_000)
    expect(codes(r)).toContain("PRODUCT_MAX")
  })
})

describe("a decline's reason matches what declined it", () => {
  it("Kite: a card sized under the minimum says so, rather than 'coverage 6.7x, below 1.3x'", () => {
    // $60 median month x 4.5 = $270, under the $300 card minimum; coverage at $300 would be fine.
    const r = decideFintech(ctx("fintech", features({ medianMonthlyNetCents: 6_000 }), { product: "credit_card", amountCents: 30_000 }))
    expect(r.outcome).toBe("decline")
    for (const reason of r.reasons.filter((x) => x.code === "LOW_COVERAGE")) {
      expect(Number(reason.evidence.dscr)).toBeLessThan(Number(reason.evidence.minDscr))
    }
    expect(r.reasons.map((x) => x.code)).toContain("BELOW_PRODUCT_MINIMUM")
  })
})

describe("rounding a request isn't a policy reduction", () => {
  it("Northgate: $15,250 offered as $15,000 says nothing about coverage", () => {
    const r = decideCreditUnion(ctx("credit_union", features({ relationship: { member: true, tenureYears: 3, productsHeld: 3, avgBalanceAtNorthgateCents: 300_000, existingCreditCents: 0 } }), { amountCents: 1_525_000 }))
    expect(r.limitCents).toBe(1_500_000)
    expect(r.reasons.map((x) => x.code)).not.toContain("LIMIT_REDUCED")
  })
  it("Kite: $2,250 offered as $2,000 isn't blamed on the product maximum", () => {
    const r = decideFintech(ctx("fintech", features({ medianMonthlyNetCents: 300_000 }), { product: "credit_card", amountCents: 225_000 }))
    expect(r.limitCents).toBe(200_000)
    expect(r.reasons.map((x) => x.code)).not.toContain("LIMIT_REDUCED")
  })
})

describe("Northgate (credit union): relationship, structure and authority", () => {
  const cu = (over: Parameters<typeof features>[0] = {}, request = {}, kind: "personal" | "business" = "personal") => decideCreditUnion(ctx("credit_union", features(over), request, kind))

  it("scores relationship depth from tenure, products and deposits", () => {
    expect(relationshipScore(features(), T5)).toBe(0)
    expect(relationshipScore(features({ relationship: member(10, 4) }), T5)).toBe(1)
    expect(relationshipScore(features({ relationship: { member: true, tenureYears: 2.5, productsHeld: 0, avgBalanceAtNorthgateCents: 0, existingCreditCents: 0 } }), T5)).toBe(0.25)
  })
  it("declines above 2 NSFs in 90 days, allows 2 with conditions and a smaller limit", () => {
    expect(cu({ nsf90: 3 }).outcome).toBe("decline")
    const r = cu({ nsf90: 2, relationship: member(3) }, { product: "line_of_credit", amountCents: 2_500_000 })
    expect(r.outcome).toBe("approve_with_conditions")
    expect(r.limitCents).toBe(600_000) // 4 x $1,500 average net
    expect(r.conditions?.length).toBe(2)
  })
  it("declines rather than approve below the product minimum after a returned-payment cap", () => {
    // 4 x $1,500 net = $6,000 cap, under the $10,000 business term loan minimum
    const r = cu({ nsf90: 1 }, { product: "business_term_loan", amountCents: 2_500_000, termMonths: 36 }, "business")
    expect(r.outcome).toBe("decline")
    expect(r.limitCents).toBe(0)
    expect(codes(r)).toEqual(["BELOW_PRODUCT_MINIMUM"])
  })
  it("declines, without throwing, when the returned-payment cap rounds to $0", () => {
    const r = cu({ nsf90: 1, avgMonthlyNetCents: 10_000 }, { product: "line_of_credit", amountCents: 500_000 })
    expect(r.outcome).toBe("decline")
    expect(r.paymentCents).toBeNull()
  })
  it("routes sign-off on total exposure to Northgate: the new limit plus what the member already owes", () => {
    // $15,000 alone is Lending officer authority; with $40,000 already owed, the $55,000 total needs the Branch Manager.
    const alone = cu({ relationship: member(3) }, { amountCents: 1_500_000 })
    const owing = cu({ relationship: { ...member(3), existingCreditCents: 4_000_000 } }, { amountCents: 1_500_000 })
    expect(alone.approver?.id).toBe("lender")
    expect(owing.limitCents).toBe(alone.limitCents)
    expect(owing.approver?.id).toBe("branch_manager")
  })
  it("names an approver for every approval", () => {
    expect(cu().approver?.id).toBe("msr")
    expect(cu({}, { amountCents: 1_500_000 }).approver?.id).toBe("lender")
  })
  it("uses the lower relationship minimum for strong members, and routes one tier up", () => {
    // $10k over 36 months at 8.99% ≈ $318/month; $340 net → 1.07x standard fails
    const weak = cu({ avgMonthlyNetCents: 36_000 })
    const strong = cu({ avgMonthlyNetCents: 36_000, relationship: member(10, 4) })
    expect(weak.limitCents).toBeLessThan(1_000_000)
    expect(strong.limitCents).toBe(1_000_000)
    expect(strong.relationshipException).toBe(true)
    expect(strong.approver?.id).toBe("lender")
    expect(codes(strong)).toContain("RELATIONSHIP_SUPPORTS_APPROVAL")
  })
  it("caps unsecured revolving credit for non-members", () => {
    const r = cu({}, { product: "credit_card", amountCents: 500_000 })
    expect(r.limitCents).toBe(200_000)
    expect(codes(r)).toContain("NON_MEMBER_CAP")
    expect(cu({ relationship: member(3) }, { product: "credit_card", amountCents: 500_000 }).limitCents).toBe(500_000)
  })
  it("sizes a seasonal line to peak-season surplus over required coverage", () => {
    const over = { income: { type: "seasonal" as const, peakMonths: [9, 10, 11], peakShare: 0.65 }, annualNetCents: 5_000_000, monthly: seasonalMonths([9, 10, 11], 3_000_000, -500_000) }
    // Peak surplus $90,000 / 1.25 = $72,000 → $70,000
    const r = cu(over, { product: "seasonal_operating_line", amountCents: 10_000_000 }, "business")
    expect(r.structure).toBe("seasonal_operating")
    expect(r.limitCents).toBe(7_000_000)
    expect(codes(r)).toEqual(expect.arrayContaining(["SEASONAL_REPAYMENT_FITS", "PEAK_SURPLUS_LIMITS_LINE"]))
    expect(r.conditions?.[0]).toMatch(/end of November/)
    // Strong members need 1.15x: $90,000 / 1.15 = $78,260 → $75,000
    expect(cu({ ...over, relationship: member(10, 4) }, { product: "seasonal_operating_line", amountCents: 10_000_000 }, "business").limitCents).toBe(7_500_000)
  })
  it("reads a season from the last 12 months: a longer window doesn't count a peak month twice", () => {
    // 15 months: last year's Sep-Nov were much stronger; this year's peak surplus is $30,000.
    const older = [9, 10, 11].map((m) => ({ month: `2025-${String(m).padStart(2, "0")}`, incomeCents: 0, inflowCents: 0, outflowCents: 0, netCents: 3_000_000, lowBalanceCents: 100_000, closingBalanceCents: 100_000 }))
    const over = { income: { type: "seasonal" as const, peakMonths: [9, 10, 11], peakShare: 0.65 }, annualNetCents: 2_000_000, monthly: [...older, ...seasonalMonths([9, 10, 11], 1_000_000, -50_000)] }
    // $30,000 / 1.25 = $24,000, not ($30,000 + $90,000) / 1.25.
    expect(cu(over, { product: "seasonal_operating_line", amountCents: 10_000_000 }, "business").limitCents).toBe(2_400_000)
  })
  it("offers a seasonal operating line only to businesses; a personal applicant gets the product asked for", () => {
    const over = { income: { type: "seasonal" as const, peakMonths: [6, 7, 8], peakShare: 0.6 }, annualNetCents: 2_000_000, monthly: seasonalMonths([6, 7, 8], 600_000, 50_000) }
    const personal = cu(over, { product: "personal_loan", amountCents: 800_000, termMonths: 36 }, "personal")
    expect(personal.product).toBe("personal_loan")
    expect(personal.structure === null || personal.structure === "term").toBe(true)
    const business = cu(over, { product: "business_term_loan", amountCents: 3_000_000, termMonths: 36 }, "business")
    expect(business.product).toBe("seasonal_operating_line")
  })

  it("explains a seasonal decline by peak-season surplus, never as a $0 payment", () => {
    const over = { income: { type: "seasonal" as const, peakMonths: [9, 10, 11], peakShare: 0.65 }, annualNetCents: 100_000, monthly: seasonalMonths([9, 10, 11], 200_000, -40_000) }
    const r = cu(over, { product: "seasonal_operating_line", amountCents: 6_000_000 }, "business")
    expect(r.outcome).toBe("decline")
    expect(codes(r)).toContain("SEASONAL_SURPLUS_TOO_LOW")
    for (const x of explain(r.outcome, r.reasons)) {
      expect(x.customerText).not.toMatch(/\$0\b/)
      expect(x.lenderText).not.toMatch(/\$0\b/)
    }
  })
  it("sizes a thin-file starter limit to what the member can afford, and declines when even the minimum isn't", () => {
    const req = { product: "starter_credit" as const, amountCents: 300_000 }
    // $20 a month left over: $2,000 would need a ~$60 payment; about $500 meets coverage.
    const tight = cu({ creditHistoryMonths: 6, relationship: member(0.5, 2), avgMonthlyNetCents: 2_000 }, req)
    expect(tight.outcome).toBe("approve")
    expect(tight.limitCents).toBeLessThan(200_000)
    expect(codes(tight)).toContain("LIMIT_REDUCED")
    // $2 a month: not even the $300 minimum is affordable.
    expect(cu({ creditHistoryMonths: 6, relationship: member(0.5, 2), avgMonthlyNetCents: 200 }, req).outcome).toBe("decline")
  })
  it("offers thin-file members with steady pay a starter limit, and declines non-members", () => {
    const req = { product: "starter_credit" as const, amountCents: 300_000 }
    const m = cu({ creditHistoryMonths: 6, relationship: member(0.5, 2) }, req)
    expect(m.outcome).toBe("approve")
    expect(m.limitCents).toBe(200_000)
    expect(codes(m)).toContain("STARTER_PATH")
    expect(cu({ creditHistoryMonths: 6 }, req).outcome).toBe("decline")
  })
})
