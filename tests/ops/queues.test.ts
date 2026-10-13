import { describe, expect, it } from "vitest"
import { getCast, getLoanViews, getOpsDecisions, getOpsItems } from "@/lib/data"
import { OPS } from "@/lib/ops/config"
import { buildItems, isOpen, nextCommitteeMeeting, runTeam, slaState } from "@/lib/ops/queues"
import { PLAYBOOKS } from "@/lib/ops/playbooks"
import { addBusinessHours, addBusinessMinutes, nextBusinessMoment } from "@/lib/ops/time"
import { FUNDING_AFTER_PAYEE_CONFIRMATION, FUNDING_INITIATED_AT } from "@/lib/servicing/portfolio"
import { QueueName } from "@/lib/schemas"

const items = getOpsItems()
const byQueue = (q: string) => items.filter((i) => i.queue === q)

describe("queues are fed only by real open items", () => {
  it("every queue has items and a playbook", () => {
    for (const q of QueueName.options) {
      expect(byQueue(q).length, q).toBeGreaterThan(0)
      expect(PLAYBOOKS[q].steps.length).toBeGreaterThan(2)
      expect(OPS.queues[q].slaBusinessHours).toBeGreaterThan(0)
    }
  })

  it("verification items are exactly the checks that need review", () => {
    const expected = getCast().flatMap((c) => c.verification.checks.filter((x) => x.result === "needs_review").map((x) => x.id))
    expect(byQueue("verification").map((i) => i.subject.id).sort()).toEqual(expected.sort())
    expect(expected.length).toBeGreaterThan(0)
  })

  it("FINTRAC items are exactly the large cash events", () => {
    const expected = getCast().filter((c) => c.largeCash.length > 0).map((c) => `apl_${c.applicant.slug}`)
    expect(byQueue("fintrac_review").map((i) => i.subject.id)).toEqual(expected)
    expect(expected).toEqual(["apl_fennick-hardware"])
  })

  it("credit items are Northgate's approvals that need sign-off plus every referral", () => {
    const expected = getCast().flatMap((c) => [
      ...(["approve", "approve_with_conditions"].includes(c.decisions.credit_union.outcome) && c.decisions.credit_union.approver ? [c.decisions.credit_union.id] : []),
      ...Object.values(c.decisions).filter((d) => d.outcome === "refer").map((d) => d.id),
    ])
    expect(byQueue("credit_referral").map((i) => i.subject.id).sort()).toEqual(expected.sort())
    for (const i of byQueue("credit_referral")) expect(i.approval).toBeDefined()
  })

  it("servicing and operations agree: re-simulating with the team's decisions doesn't move them", () => {
    const { used, final, rounds } = getOpsDecisions()
    expect(Object.keys(final.hardship).length).toBeGreaterThan(0)
    expect(Object.keys(final.signOff).length).toBeGreaterThan(0)
    expect(final).toEqual(used)
    expect(rounds).toBeLessThanOrEqual(4)
  })

  it("collections, hardship and reconciliation items come from the simulator's events and breaks", () => {
    const loans = getLoanViews()
    const outreach = loans.flatMap((l) => l.events.filter((e) => ["outreach_task", "banking_details_requested", "borrower_contacted"].includes(e.type)))
    expect(byQueue("collections")).toHaveLength(outreach.length)
    expect(byQueue("hardship")).toHaveLength(loans.flatMap((l) => l.events.filter((e) => e.type === "hardship_offered")).length)
    expect(byQueue("reconciliation")).toHaveLength(loans.flatMap((l) => l.breaks).length)
    expect(byQueue("reconciliation").map((i) => i.title).sort()).toEqual(["Fennick Hardware: returned PAD not applied", "Grace: timing difference"])
  })

  it("payee confirmation holds Grace's close match on an instant rail, released before funding", () => {
    const [p] = byQueue("payee_confirmation")
    expect(byQueue("payee_confirmation")).toHaveLength(1)
    expect(p.subject.id).toBe("loan_grace-kite")
    const loan = getLoanViews().find((l) => l.id === "loan_grace-kite")!
    expect(loan.funding.rail).not.toBe("aft")
    expect(loan.funding.initiatedAt).toBe(FUNDING_AFTER_PAYEE_CONFIRMATION)
    expect(p.completedAt! <= FUNDING_AFTER_PAYEE_CONFIRMATION).toBe(true)
  })

  it("an empty source builds no items", () => {
    expect(buildItems({ verification: [], largeCash: [], decisions: [], loans: [], payee: [] })).toEqual([])
  })
})

describe("the simulated team", () => {
  it("is deterministic", () => {
    const again = runTeam(buildItems({ verification: [], largeCash: [], decisions: [], loans: getLoanViews(), payee: [] }))
    const twice = runTeam(buildItems({ verification: [], largeCash: [], decisions: [], loans: getLoanViews(), payee: [] }))
    expect(again.items).toEqual(twice.items)
    expect(again.log.all.map((e) => e.hash)).toEqual(twice.log.all.map((e) => e.hash))
  })

  it("never has the preparer approve, and approvals sit within the approver's authority", () => {
    for (const i of items.filter((x) => x.approval && x.completedAt)) {
      expect(i.approverId).not.toBe(i.ownerId)
      const approver = OPS.team.find((m) => m.id === i.approverId)!
      const limit = OPS.authority[approver.role].limitCents
      expect(limit === null || i.approval!.amountCents <= limit, i.id).toBe(true)
    }
  })

  it("only works in business hours, one item at a time per person", () => {
    const steps = items.flatMap((i) => i.steps).filter((s) => s.who !== "usr_committee")
    for (const s of steps) {
      expect(nextBusinessMoment(s.start)).toBe(s.start)
      expect(Number(s.end.slice(11, 13)) * 60 + Number(s.end.slice(14))).toBeLessThanOrEqual(OPS.businessHours.end * 60)
    }
    const byPerson = Object.groupBy(steps, (s) => s.who)
    for (const list of Object.values(byPerson)) {
      const sorted = [...list!].sort((a, b) => a.start.localeCompare(b.start))
      for (let k = 1; k < sorted.length; k++) expect(sorted[k].start >= sorted[k - 1].end).toBe(true)
    }
  })

  it("credit sign-offs are approved before the loans are funded", () => {
    for (const i of byQueue("credit_referral").filter((x) => x.mode === "credit_union" && x.id.startsWith("q_signoff"))) expect(i.completedAt! <= FUNDING_INITIATED_AT, i.id).toBe(true)
  })

  it("some, but not all, items miss their service level", () => {
    const end = "2027-10-06T17:00"
    const states = items.map((i) => slaState(i, end))
    const late = states.filter((s) => s === "missed" || s === "breached").length
    expect(late).toBeGreaterThan(0)
    expect(late).toBeLessThan(items.length / 2)
    // The unapplied return can't be closed until a ledger correction is approved: it stays open and breached.
    const blocked = items.find((i) => i.blockedReason)!
    expect(isOpen(blocked, end)).toBe(true)
    expect(slaState(blocked, end)).toBe("breached")
  })
})

describe("service levels", () => {
  const it0 = { createdAt: "2026-10-01T09:00", slaDueAt: "2026-10-01T17:00", completedAt: null }
  it.each([
    ["2026-10-01T09:00", "on_time"],
    ["2026-10-01T14:59", "on_time"],
    ["2026-10-01T15:00", "at_risk"],
    ["2026-10-01T17:00", "at_risk"],
    ["2026-10-01T17:01", "breached"],
  ] as const)("at %s an open item is %s", (now, state) => expect(slaState(it0, now)).toBe(state))

  it("done items are met or missed", () => {
    expect(slaState({ ...it0, completedAt: "2026-10-01T17:00" }, "2026-10-09T00:00")).toBe("met")
    expect(slaState({ ...it0, completedAt: "2026-10-02T09:01" }, "2026-10-09T00:00")).toBe("missed")
    expect(slaState({ ...it0, completedAt: "2026-10-02T09:01" }, "2026-10-01T16:00")).toBe("at_risk")
  })

  it("counts business hours only", () => {
    expect(addBusinessHours("2026-10-02T15:00", 4)).toBe("2026-10-05T11:00") // Friday afternoon → Monday
    expect(addBusinessMinutes("2026-10-01T16:50", 20)).toBe("2026-10-02T09:10")
    expect(nextBusinessMoment("2026-10-03T12:00")).toBe("2026-10-05T09:00") // Saturday
  })

  it("the Credit Committee meets on Mondays", () => {
    expect(nextCommitteeMeeting("2026-10-01T11:00")).toBe("2026-10-05T15:00")
    expect(nextCommitteeMeeting("2026-10-05T14:00")).toBe("2026-10-05T15:00")
    expect(nextCommitteeMeeting("2026-10-05T15:30")).toBe("2026-10-12T15:00")
  })
})
