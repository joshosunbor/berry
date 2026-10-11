import { describe, expect, it } from "vitest"
import { formatTimeToFund, fund, FundingBlocked, RAILS, RTR_LABEL, verifyAccount } from "@/lib/servicing/funding"
import { Ledger, postDisbursement } from "@/lib/servicing/ledger"
import { expectBalanced } from "./helpers"

const match = verifyAccount("Priya Raman-Clarke", "Priya Raman-Clarke")
const close = verifyAccount("Grace Lavallee", "Grace Lavallée-Ng")
const none = verifyAccount("Alex Morin", "Priya Raman-Clarke")
const base = { loanId: "loan_t-cu", amountCents: 1_500_000, initiatedAt: "2026-10-06T10:00" }

describe("account verification (simulated)", () => {
  it("classifies match, close match and no match, and never echoes a name", () => {
    expect(match.result).toBe("match")
    expect(close.result).toBe("close_match")
    expect(none.result).toBe("no_match")
    for (const v of [match, close, none]) {
      expect(v.message).not.toMatch(/Priya|Grace|Alex|Lavall/)
      expect(v.scamWarning).toMatch(/scam/i)
      expect(v.simulated).toBe(true)
    }
  })
})

describe("funding rails", () => {
  it("labels the Real-Time Rail exactly 'simulated — RTR launching'", () => {
    expect(RTR_LABEL).toBe("simulated — RTR launching")
    expect(RAILS.rtr_simulated.badge).toBe(RTR_LABEL)
    expect(fund({ ...base, rail: "rtr_simulated", verification: match }).label).toBe(RTR_LABEL)
  })

  it("AFT before the cut-off is available the next business day; after it, a day later", () => {
    const r = fund({ ...base, rail: "aft" })
    expect(r.completedAt).toBe("2026-10-07T09:00")
    expect(r.timeToFundMinutes).toBe(23 * 60)
    expect(fund({ ...base, rail: "aft", initiatedAt: "2026-10-09T17:00" }).completedAt).toBe("2026-10-13T09:00") // Fri after cut-off → Tue
  })

  it("e-Transfer takes minutes and RTR seconds", () => {
    expect(fund({ ...base, rail: "etransfer", amountCents: 500_000, verification: match }).timeToFundMinutes).toBe(20)
    const rtr = fund({ ...base, rail: "rtr_simulated", verification: match })
    expect(rtr.timeToFundMinutes).toBe(0)
    expect(formatTimeToFund(rtr.timeToFundMinutes)).toBe("Seconds")
  })

  it("won't send by an instant rail without verification, or to a non-matching account", () => {
    expect(() => fund({ ...base, rail: "rtr_simulated" })).toThrow(FundingBlocked)
    expect(() => fund({ ...base, rail: "etransfer", amountCents: 500_000 })).toThrow(FundingBlocked)
    expect(() => fund({ ...base, rail: "rtr_simulated", verification: none })).toThrow(/doesn't match/)
  })

  it("needs the lender to confirm a close match first", () => {
    expect(() => fund({ ...base, rail: "rtr_simulated", verification: close })).toThrow(/confirm/)
    expect(fund({ ...base, rail: "rtr_simulated", verification: close, confirmedWithBorrower: true }).rail).toBe("rtr_simulated")
  })

  it("makes e-Transfer unavailable above its limit", () => {
    expect(() => fund({ ...base, rail: "etransfer", verification: match })).toThrow(/use AFT/)
  })

  it("AFT needs no verification step, and funding posts a balanced ledger entry", () => {
    const r = fund({ ...base, rail: "aft" })
    const l = new Ledger("northgate")
    postDisbursement(l, r.loanId, r.amountCents, r.fundedOn, RAILS[r.rail].name)
    expect(l.outstanding(r.loanId)).toBe(1_500_000)
    expectBalanced(l)
  })

  it("rejects fractional or zero amounts", () => {
    expect(() => fund({ ...base, rail: "aft", amountCents: 100.5 })).toThrow()
    expect(() => fund({ ...base, rail: "aft", amountCents: 0 })).toThrow()
  })
})
