import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { REGULATORY_STATUS } from "@/lib/regulatory/status"

const rows = REGULATORY_STATUS.rows
const byId = (id: string) => {
  const r = rows.find((x) => x.id === id)
  if (!r) throw new Error(`missing row ${id}`)
  return r
}

describe("regulatory status panel", () => {
  it("every row has an https source and an as-of date no later than the panel's", () => {
    for (const r of rows) {
      expect(r.source.url, r.id).toMatch(/^https:\/\//)
      expect(r.asOf <= REGULATORY_STATUS.asOf, r.id).toBe(true)
    }
  })

  it("has unique ids", () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })

  it("marks the passed Act as enacted but not in force, the regulations as In draft, never Live", () => {
    // Royal assent March 26, 2026, but most provisions aren't in force; only the regulations are draft.
    for (const id of ["cdb-act", "cdb-consent-duration"]) expect(byId(id).status, id).toBe("Enacted, not in force")
    for (const id of ["cdb-regulations", "cdb-technical-standard"]) expect(byId(id).status, id).toBe("In draft")
    expect(rows.filter((r) => /consumer-driven|open banking/i.test(r.name + r.summary)).every((r) => r.status !== "Live")).toBe(true)
  })

  it("marks the Real-Time Rail as Launching, initial launch Q4 2026, sourced to Payments Canada", () => {
    const r = byId("rtr")
    expect(r.status).toBe("Launching")
    expect(r.effective).toBe("Initial launch Q4 2026")
    expect(r.source).toMatchObject({ url: "https://www.payments.ca/real-time-rail-payment-system", kind: "official" })
  })

  it("marks everything not confirmed from an official source as Illustrative", () => {
    for (const id of ["rtr-milestones", "equifax-coverage", "nova-transunion"]) expect(byId(id).status, id).toBe("Illustrative")
    // An Illustrative row must say why.
    for (const r of rows.filter((x) => x.status === "Illustrative")) expect(r.note, r.id).toBeTruthy()
  })

  it("states only what its source says about Real-Time Rail dates after launch", () => {
    const r = byId("rtr-milestones")
    // Payments Canada publishes no dates past the Q4 2026 launch; the press source gives only "some time in 2027".
    expect(r.summary).not.toMatch(/Q3 2027|full capacity|e-Transfer migration in 2027/i)
    expect(r.source.url).not.toContain("payments.ca")
    expect(r.source.name).toMatch(/press/i)
  })

  it("makes no ISO 20022 claim that Standard 007 doesn't make", () => {
    const r = byId("return-codes")
    expect(`${r.summary} ${r.inBerry} ${r.note ?? ""}`).not.toMatch(/ISO 20022 returns carry|no separate ISO reason-code mapping/i)
  })

  it("marks every source that isn't a regulator, government body or Payments Canada", () => {
    const official = /^https:\/\/(www\.)?(canada\.ca|payments\.ca|fintrac-canafe\.canada\.ca|cdic\.ca|laws-lois\.justice\.gc\.ca|gazette\.gc\.ca)\//
    for (const r of rows) expect(r.source.kind === "official", `${r.id}: ${r.source.url}`).toBe(official.test(r.source.url))
    const page = readFileSync(path.resolve(import.meta.dirname, "../components/how-it-works/canadian-rules.tsx"), "utf8")
    expect(page).not.toMatch(/links to its official source/)
  })

  it("How it works reads the planted-case count from the accuracy report", () => {
    const page = readFileSync(path.resolve(import.meta.dirname, "../components/how-it-works/how-it-decides.tsx"), "utf8")
    expect(page).not.toMatch(/\b\d+ planted test cases/)
    expect(page).toMatch(/totals\.cases/)
  })

  it("every claim in a row is backed by one of its sources", () => {
    const urls = (id: string) => [byId(id).source.url, ...(byId(id).moreSources ?? []).map((s) => s.url)]
    // Standard 005 defines more record types than the four Berry uses.
    expect(byId("standard-005").summary).toMatch(/including/)
    // CDIC membership is on the members list, not "What's covered".
    expect(urls("cdic")).toContain("https://www.cdic.ca/depositors/list-of-members/")
    // Provincial limits come from each insurer, and PEI's is per member, not per category.
    const cu = byId("cu-deposit-insurance")
    expect(urls("cu-deposit-insurance")).toEqual(expect.arrayContaining(["https://cudgc.ab.ca/faq/", "https://www.peicudic.com/coverage.php"]))
    expect(cu.summary).toMatch(/per member in Prince Edward Island/)
    // RTR phases and participants are in the quarterly update, not on the RTR page.
    expect(urls("rtr")).toContain("https://www.payments.ca/canadas-real-time-rail-quarterly-update-jude-pinto-2026-q3")
    // A 2024 launch release doesn't show the program still runs today.
    expect(byId("equifax-gccf").note).toMatch(/not re-confirmed/i)
  })

  it("names real banks and bureaus only in source lines, never in a row's title or summary", () => {
    for (const id of ["nova-scotiabank", "nova-transunion"]) {
      const r = byId(id)
      expect(`${r.name} ${r.summary}`, id).not.toMatch(/Scotiabank|TransUnion|Nova Credit/)
    }
    expect(byId("nova-scotiabank").source.name).toMatch(/Scotiabank/)
    expect(byId("nova-transunion").source.name + byId("nova-transunion").source.url).toMatch(/transunion/i)
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
