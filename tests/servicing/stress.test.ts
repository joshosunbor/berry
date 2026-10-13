import { describe, expect, it } from "vitest"
import { AGREEMENT_SIGNED_ON, getApplicant, getLoanView, getStress } from "@/lib/data"
import { decide, itemAt, overLimitRequest } from "@/lib/ops/view"
import { SERVICING } from "@/lib/servicing/config"
import { stressSeason } from "@/lib/servicing/stress"

const LINES = { "hollis-family-farm": { peak: 29_012_03, interest: 816_07, util: 0.484, limit: 60_000_00 }, "lakeside-lodge": { peak: 37_049_36, interest: 607_14, util: 0.463, limit: 80_000_00 } }
const run = (slug: string, dropPct: number) => {
  const a = getApplicant(slug)!
  return stressSeason({ decision: a.decisions.credit_union, features: a.features, kind: a.applicant.kind, agreementSignedOn: AGREEMENT_SIGNED_ON, plan: a.pad.credit_union!, dropPct })
}

describe("poor-harvest stress test", () => {
  it("is configured at 30% by default, labelled illustrative in config", () => {
    expect(SERVICING.stress.poorHarvestRevenueDropPct).toBe(30)
    expect(SERVICING.stress.optionsPct).toContain(30)
  })

  for (const [slug, base] of Object.entries(LINES)) {
    describe(slug, () => {
      it("the base scenario's numbers don't change", () => {
        const a = getApplicant(slug)!
        const plan = a.pad.credit_union!
        // The published plan is untouched...
        expect(plan.draws!.reduce((t, d) => t + d.amountCents, 0)).toBe(base.peak)
        expect(plan.totalInterestCents).toBe(base.interest)
        // ...and the base column reproduces it, through the same steps the stress uses.
        for (const pct of SERVICING.stress.optionsPct) {
          const r = run(slug, pct)
          expect(r.base.peakDrawnCents).toBe(base.peak)
          expect(r.base.seasonInterestCents).toBe(base.interest)
          expect(Math.round(r.base.peakUtilization * 1000) / 1000).toBe(base.util)
          expect(r.base.sweepFullyRepays).toBe(true)
          expect(r.base.carriedCents).toBe(0)
          expect(r.base.nextSeasonNeedCents).toBe(base.peak)
          expect(r.base.overLimitCents).toBe(0)
        }
        expect(run(slug, 0).stressed).toEqual(run(slug, 0).base)
      })

      it("this season's draws don't change under stress (they come before the harvest)", () => {
        expect(run(slug, 30).stressed.peakDrawnCents).toBe(base.peak)
      })

      it("gets no better as the harvest gets worse", () => {
        const rs = SERVICING.stress.optionsPct.map((p) => run(slug, p).stressed)
        for (let i = 1; i < rs.length; i++) {
          expect(rs[i].nextSeasonNeedCents).toBeGreaterThanOrEqual(rs[i - 1].nextSeasonNeedCents)
          expect(rs[i].carriedCents).toBeGreaterThanOrEqual(rs[i - 1].carriedCents)
        }
      })

      it("shows a shortfall instead of capping it", () => {
        const s = run(slug, 30).stressed
        expect(s.nextSeasonNeedCents).toBeGreaterThan(base.limit)
        expect(s.overLimitCents).toBe(s.nextSeasonNeedCents - base.limit)
        expect(s.nextSeasonNeedCents).toBe(s.carriedCents + s.nextSeasonDraws.reduce((t, d) => t + d.amountCents, 0))
      })
    })
  }

  it("Hollis at 30%: the sweep still repays, but next season needs more than the limit", () => {
    const r = run("hollis-family-farm", 30)
    expect(r.lostRevenueCents).toBe(Math.round(r.peakRevenueCents * 0.3))
    expect(r.stressed.sweepFullyRepays).toBe(true)
    expect(r.options).toBeNull()
    expect(r.requestedLimitCents).toBe(115_000_00)
  })

  it("Lakeside at 30%: the sweep falls short; the remainder is carried and the options are shown, none chosen", () => {
    const r = run("lakeside-lodge", 30)
    expect(r.stressed.sweepFullyRepays).toBe(false)
    expect(r.stressed.carriedCents).toBeGreaterThan(0)
    expect(r.stressed.sweepRepaidCents + r.stressed.carriedCents).toBe(r.stressed.peakDrawnCents)
    expect(r.stressed.seasonInterestCents).toBe(r.base.seasonInterestCents + r.stressed.carriedInterestCents)
    const o = r.options!
    expect(Object.keys(o)).toEqual(["carryOver", "termOut", "limitReview"])
    // A 12-month term-out repays the carried balance with interest.
    expect(o.termOut.paymentCents * 12).toBeGreaterThan(r.stressed.carriedCents)
    expect(o.limitReview.newLimitCents).toBeGreaterThanOrEqual(r.stressed.nextSeasonNeedCents)
  })

  it("only seasonal lines have a stress test", () => {
    expect(getStress("loan_hollis-family-farm-cu")).not.toBeNull()
    expect(getStress("loan_lakeside-lodge-cu")).not.toBeNull()
    expect(getStress("loan_priya-cu")).toBeNull()
    expect(getStress("loan_hollis-family-farm-kite")).toBeNull()
  })
})

describe("over-limit request", () => {
  const loan = getLoanView("loan_hollis-family-farm-cu")!
  const r = run("hollis-family-farm", 30)
  const at = "2026-10-06T10:05"
  const make = (by: string) =>
    overLimitRequest({ loanId: loan.id, applicantName: loan.applicantName, mode: loan.mode, limitCents: r.limitCents, needCents: r.stressed.nextSeasonNeedCents, requestedLimitCents: r.requestedLimitCents, dropPct: 30, by, at })

  it("lands in Credit referrals and sign-offs, prepared by whoever raised it", () => {
    const res = make("usr_bisset")
    expect(res.error).toBeNull()
    expect(res.action.item).toMatchObject({ queue: "credit_referral", approval: { kind: "limit_override", amountCents: 115_000_00 } })
    expect(res.action.events.map((e) => e.action)).toEqual(["queue_item.created", "approval.prepared"])
    expect(res.action.request).toMatchObject({ preparedBy: "usr_bisset", requiredRole: "branch_manager", status: "pending" })
  })

  it("maker-checker applies: the requester can't approve it; a lead escalates; the branch manager approves", () => {
    const created = make("usr_bisset").action
    const item = created.item!
    const self = decide(item, created.request!, "usr_bisset", at, "approve", "", created.events)
    expect(self.error).toMatch(/can't approve/)
    const lead = decide(item, created.request!, "usr_moreau", at, "approve", "", created.events)
    expect(lead.action.kind).toBe("escalated")
    const bm = decide(item, lead.action.request!, "usr_lindqvist", at, "approve", "", [...created.events, ...lead.action.events])
    expect(bm.action.kind).toBe("approved")
    expect(itemAt(item, at, [created, self.action, lead.action, bm.action]).status).toBe("done")
  })
})
