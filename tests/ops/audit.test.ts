import { describe, expect, it } from "vitest"
import { approve, prepare, reject } from "@/lib/ops/approvals"
import { AuditLog, GENESIS, verifyChain } from "@/lib/ops/audit"
import { getAuditEvents } from "@/lib/data"
import { AuditEvent } from "@/lib/schemas"

const subject = { kind: "loan" as const, id: "loan_test" }
const AT = "2026-10-01T10:00"
const sample = () => {
  const log = new AuditLog()
  for (let i = 0; i < 5; i++) log.append({ at: AT, actor: { kind: "user", id: "usr_tran" }, action: "note.added", subject, before: { n: i }, after: { n: i + 1 }, reason: `step ${i}` })
  return log
}

describe("audit trail", () => {
  it("chains every event to the one before it", () => {
    const events = sample().all
    expect(events[0].prevHash).toBe(GENESIS)
    events.slice(1).forEach((e, i) => expect(e.prevHash).toBe(events[i].hash))
    expect(verifyChain(events)).toBeNull()
  })

  it("records who, what, when and before/after", () => {
    const e = sample().all[2]
    expect(e).toMatchObject({ at: AT, actor: { id: "usr_tran" }, action: "note.added", subject, before: { n: 2 }, after: { n: 3 } })
  })

  it("detects an edited, removed or reordered event", () => {
    const events = sample().all.map((e) => ({ ...e }))
    expect(verifyChain(events.map((e, i) => (i === 2 ? { ...e, after: { n: 99 } } : e)))).toBe(2)
    expect(verifyChain(events.map((e, i) => (i === 3 ? { ...e, actor: { kind: "user" as const, id: "usr_moreau" } } : e)))).toBe(3)
    expect(verifyChain(events.filter((_, i) => i !== 1))).toBe(1)
    expect(verifyChain([events[1], events[0], ...events.slice(2)])).toBe(0)
  })

  it("refuses to load a tampered log", () => {
    const events = sample().all.map((e, i) => (i === 4 ? { ...e, reason: "changed" } : e))
    expect(() => new AuditLog(events)).toThrow(/verification at event 4/)
  })

  it("is append-only: no update or delete API, and what it hands out is frozen", () => {
    const log = sample()
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(log))
    expect(proto.sort()).toEqual(["all", "append", "constructor", "toCSV", "toJSON", "verify"])
    const all = log.all as AuditEvent[]
    expect(() => all.pop()).toThrow()
    expect(() => ((all[0] as { reason?: string }).reason = "x")).toThrow()
    expect(log.all).toHaveLength(5)
    expect(log.verify()).toBeNull()
  })

  it("every approval action writes exactly one event", () => {
    const log = new AuditLog()
    const count = () => log.all.length
    let r = prepare(log, { id: "apv_1", kind: "hardship", subject, amountCents: 60_000_00, summary: "x", preparedBy: "usr_okafor", at: AT })
    expect(count()).toBe(1)
    r = approve(log, r, "usr_moreau", AT)
    expect(count()).toBe(2)
    expect(() => approve(log, r, "usr_okafor", AT)).toThrow()
    expect(count()).toBe(3)
    reject(log, r, "usr_lindqvist", AT, "not affordable")
    expect(count()).toBe(4)
    expect(log.all.map((e) => e.action)).toEqual(["approval.prepared", "approval.escalated", "approval.blocked", "approval.rejected"])
  })

  it("exports every event as JSON and CSV", () => {
    const log = sample()
    expect(JSON.parse(log.toJSON())).toHaveLength(5)
    const csv = log.toCSV().split("\n")
    expect(csv).toHaveLength(6)
    expect(csv[0]).toBe("seq,at,actor,action,subject,reason,before,after,hash")
  })

  it("the operations trail is valid, in time order, and verifies", () => {
    const events = getAuditEvents()
    expect(events.length).toBeGreaterThan(50)
    events.forEach((e) => AuditEvent.parse(e))
    expect(verifyChain(events)).toBeNull()
    for (let i = 1; i < events.length; i++) expect(events[i].at >= events[i - 1].at).toBe(true)
  })
})
