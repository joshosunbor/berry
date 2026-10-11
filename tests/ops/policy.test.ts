import { describe, expect, it } from "vitest"
import { decide } from "@/lib/engine/decide"
import { CONFIGS } from "@/lib/engine/config"
import { computeFeatures } from "@/lib/engine/features"
import { loadApplicants } from "@/lib/evaluation/load"
import { getPolicyCases } from "@/lib/data"
import { MakerCheckerViolation } from "@/lib/ops/approvals"
import { AuditLog } from "@/lib/ops/audit"
import { decideProposal, impactOf, POLICY_FIELDS, PolicyError, proposeChange, proposeRollback, versionHistory, type PolicyProposal } from "@/lib/ops/policy"
import { MODES } from "@/lib/modes"
import { toEngineInput } from "@/lib/schemas"
import path from "node:path"

const cases = getPolicyCases()
const AT = "2026-10-05T09:00"
const bank = CONFIGS.bank

const propose = (log: AuditLog, values: Record<string, number>, by = "usr_moreau", current = bank) =>
  proposeChange(log, { mode: "bank", current, values, why: "Accept steadier seasonal income at Aspen.", by, at: AT, cases })

describe("impact preview inputs", () => {
  it("decisions without transactions match the published ones exactly, apart from FINTRAC flags (read from transactions, never a credit factor)", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const credit = ({ flags, ...rest }: ReturnType<typeof decide>) => rest
    const full = [...loadApplicants(path.join(process.cwd(), "data/applicants")), ...loadApplicants(path.join(process.cwd(), "data/planted"))]
    expect(cases).toHaveLength(full.length)
    for (const a of full) {
      const c = cases.find((x) => x.slug === a.slug)!
      expect(c.input.transactions).toEqual([])
      const input = toEngineInput(a)
      for (const m of MODES) expect(credit(decide(c.input, m, CONFIGS[m], c.features))).toEqual(credit(decide(input, m, CONFIGS[m], computeFeatures(input))))
    }
  })

  it("covers the cast and the planted cases", () => {
    expect(cases.filter((c) => c.group === "cast").length).toBeGreaterThanOrEqual(14)
    expect(cases.filter((c) => c.group === "planted").length).toBeGreaterThanOrEqual(30)
  })
})

describe("impact", () => {
  it("no change, no impact", () => {
    const i = impactOf("bank", bank, bank, cases)
    for (const m of MODES) expect(i.byLender[m].cast.length + i.byLender[m].planted.length).toBe(0)
  })

  it("loosening Aspen's income-variation rule changes some Aspen decisions and nobody else's, and lists which", () => {
    const log = new AuditLog()
    const p = propose(log, { maxIncomeCv: 1.5 })
    const aspen = p.impact.byLender.bank
    expect(aspen.cast.length + aspen.planted.length).toBeGreaterThan(0)
    expect(p.impact.byLender.credit_union.cast).toHaveLength(0)
    expect(p.impact.byLender.fintech.planted).toHaveLength(0)
    expect(aspen.cast.map((c) => c.slug)).toContain("hollis-family-farm")
    for (const c of [...aspen.cast, ...aspen.planted]) expect(c.from).not.toEqual(c.to)
    expect(aspen.casesChecked.planted).toBeGreaterThanOrEqual(30)
  })
})

describe("maker-checker on policy", () => {
  it("the preparer can't approve their own change", () => {
    const log = new AuditLog()
    const p = propose(log, { minDscr: 1.4 }, "usr_lindqvist")
    expect(() => decideProposal(log, p, { checker: "usr_lindqvist", at: AT, verdict: "approve", currentVersion: 1, impactReviewed: true })).toThrow(MakerCheckerViolation)
  })

  it("can't be approved before the impact is reviewed", () => {
    const log = new AuditLog()
    const p = propose(log, { minDscr: 1.4 })
    expect(() => decideProposal(log, p, { checker: "usr_lindqvist", at: AT, verdict: "approve", currentVersion: 1, impactReviewed: false })).toThrow(/Review the impact/)
  })

  it("needs a branch manager or above: a lead escalates", () => {
    const log = new AuditLog()
    const p = propose(log, { minDscr: 1.4 }, "usr_rivera")
    const r = decideProposal(log, p, { checker: "usr_moreau", at: AT, verdict: "approve", currentVersion: 1, impactReviewed: true })
    expect(r.activated).toBe(false)
    expect(r.proposal.request.escalations.at(-1)?.to).toBe("branch_manager")
    const r2 = decideProposal(log, r.proposal, { checker: "usr_lindqvist", at: AT, verdict: "approve", currentVersion: 1, impactReviewed: true })
    expect(r2.activated).toBe(true)
    expect(log.all.at(-1)!.action).toBe("policy.activated")
    expect(log.verify()).toBeNull()
  })

  it("a stale proposal (prepared against an older version) can't be approved", () => {
    const log = new AuditLog()
    const p = propose(log, { minDscr: 1.4 })
    expect(() => decideProposal(log, p, { checker: "usr_lindqvist", at: AT, verdict: "approve", currentVersion: 2, impactReviewed: true })).toThrow(/prepared against v1/)
  })

  it("rejects bad values and empty changes", () => {
    const log = new AuditLog()
    expect(() => propose(log, { minDscr: 9 })).toThrow(PolicyError)
    expect(() => propose(log, { notAField: 1 })).toThrow(PolicyError)
    expect(() => propose(log, { maxNsf12m: 1.5 })).toThrow(/whole number/)
    expect(() => propose(log, { minDscr: bank.thresholds.minDscr })).toThrow(/Nothing would change/)
    expect(() => proposeChange(log, { mode: "bank", current: bank, values: { minDscr: 1.4 }, why: "short", by: "usr_moreau", at: AT, cases })).toThrow(/Say why/)
  })

  it("every editable field exists in the published config", () => {
    for (const m of MODES) for (const fld of POLICY_FIELDS[m]) expect(CONFIGS[m].thresholds[fld.key], `${m}.${fld.key}`).toBeTypeOf("number")
  })
})

describe("versions and rollback", () => {
  const approveAs = (log: AuditLog, p: PolicyProposal, checker: string, currentVersion: number) =>
    decideProposal(log, p, { checker, at: AT, verdict: "approve", currentVersion, impactReviewed: true }).proposal

  it("keeps every version; a rollback is a new version copying an earlier one, through maker-checker", () => {
    const log = new AuditLog()
    const v2 = approveAs(log, propose(log, { maxIncomeCv: 1.5 }), "usr_lindqvist", 1)
    let history = versionHistory("bank", bank, [v2])
    expect(history.map((h) => h.version)).toEqual([1, 2])
    const current = history.at(-1)!.config
    expect(current.thresholds.maxIncomeCv).toBe(1.5)

    const rb = proposeRollback(log, { mode: "bank", current, target: history[0], why: "Too many irregular-income approvals in review.", by: "usr_moreau", at: AT, cases })
    expect(rb.proposed.version).toBe(3)
    expect(rb.proposed.thresholds).toEqual(bank.thresholds)
    expect(rb.impact.byLender.bank.cast.length).toBe(v2.impact.byLender.bank.cast.length)
    expect(() => approveAs(log, rb, "usr_moreau", 2)).toThrow(MakerCheckerViolation)
    const done = approveAs(log, rb, "usr_lindqvist", 2)
    history = versionHistory("bank", bank, [v2, done])
    expect(history.map((h) => [h.version, h.kind, h.rollbackTo])).toEqual([
      [1, "initial", undefined],
      [2, "change", undefined],
      [3, "rollback", 1],
    ])
    expect(log.all.map((e) => e.action)).toContain("policy.rolled_back")
    expect(log.verify()).toBeNull()
  })

  it("can't roll back to the current or a later version", () => {
    const log = new AuditLog()
    const history = versionHistory("bank", bank, [])
    expect(() => proposeRollback(log, { mode: "bank", current: bank, target: history[0], why: "No reason to do this at all.", by: "usr_moreau", at: AT, cases })).toThrow(/earlier version/)
  })

  it("rejected proposals never become versions", () => {
    const log = new AuditLog()
    const p = propose(log, { minDscr: 1.4 })
    const r = decideProposal(log, p, { checker: "usr_lindqvist", at: AT, verdict: "reject", currentVersion: 1, impactReviewed: false, reason: "Too tight." })
    expect(versionHistory("bank", bank, [r.proposal])).toHaveLength(1)
  })
})
