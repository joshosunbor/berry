import { describe, expect, it } from "vitest"
import { buildPadPlan, PAD_RULES, RECOURSE_STATEMENT } from "@/lib/engine/repayment"
import { features } from "./fixtures"
import { Rng } from "@/lib/rng"
import { SERVICING } from "@/lib/servicing/config"
import type { Decision } from "@/lib/schemas"

const decision = (over: Partial<Decision>): Decision =>
  ({
    id: "dec_t-cu",
    applicantId: "apl_t",
    mode: "credit_union",
    institutionId: "northgate",
    outcome: "approve",
    product: "personal_loan",
    limitCents: 1_500_000,
    aprBps: 899,
    termMonths: 36,
    structure: "term",
    reasons: [],
    counterfactuals: [],
    flags: [],
    inputsUsed: [],
    paymentCents: 47_694,
    decidedAt: "2026-09-30T23:59:59Z",
    engineVersion: "t",
    policyVersion: 1,
    ...over,
  }) as Decision

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000
const SIGNED = "2026-10-05"

/** Twelve calendar months of history with the given lowest balance per month (default: comfortably high). */
function history(lows: Partial<Record<number, number>> = {}, fallback = 10_000_000) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    return { month: `2026-${String(m).padStart(2, "0")}`, incomeCents: 0, inflowCents: 0, outflowCents: 0, netCents: 0, lowBalanceCents: lows[m] ?? fallback, closingBalanceCents: lows[m] ?? fallback }
  })
}
/** A borrower whose cash runs out in every quiet month: the line is drawn to its limit (used to test the mechanics). */
const cashShort = (peakMonths: number[]) => ({ income: { type: "seasonal" as const, peakMonths }, monthly: history({}, -1_000_000_000), avgMonthlyOutflowCents: 0 })

describe("PAD repayment plans (Rule H1)", () => {
  it("monthly term loan: fixed amount, repays exactly the principal", () => {
    const plan = buildPadPlan({ decision: decision({}), features: features({ income: { payroll: null } }), kind: "personal", agreementSignedOn: SIGNED })
    expect(plan.frequency).toBe("monthly")
    expect(plan.amountType).toBe("fixed")
    expect(plan.debits).toHaveLength(36)
    expect(plan.totalPrincipalCents).toBe(1_500_000)
    expect(plan.debits.at(-1)!.balanceAfterCents).toBe(0)
    expect(plan.debits.every((d) => Number.isInteger(d.amountCents))).toBe(true)
  })

  it("puts the first debit at least 10 calendar days after confirmation", () => {
    const plan = buildPadPlan({ decision: decision({}), features: features(), kind: "personal", agreementSignedOn: SIGNED })
    expect(days(plan.confirmationSentOn, plan.firstDebitOn!)).toBeGreaterThanOrEqual(PAD_RULES.confirmationDays)
  })

  it("aligns to payday when the borrower is paid every two weeks", () => {
    const plan = buildPadPlan({ decision: decision({}), features: features(), kind: "personal", agreementSignedOn: SIGNED })
    expect(plan.frequency).toBe("biweekly")
    expect(plan.debits).toHaveLength(78)
    expect(days(plan.debits[0].date, plan.debits[1].date)).toBe(14)
    expect(plan.totalPrincipalCents).toBe(1_500_000)
  })

  it("never presents a debit on a weekend", () => {
    const plan = buildPadPlan({ decision: decision({}), features: features({ income: { payroll: null } }), kind: "personal", agreementSignedOn: SIGNED })
    for (const d of plan.debits) expect([0, 6]).not.toContain(new Date(`${d.date}T00:00:00Z`).getUTCDay())
  })

  it("seasonal line: interest only in quiet months, principal in peak months, all repaid", () => {
    const plan = buildPadPlan({
      decision: decision({ product: "seasonal_operating_line", structure: "seasonal_operating", termMonths: 12, limitCents: 6_000_000, aprBps: 795 }),
      features: features(cashShort([9, 10, 11])),
      kind: "business",
      agreementSignedOn: SIGNED,
    })
    expect(plan.amountType).toBe("variable")
    for (const d of plan.debits) {
      const month = Number(d.date.slice(5, 7))
      if (![9, 10, 11].includes(month)) expect(d.principalCents).toBe(0)
    }
    expect(plan.totalPrincipalCents).toBe(6_000_000)
  })

  it("seasonal line starting just after a peak: draws through the quiet months, repaid in one season", () => {
    const plan = buildPadPlan({
      decision: decision({ product: "seasonal_operating_line", structure: "seasonal_operating", termMonths: 12, limitCents: 8_000_000, aprBps: 795 }),
      features: features(cashShort([6, 7, 8])),
      kind: "business",
      agreementSignedOn: SIGNED,
    })
    const withPrincipal = plan.debits.filter((d) => d.principalCents > 0).map((d) => d.date.slice(0, 7))
    expect(withPrincipal).toEqual(["2027-06", "2027-07", "2027-08"])
    expect(plan.debits.at(-1)!.balanceAfterCents).toBe(0)
    expect(plan.totalPrincipalCents).toBe(8_000_000)
  })

  it("seasonal line signed during the peak doesn't start with a large repayment", () => {
    const plan = buildPadPlan({
      decision: decision({ product: "seasonal_operating_line", structure: "seasonal_operating", termMonths: 12, limitCents: 6_000_000, aprBps: 795 }),
      features: features(cashShort([9, 10, 11])),
      kind: "business",
      agreementSignedOn: SIGNED,
    })
    expect(plan.debits[0].principalCents).toBe(0)
    expect(plan.debits[0].amountCents).toBeLessThan(100_000)
  })

  it("variable amounts get pre-notification at least 10 days before each debit after the first", () => {
    const plan = buildPadPlan({
      decision: decision({ product: "line_of_credit", structure: "revolving", termMonths: null, limitCents: 1_000_000 }),
      features: features(),
      kind: "personal",
      agreementSignedOn: SIGNED,
    })
    expect(plan.debits[0].preNotifyBy).toBeUndefined()
    for (const d of plan.debits.slice(1)) expect(days(d.preNotifyBy!, d.date)).toBe(PAD_RULES.preNotificationDays)
  })

  it("lists every Appendix II mandatory element and the right recourse period", () => {
    const personal = buildPadPlan({ decision: decision({}), features: features(), kind: "personal", agreementSignedOn: SIGNED })
    const elements = personal.checklist.map((c) => c.element)
    for (const e of ["Date and signature", "Authority to debit account", "PAD category", "Amount and timing", "Cancellation", "Contact information", "Recourse statement (verbatim)"]) {
      expect(elements).toContain(e)
    }
    expect(personal.checklist.find((c) => c.element === "Recourse period")!.detail).toMatch(/90 calendar days/)
    const business = buildPadPlan({ decision: decision({ product: "business_term_loan" }), features: features(), kind: "business", agreementSignedOn: SIGNED })
    expect(business.checklist.find((c) => c.element === "Recourse period")!.detail).toMatch(/10 business days/)
    expect(business.frequency).toBe("monthly") // businesses aren't paid by payroll
  })

  it("uses the H1 recourse statement word for word", () => {
    expect(RECOURSE_STATEMENT).toBe(
      "You have certain recourse rights if any debit does not comply with this agreement. For example, you have the right to receive reimbursement for any debit that is not authorized or is not consistent with this PAD Agreement. To obtain more information on your recourse rights, contact your financial institution or visit www.payments.ca.",
    )
  })

  it("keeps the cancellation notice within the 30-day maximum", () => {
    expect(PAD_RULES.cancellationNoticeDays).toBeLessThanOrEqual(PAD_RULES.maxCancellationNoticeDays)
  })

  it("refuses to build a plan for a decline", () => {
    expect(() => buildPadPlan({ decision: decision({ outcome: "decline", limitCents: 0, aprBps: null, structure: null }), features: features(), kind: "personal", agreementSignedOn: SIGNED })).toThrow()
  })
})

describe("rounding: schedules sum exactly, in whole cents", () => {
  it("every term schedule repays exactly the principal, and debits sum to principal plus interest", () => {
    const rng = new Rng(6)
    for (let i = 0; i < 300; i++) {
      const principal = rng.int(50_000, 50_000_000)
      const aprBps = rng.int(0, 2_499)
      const termMonths = rng.pick([12, 24, 36, 48, 60, 84])
      const biweekly = rng.chance(0.5)
      const plan = buildPadPlan({
        decision: decision({ limitCents: principal, aprBps, termMonths }),
        features: features(biweekly ? {} : { income: { payroll: null } }),
        kind: "personal",
        agreementSignedOn: SIGNED,
      })
      const sumPrincipal = plan.debits.reduce((t, d) => t + d.principalCents, 0)
      const sumInterest = plan.debits.reduce((t, d) => t + d.interestCents, 0)
      const sumDebits = plan.debits.reduce((t, d) => t + d.amountCents, 0)
      expect(sumPrincipal, `case ${i}`).toBe(principal)
      expect(sumDebits, `case ${i}`).toBe(principal + sumInterest)
      expect(plan.totalPrincipalCents).toBe(principal)
      expect(plan.totalInterestCents).toBe(sumInterest)
      expect(plan.debits.at(-1)!.balanceAfterCents).toBe(0)
      for (const d of plan.debits) {
        expect(Number.isInteger(d.amountCents) && Number.isInteger(d.interestCents) && Number.isInteger(d.principalCents)).toBe(true)
        expect(d.amountCents).toBe(d.principalCents + d.interestCents)
      }
      // Level payments, with the rounding remainder in the final instalment only.
      const regular = plan.debits.slice(0, -1).map((d) => d.amountCents)
      expect(new Set(regular).size, `case ${i}`).toBe(1)
    }
  })

  it("seasonal schedules also repay exactly the line, in whole cents", () => {
    const rng = new Rng(7)
    for (let i = 0; i < 100; i++) {
      const principal = rng.int(100_000, 25_000_000)
      const peakStart = rng.int(1, 10)
      const plan = buildPadPlan({
        decision: decision({ product: "seasonal_operating_line", structure: "seasonal_operating", termMonths: 12, limitCents: principal, aprBps: rng.int(0, 2_000) }),
        features: features(cashShort([peakStart, peakStart + 1, peakStart + 2])),
        kind: "business",
        agreementSignedOn: SIGNED,
      })
      const sumInterest = plan.debits.reduce((t, d) => t + d.interestCents, 0)
      expect(plan.debits.reduce((t, d) => t + d.principalCents, 0), `case ${i}`).toBe(principal)
      expect(plan.debits.reduce((t, d) => t + d.amountCents, 0)).toBe(principal + sumInterest)
      expect(plan.debits.at(-1)!.balanceAfterCents).toBe(0)
    }
  })
})

describe("seasonal operating line: the reserve rule", () => {
  // Reserve: one month's average spending ($30,000). The borrower's own balance
  // dips to $20,000 in March, $5,000 in April, $8,000 in May and $1,000 in June.
  const LIMIT = 6_000_000
  const APR = 795
  const plan = buildPadPlan({
    decision: decision({ product: "seasonal_operating_line", structure: "seasonal_operating", termMonths: 12, limitCents: LIMIT, aprBps: APR }),
    features: features({ income: { type: "seasonal", peakMonths: [9, 10, 11] }, avgMonthlyOutflowCents: 3_000_000, monthly: history({ 3: 2_000_000, 4: 500_000, 5: 800_000, 6: 100_000 }) }),
    kind: "business",
    agreementSignedOn: SIGNED,
  })

  it("draws only what keeps one month's spending in the account, own cash first", () => {
    // Need: Mar $10,000; Apr $25,000; May $22,000 (already covered); Jun $29,000.
    expect(plan.draws!.map((d) => [d.date.slice(5, 7), d.amountCents])).toEqual([
      ["03", 1_000_000],
      ["04", 1_500_000],
      ["06", 400_000],
    ])
  })

  it("never reaches 100% of the limit for a healthy seasonal borrower", () => {
    const peak = plan.draws!.reduce((t, d) => t + d.amountCents, 0)
    expect(peak).toBe(2_900_000)
    expect(peak / LIMIT).toBeLessThan(1)
  })

  it("draws nothing when the borrower's own cash always covers the reserve", () => {
    const flush = buildPadPlan({
      decision: decision({ product: "seasonal_operating_line", structure: "seasonal_operating", termMonths: 12, limitCents: LIMIT, aprBps: APR }),
      features: features({ income: { type: "seasonal", peakMonths: [9, 10, 11] }, avgMonthlyOutflowCents: 3_000_000, monthly: history() }),
      kind: "business",
      agreementSignedOn: SIGNED,
    })
    expect(flush.draws).toEqual([])
    expect(flush.debits).toEqual([])
    expect(flush.firstDebitOn).toBeNull()
  })

  it("reads the reserve from config: two months of spending doubles the reserve", () => {
    const twoMonths = buildPadPlan({
      decision: decision({ product: "seasonal_operating_line", structure: "seasonal_operating", termMonths: 12, limitCents: LIMIT, aprBps: APR }),
      features: features({ income: { type: "seasonal", peakMonths: [9, 10, 11] }, avgMonthlyOutflowCents: 3_000_000, monthly: history({ 3: 2_000_000, 4: 500_000, 5: 800_000, 6: 100_000 }) }),
      kind: "business",
      agreementSignedOn: SIGNED,
      operatingReserveMonths: 2,
    })
    // Reserve $60,000: need peaks at $59,000 in June.
    expect(twoMonths.draws!.reduce((t, d) => t + d.amountCents, 0)).toBe(5_900_000)
    expect(SERVICING.operatingReserveMonthsOfSpending).toBe(1)
  })

  it("caps draws at the limit when the history needs more", () => {
    const short = buildPadPlan({
      decision: decision({ product: "seasonal_operating_line", structure: "seasonal_operating", termMonths: 12, limitCents: LIMIT, aprBps: APR }),
      features: features(cashShort([9, 10, 11])),
      kind: "business",
      agreementSignedOn: SIGNED,
    })
    expect(short.draws!.reduce((t, d) => t + d.amountCents, 0)).toBe(LIMIT)
  })

  it("charges interest only on the drawn balance, in arrears, and never draws past the limit", () => {
    const events = [
      ...plan.draws!.map((d) => ({ date: d.date, delta: d.amountCents, debit: null as null | (typeof plan.debits)[number] })),
      ...plan.debits.map((d) => ({ date: d.date, delta: -d.principalCents, debit: d })),
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.debit ? -1 : 1))
    let balance = 0
    for (const e of events) {
      if (e.debit) expect(e.debit.interestCents, e.date).toBe(Math.round((balance * APR) / 10_000 / 12))
      balance += e.delta
      expect(balance).toBeLessThanOrEqual(LIMIT)
      expect(balance).toBeGreaterThanOrEqual(0)
    }
    expect(balance).toBe(0)
    expect(plan.debits.every((d) => d.date > plan.draws![0].date)).toBe(true)
  })

  it("sweeps principal only in the peak months, and repays exactly what was drawn", () => {
    for (const d of plan.debits) if (d.principalCents) expect([9, 10, 11]).toContain(Number(d.date.slice(5, 7)))
    expect(plan.totalPrincipalCents).toBe(2_900_000)
    expect(plan.debits.reduce((t, d) => t + d.amountCents, 0)).toBe(2_900_000 + plan.totalInterestCents)
  })
})
