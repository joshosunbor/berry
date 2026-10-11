import { describe, expect, it } from "vitest"
import { getForeignReportDemo, getLoanSummaries, getLoanViews, getBooks } from "@/lib/data"
import { MODES } from "@/lib/modes"
import { milestones } from "@/lib/servicing/credit-building"
import { CLOCK_OPTIONS, snapshot } from "@/lib/servicing/views"

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
import { expectBalanced } from "./helpers"

const base = { status: "active" as const, outstandingCents: 100_000, daysPastDue: 0, returns: 0, debitsCollected: 0, onTimeStreak: 0, monthsSinceFunding: 0 }

describe("credit-building milestones", () => {
  it("reach the limit review after 6 on-time payments in a row", () => {
    expect(milestones({ ...base, onTimeStreak: 5 })[0].reached).toBe(false)
    expect(milestones({ ...base, onTimeStreak: 6 })[0]).toMatchObject({ reached: true, progress: 6, target: 6 })
  })
  it("reach unsecured line eligibility at 12 months with no returned payments", () => {
    expect(milestones({ ...base, monthsSinceFunding: 12 })[1].reached).toBe(true)
    expect(milestones({ ...base, monthsSinceFunding: 12, returns: 1 })[1].reached).toBe(false)
  })
  it("Daniel's starter loan reaches the 6-payment review within the year", () => {
    const daniel = getLoanSummaries().filter((l) => l.applicantSlug === "daniel")
    expect(daniel.length).toBeGreaterThan(0)
    const last = CLOCK_OPTIONS.at(-1)!.date
    for (const l of daniel) expect(milestones(l.snapshots[last])[0].reached, l.id).toBe(true)
    for (const m of MODES) expectBalanced(getBooks()[m].ledger)
  })
  it("a returned payment resets the on-time streak, and on-time payments rebuild it", () => {
    const grace = getLoanViews().find((l) => l.id === "loan_grace-cu")!
    const ret = grace.attempts.find((a) => a.outcome === "returned")!
    const before = snapshot(grace, addDays(ret.returnedOn!, -1)).onTimeStreak
    expect(before).toBeGreaterThan(0)
    expect(snapshot(grace, ret.returnedOn!).onTimeStreak).toBe(0)
    // The retry itself doesn't count; later on-time payments do.
    expect(snapshot(grace, "2027-03-01").onTimeStreak).toBeGreaterThan(0)
    expectBalanced(getBooks().credit_union.ledger)
  })
})

describe("foreign credit report toggle (newcomer from a covered country)", () => {
  const demo = getForeignReportDemo()
  it("changes every lender's answer", () => {
    for (const m of MODES) {
      const a = demo.withReport[m]
      const b = demo.withoutReport[m]
      expect([a.outcome, a.limitCents], m).not.toEqual([b.outcome, b.limitCents])
    }
  })
  it("with the report all three approve; without it Northgate and Aspen decline and Kite caps the limit", () => {
    for (const m of MODES) expect(demo.withReport[m].outcome).toBe("approve")
    expect(demo.withoutReport.credit_union.outcome).toBe("decline")
    expect(demo.withoutReport.bank.outcome).toBe("decline")
    expect(demo.withoutReport.fintech.limitCents).toBeLessThan(demo.withReport.fintech.limitCents)
  })
  it("is not Daniel, whose country isn't covered", () => {
    expect(demo.story).toMatch(/covered by foreign credit report programs/)
  })
})
