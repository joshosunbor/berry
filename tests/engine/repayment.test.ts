import { describe, expect, it } from "vitest"
import { buildPadPlan, PAD_RULES, RECOURSE_STATEMENT } from "@/lib/engine/repayment"
import { features } from "./fixtures"
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
    expect(days(plan.confirmationSentOn, plan.firstDebitOn)).toBeGreaterThanOrEqual(PAD_RULES.confirmationDays)
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
      features: features({ income: { type: "seasonal", peakMonths: [9, 10, 11] } }),
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
