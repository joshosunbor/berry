import { describe, expect, it } from "vitest"
import { getAuditEvents, getLoanViews, getOpsEventItems, getOpsItems } from "@/lib/data"
import { verifyChain } from "@/lib/ops/audit"
import { messageFor } from "@/lib/ops/communications"
import { DASHBOARD_START, OPS_MOMENTS } from "@/lib/ops/moments"
import { assign, auditAt, complete, decide, itemAt, messageSent, prepareItem, suggestOwner, trailFor, workload, type UserAction } from "@/lib/ops/view"

const items = getOpsItems()
const events = getAuditEvents()
const eventItems = getOpsEventItems()
const find = (id: string) => items.find((i) => i.id === id)!
const states = (now: string, actions: UserAction[] = []) => new Map(items.map((i) => [i.id, itemAt(i, now, actions)]))

describe("the dashboard's first view", () => {
  it("opens twelve months on, with a funded book, not on day one when nothing has happened", () => {
    expect(DASHBOARD_START).toBe(OPS_MOMENTS.at(-1)!.at)
    const funded = getLoanViews().filter((l) => l.funding.fundedOn <= DASHBOARD_START.slice(0, 10))
    expect(funded.length).toBeGreaterThan(20)
  })
})

describe("the console at a point in time", () => {
  it("every moment has something open", () => {
    for (const m of OPS_MOMENTS) {
      const open = [...states(m.at).values()].filter((s) => s.status === "open")
      expect(open.length, m.label).toBeGreaterThan(0)
    }
  })

  it("matches the simulation when nobody acts in the browser", () => {
    const end = "2027-12-31T00:00"
    for (const i of items) {
      const s = itemAt(i, end, [])
      expect(s.completedAt).toBe(i.completedAt)
      if (i.approval && i.completedAt) expect(s.request?.status).toBe("approved")
    }
  })

  it("large sign-offs wait for the committee and are breached on Oct 5", () => {
    const s = itemAt(find("q_signoff-bright-smile-dental-cu"), "2026-10-05T09:00", [])
    expect(s.status).toBe("open")
    expect(s.sla).toBe("breached")
    expect(s.request?.escalations.map((e) => e.to)).toEqual(["branch_manager", "credit_committee"])
  })

  it("the audit trail as of a moment only holds events up to it, and verifies", () => {
    for (const m of OPS_MOMENTS) {
      const log = auditAt(events, eventItems, items, [], m.at)
      expect(log.verify()).toBeNull()
      expect(log.all.every((e) => e.at <= m.at)).toBe(true)
    }
    expect(auditAt(events, eventItems, items, [], "2099-01-01T00:00").all.map((e) => e.hash)).toEqual(events.map((e) => e.hash))
  })
})

describe("acting in the console", () => {
  const T = "2026-10-01T10:00"
  const item = find("q_signoff-bright-smile-dental-cu")

  it("the maker can't approve their own preparation, and the blocked attempt is recorded", () => {
    const fresh = find("q_payee-grace-kite")
    const at = "2026-10-06T10:05"
    const p = prepareItem(fresh, "usr_okafor", at)
    expect(p.error).toBeNull()
    const d = decide(fresh, p.action.request!, "usr_okafor", at, "approve", "", p.action.events)
    expect(d.error).toMatch(/can't approve/)
    expect(d.action.kind).toBe("blocked")
    expect(d.action.events.map((e) => e.action)).toEqual(["approval.blocked"])
    const s = itemAt(fresh, at, [p.action, d.action])
    expect(s.status).toBe("open")
    expect(s.request?.preparedBy).toBe("usr_okafor")
  })

  it("a different person approves; above their authority it escalates", () => {
    const p = prepareItem(item, "usr_bisset", T)
    const lead = decide(item, p.action.request!, "usr_moreau", T, "approve", "", p.action.events)
    expect(lead.action.kind).toBe("escalated")
    const bm = decide(item, lead.action.request!, "usr_lindqvist", T, "approve", "", [...p.action.events, ...lead.action.events])
    expect(bm.action.kind).toBe("escalated")
    const cc = decide(item, bm.action.request!, "usr_committee", T, "approve", "", [...p.action.events, ...lead.action.events, ...bm.action.events])
    expect(cc.action.kind).toBe("approved")
    const s = itemAt(item, T, [p.action, lead.action, bm.action, cc.action])
    expect(s.status).toBe("done")
    expect(s.completedAt).toBe(T)
  })

  it("taking over an item drops the team's later steps from the trail, which still verifies", () => {
    const p = prepareItem(item, "usr_bisset", T)
    const later = "2026-10-06T12:00"
    const log = auditAt(events, eventItems, items, [p.action], later)
    expect(verifyChain(log.all)).toBeNull()
    const forItem = log.all.filter((e) => e.subject.id === item.subject.id)
    expect(forItem.filter((e) => e.actor.id === "usr_committee")).toHaveLength(0)
    expect(forItem.some((e) => e.action === "approval.prepared" && e.at === T)).toBe(true)
  })

  it("a request the simulated team prepared can be decided in the browser, checked against the server's trail", () => {
    // Bright Smile's sign-off: prepared by an analyst on Oct 1, waiting for the committee.
    const prep = item.steps.find((s) => s.action === "prepared")!
    const at = prep.end
    const req = itemAt(item, at, []).request!
    expect(req.status).toBe("pending")
    const trail = trailFor(item, events, eventItems, [], at)
    // The analyst who prepared it still can't approve it; someone else can act on it.
    expect(decide(item, req, req.preparedBy, at, "approve", "", trail).error).toMatch(/can't approve/)
    const other = decide(item, req, "usr_moreau", at, "approve", "", trail)
    expect(other.error).toBeNull()
  })

  it("approval items can't just be marked done", () => {
    expect(complete(item, "usr_moreau", T).error).toMatch(/needs an approval/)
  })

  it("the unapplied return is closed only by an approved ledger correction", () => {
    const brk = items.find((i) => i.blockedReason)!
    const at = "2027-02-01T09:05"
    expect(brk.approval?.kind).toBe("ledger_correction")
    const p = prepareItem(brk, "usr_tran", at)
    const a = decide(brk, p.action.request!, "usr_moreau", at, "approve", "", p.action.events)
    expect(a.action.kind).toBe("approved")
    expect(itemAt(brk, "2027-10-06T17:00", [p.action, a.action]).sla).toBe("met")
  })

  it("assignments, messages and auto-assign are audited", () => {
    const v = find("q_ver-lakeside-lodge-business_registration")
    const s = itemAt(v, "2026-10-01T09:00", [])
    const load = workload(items, states("2026-10-01T09:00"))
    const who = suggestOwner(v, load)!
    expect(["usr_rivera", "usr_tran", "usr_bisset"]).toContain(who)
    const a = assign(v, s, who, "usr_moreau", "2026-10-01T09:00", true)
    expect(a.action.events[0]).toMatchObject({ action: "queue_item.assigned", actor: { kind: "system" } })
    const m = messageFor(v)
    expect("message" in m).toBe(true)
    const sent = messageSent(v, "message" in m ? m.message.subject : "", "usr_tran", "2026-10-01T09:30")
    expect(sent.action.events[0].action).toBe("communication.sent")
    // A message doesn't take the item over.
    expect(itemAt(v, "2026-10-01T09:30", [sent.action]).takenOverAt).toBeNull()
  })
})

describe("customer messages", () => {
  it("no message for screening, FINTRAC or reconciliation; plain messages otherwise", () => {
    for (const i of items) {
      const m = messageFor(i)
      if (i.queue === "fintrac_review" || i.queue === "reconciliation" || i.id.includes("screening")) expect("none" in m, i.id).toBe(true)
      else {
        expect("message" in m, i.id).toBe(true)
        if ("message" in m) expect(m.message.body).not.toMatch(/sanction|fintrac|watch-list/i)
      }
    }
  })
})
