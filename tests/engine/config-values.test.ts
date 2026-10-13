import { describe, expect, it } from "vitest"
import { CONFIGS } from "@/lib/engine/config"
import { decideBank } from "@/lib/engine/modes/bank"
import { decideCreditUnion } from "@/lib/engine/modes/creditUnion"
import { decideFintech } from "@/lib/engine/modes/fintech"
import { assessedPayment, coverageAt, lendingPolicy, maxAffordableCents } from "@/lib/engine/modes/common"
import type { InstitutionConfig } from "@/lib/schemas"
import type { Mode } from "@/lib/modes"
import { ctx, features } from "./fixtures"

/*
 * Every setting that changes a limit, a price or an approval lives in the
 * lender's config (data/institutions/*.json), so it can be versioned and
 * changed through the policy console. These tests change a value in config
 * and expect the engine's answer to change.
 */

const withConfig = (mode: Mode, patch: (c: InstitutionConfig) => InstitutionConfig, ...args: Parameters<typeof ctx> extends [Mode, ...infer R] ? R : never) => {
  const c = ctx(mode, ...args)
  return { ...c, config: patch(c.config) }
}
const thresholds = (extra: Record<string, number>) => (c: InstitutionConfig) => ({ ...c, thresholds: { ...c.thresholds, ...extra } })

describe("affordability matches each structure's own payment", () => {
  it("a seasonal line is sized on its interest-only payment, not a revolving 3% of the limit", () => {
    const p = lendingPolicy(CONFIGS.bank)
    const f = features({ avgMonthlyNetCents: 120_000 })
    const apr = 795
    const max = maxAffordableCents(p, f.avgMonthlyNetCents, f, 1.2, "seasonal_operating", apr, null)
    // The largest line whose interest-only payment fits the payment 1.2x coverage allows, to within $100.
    const allowed = Math.floor((f.avgMonthlyNetCents + f.existingDebtMonthlyCents) / 1.2 - f.existingDebtMonthlyCents)
    expect(assessedPayment(p, "seasonal_operating", max, apr, null)).toBeLessThanOrEqual(allowed)
    expect(assessedPayment(p, "seasonal_operating", max + 10_000, apr, null)).toBeGreaterThan(allowed)
    expect(coverageAt(f.avgMonthlyNetCents, f, assessedPayment(p, "seasonal_operating", max, apr, null))).toBeGreaterThanOrEqual(1.2)
  })
})

describe("lending settings come from config", () => {
  it("the revolving assessment rate", () => {
    for (const m of ["credit_union", "fintech", "bank"] as const) expect(CONFIGS[m].thresholds.revolvingAssessmentRate, m).toBe(0.03)
    // A member with modest cash left over asking for a line of credit: a higher assessed payment means a lower limit.
    const args = [features({ avgMonthlyNetCents: 60_000, relationship: { member: true, tenureYears: 3, productsHeld: 3, avgBalanceAtNorthgateCents: 300_000, existingCreditCents: 0 } }), { product: "line_of_credit" as const, amountCents: 2_500_000 }] as const
    const base = decideCreditUnion(ctx("credit_union", ...args))
    const higher = decideCreditUnion(withConfig("credit_union", thresholds({ revolvingAssessmentRate: 0.06 }), ...args))
    expect(higher.limitCents).toBeLessThan(base.limitCents)
  })

  it("limit rounding steps", () => {
    // $1,000 median month x 4.5 = $4,500: $500 steps keep $4,500, $1,000 steps give $4,000.
    const args = [features({ medianMonthlyNetCents: 100_000 }), { product: "credit_card" as const, amountCents: 500_000 }] as const
    expect(decideFintech(ctx("fintech", ...args)).limitCents).toBe(450_000)
    expect(decideFintech(withConfig("fintech", thresholds({ limitStepUnder10kCents: 100_000 }), ...args)).limitCents).toBe(400_000)
  })

  it("Northgate's relationship weights and seasonal term", () => {
    const strong = { member: true, tenureYears: 10, productsHeld: 0, avgBalanceAtNorthgateCents: 0, existingCreditCents: 0 }
    const f = features({ avgMonthlyNetCents: 36_000, relationship: strong })
    // Tenure alone scores 0.5 by default: not strong. Weight tenure fully and the relationship exception applies.
    expect(decideCreditUnion(ctx("credit_union", f)).relationshipException ?? false).toBe(false)
    const tenureHeavy = decideCreditUnion(withConfig("credit_union", thresholds({ relationshipTenureWeight: 1, relationshipProductsWeight: 0, relationshipDepositsWeight: 0 }), f))
    expect(tenureHeavy.relationshipException).toBe(true)

    const monthly = Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, incomeCents: 0, inflowCents: 0, outflowCents: 0, netCents: [9, 10, 11].includes(i + 1) ? 3_000_000 : -500_000, lowBalanceCents: 100_000, closingBalanceCents: 100_000 }))
    const seasonal = { income: { type: "seasonal" as const, peakMonths: [9, 10, 11], peakShare: 0.65 }, annualNetCents: 5_000_000, monthly }
    const sixMonths = decideCreditUnion(withConfig("credit_union", thresholds({ seasonalTermMonths: 6 }), features(seasonal), { product: "seasonal_operating_line", amountCents: 1_000_000 }, "business"))
    expect(sixMonths.termMonths).toBe(6)
  })

  it("which income types Aspen refers for documents", () => {
    expect(CONFIGS.bank.referIncomeTypes).toEqual(["gig", "invoice", "irregular"])
    const f = features({ income: { type: "gig" } })
    expect(decideBank(ctx("bank", f)).outcome).toBe("refer")
    expect(decideBank(withConfig("bank", (c) => ({ ...c, referIncomeTypes: ["invoice"] }), f)).outcome).not.toBe("refer")
  })
})
