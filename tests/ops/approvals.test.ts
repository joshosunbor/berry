import { describe, expect, it } from "vitest"
import { approve, MakerCheckerViolation, NotAuthorized, prepare, reject, requiredRoleFor, roleFor } from "@/lib/ops/approvals"
import { AuditLog } from "@/lib/ops/audit"
import { OPS } from "@/lib/ops/config"

const subject = { kind: "decision" as const, id: "dec_test" }
const AT = "2026-10-01T10:00"
const req = (log: AuditLog, amountCents: number, preparedBy = "usr_bisset", minimumRole?: "lead") =>
  prepare(log, { id: "apv_test", kind: "credit_signoff", subject, amountCents, summary: "test", preparedBy, at: AT, minimumRole })

describe("maker-checker", () => {
  it("the person who prepared an action can never approve it", () => {
    for (const m of OPS.team) {
      const log = new AuditLog()
      const r = req(log, 100_00, m.id)
      expect(() => approve(log, r, m.id, AT)).toThrow(MakerCheckerViolation)
      expect(() => reject(log, r, m.id, AT, "no")).toThrow(MakerCheckerViolation)
    }
  })

  it("can't be bypassed after escalation: the maker still can't approve at any level", () => {
    const log = new AuditLog()
    // A lead prepares $350,000; the branch manager escalates it to the committee; the lead still can't approve.
    let r = req(log, 350_000_00, "usr_moreau")
    r = approve(log, r, "usr_lindqvist", AT)
    expect(r.status).toBe("pending")
    expect(() => approve(log, r, "usr_moreau", AT)).toThrow(MakerCheckerViolation)
  })

  it("a blocked attempt is itself audited and leaves the request unchanged", () => {
    const log = new AuditLog()
    const r = req(log, 100_00)
    expect(() => approve(log, r, "usr_bisset", AT)).toThrow()
    expect(log.all.at(-1)!.action).toBe("approval.blocked")
    expect(r.status).toBe("pending")
  })

  it("requests are frozen, so status can't be set directly", () => {
    const r = req(new AuditLog(), 100_00)
    expect(Object.isFrozen(r)).toBe(true)
    expect(() => ((r as { status: string }).status = "approved")).toThrow()
  })

  it("unknown people can't prepare or approve", () => {
    const log = new AuditLog()
    expect(() => req(log, 100, "usr_nobody")).toThrow(NotAuthorized)
    expect(() => approve(log, req(log, 100), "usr_nobody", AT)).toThrow(NotAuthorized)
  })

  it("a decided request can't be decided again", () => {
    const log = new AuditLog()
    const r = approve(log, req(log, 100_00), "usr_moreau", AT)
    expect(() => approve(log, r, "usr_lindqvist", AT)).toThrow(/already approved/)
  })
})

describe("delegated authority", () => {
  it("maps amounts to the least senior role whose limit covers them", () => {
    expect(roleFor(10_000_00)).toBe("analyst")
    expect(roleFor(10_000_01)).toBe("lead")
    expect(roleFor(50_000_00)).toBe("lead")
    expect(roleFor(250_000_01)).toBe("credit_committee")
    expect(requiredRoleFor(100_00, "lead")).toBe("lead")
  })

  it.each([
    ["an analyst approving $15,000 escalates to a lead", 15_000_00, "usr_rivera", "lead"],
    ["a lead approving $60,000 escalates to the branch manager", 60_000_00, "usr_moreau", "branch_manager"],
    ["a branch manager approving $350,000 escalates to the credit committee", 350_000_00, "usr_lindqvist", "credit_committee"],
  ] as const)("%s", (_, amount, checker, to) => {
    const log = new AuditLog()
    const r = approve(log, req(log, amount, "usr_bisset"), checker, AT)
    expect(r.status).toBe("pending")
    expect(r.escalations.at(-1)!.to).toBe(to)
    expect(log.all.at(-1)!.action).toBe("approval.escalated")
  })

  it("escalation never lowers the role needed: a lead can't pass committee-level approval to the branch manager", () => {
    const log = new AuditLog()
    let r = req(log, 350_000_00)
    r = approve(log, r, "usr_moreau", AT)
    expect(r.requiredRole).toBe("credit_committee")
    r = approve(log, r, "usr_lindqvist", AT)
    expect(r.status).toBe("pending")
    r = approve(log, r, "usr_committee", AT)
    expect(r.status).toBe("approved")
    expect(r.escalations.map((e) => e.to)).toEqual(["branch_manager", "credit_committee"])
  })

  it("approves within the checker's limit", () => {
    const log = new AuditLog()
    const r = approve(log, req(log, 40_000_00), "usr_moreau", AT)
    expect(r).toMatchObject({ status: "approved", decidedBy: "usr_moreau" })
  })

  it("a kind's minimum role holds even for small amounts (hardship needs a lead)", () => {
    const log = new AuditLog()
    const r = approve(log, req(log, 500_00, "usr_bisset", "lead"), "usr_rivera", AT)
    expect(r.status).toBe("pending")
  })
})
