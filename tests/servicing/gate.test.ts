import { describe, expect, it } from "vitest"
import { getAuditEvents, getCast, getLoanViews } from "@/lib/data"
import { addBusinessDays } from "@/lib/rules/nsf"
import { SERVICING } from "@/lib/servicing/config"
import { DECIDED_AT, fundingGate } from "@/lib/servicing/gate"
import { FUNDING_INITIATED_AT } from "@/lib/servicing/portfolio"

const cast = (slug: string) => getCast().find((c) => c.applicant.slug === slug)!
const base = { lastNsfDate: null, earliest: FUNDING_INITIATED_AT, documentsBusinessDays: SERVICING.documentsReceivedBusinessDays }

describe("pre-funding gate", () => {
  it("funds a clean automated approval at the earliest funding time", () => {
    const g = fundingGate({ ...base, decision: cast("priya").decisions.fintech })
    expect(g.checks).toEqual([])
    expect(g.readyAt).toBe(FUNDING_INITIATED_AT)
  })

  it("waits for the delegated-authority sign-off, and doesn't fund while it's pending", () => {
    const decision = cast("priya").decisions.credit_union
    expect(fundingGate({ ...base, decision, signOffAt: null }).readyAt).toBeNull()
    expect(fundingGate({ ...base, decision, signOffAt: "2026-10-07T14:00" }).readyAt).toBe("2026-10-07T14:00")
  })

  it("waits for Aspen's documents (simulated arrival)", () => {
    const g = fundingGate({ ...base, decision: cast("priya").decisions.bank })
    const docs = g.checks.find((c) => c.kind === "documents")!
    expect(docs.clearedAt).toBe(`${addBusinessDays(DECIDED_AT.slice(0, 10), SERVICING.documentsReceivedBusinessDays)}T09:00`)
    expect(g.readyAt! >= docs.clearedAt!).toBe(true)
  })

  it("holds Corner Grind at Northgate until 90 days after its last returned payment", () => {
    const c = cast("corner-grind-cafe")
    expect(c.decisions.credit_union.fundingConditions).toEqual([{ kind: "no_recent_returns", days: 90 }])
    const g = fundingGate({ ...base, decision: c.decisions.credit_union, lastNsfDate: c.features.lastNsfDate, signOffAt: "2026-10-01T11:15", verification: "2026-10-01T09:25" })
    const lastNsf = c.features.lastNsfDate!
    const clears = new Date(Date.parse(`${lastNsf}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10)
    expect(g.readyAt).toBe(`${clears}T09:00`)
  })

  it("never funds after a failed identity check", () => {
    expect(fundingGate({ ...base, decision: cast("priya").decisions.fintech, verification: "failed" }).readyAt).toBeNull()
  })
})

describe("every funded loan cleared its gate first", () => {
  it("funding starts only after every check cleared, and the clearance is in the audit trail", () => {
    const cleared = new Set(getAuditEvents().filter((e) => e.action === "loan.funding_gate_cleared").map((e) => e.subject.id))
    for (const l of getLoanViews()) {
      expect(l.gate.length >= 0).toBe(true)
      for (const c of l.gate) {
        expect(c.clearedAt, `${l.id} ${c.kind}`).not.toBeNull()
        expect(l.funding.initiatedAt >= c.clearedAt!, `${l.id} ${c.kind}`).toBe(true)
      }
      expect(cleared.has(l.id), l.id).toBe(true)
    }
    const cg = getLoanViews().find((l) => l.id === "loan_corner-grind-cafe-cu")!
    expect(cg.funding.initiatedAt > "2026-12-01").toBe(true)
    // Its schedule starts after funding, not before.
    expect(cg.schedule[0].date > cg.funding.fundedOn).toBe(true)
  })
})
