import { describe, expect, it } from "vitest"
import { REGULATORY_STATUS } from "@/lib/regulatory/status"

const rows = REGULATORY_STATUS.rows
const byId = (id: string) => {
  const r = rows.find((x) => x.id === id)
  if (!r) throw new Error(`missing row ${id}`)
  return r
}

describe("regulatory status panel", () => {
  it("every row has an official https source and an as-of date no later than the panel's", () => {
    for (const r of rows) {
      expect(r.source.url, r.id).toMatch(/^https:\/\//)
      expect(r.asOf <= REGULATORY_STATUS.asOf, r.id).toBe(true)
    }
  })

  it("has unique ids", () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })

  it("marks consumer-driven banking as In draft, never Live", () => {
    for (const id of ["cdb-act", "cdb-regulations", "cdb-consent-duration", "cdb-technical-standard"]) {
      expect(byId(id).status, id).toBe("In draft")
    }
    expect(rows.filter((r) => /consumer-driven|open banking/i.test(r.name + r.summary)).every((r) => r.status !== "Live")).toBe(true)
  })

  it("marks the Real-Time Rail as Launching", () => {
    expect(byId("rtr").status).toBe("Launching")
  })

  it("marks everything not confirmed from an official source as Illustrative", () => {
    for (const id of ["rtr-milestones", "equifax-coverage", "nova-transunion"]) expect(byId(id).status, id).toBe("Illustrative")
    // An Illustrative row must say why.
    for (const r of rows.filter((x) => x.status === "Illustrative")) expect(r.note, r.id).toBeTruthy()
  })

  it("cites the confirmed Consumer-Driven Banking Act facts", () => {
    expect(byId("cdb-act").effective).toMatch(/March 26, 2026/)
    expect(byId("cdb-consent-duration").summary).toMatch(/12 months/)
    expect(byId("cdb-consent-duration").source.url).toContain("laws-lois.justice.gc.ca")
  })

  it("never claims compliance or certification", () => {
    expect(JSON.stringify(REGULATORY_STATUS)).not.toMatch(/\b(compliant|certified|approved by)\b/i)
  })
})
