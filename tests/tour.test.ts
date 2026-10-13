import { describe, expect, it } from "vitest"
import { tabForHash } from "@/components/how-it-works/how-it-works-tabs"
import { APP_SECTIONS } from "@/components/site/app-nav"
import { TOUR_APPLICANT, TOUR_STEPS } from "@/content/tour"
import { getApplicant, getLoanView, getOpsItems } from "@/lib/data"
import { formatCents } from "@/lib/money"
import { LEGACY_REDIRECTS, RENAMED_SLUGS } from "@/next.config"

const step = (title: string) => TOUR_STEPS.find((s) => s.title.startsWith(title))!
const view = getApplicant(TOUR_APPLICANT)!

describe("guided tour", () => {
  it("has six steps on real product pages, each pointing at one area", () => {
    expect(TOUR_STEPS).toHaveLength(6)
    for (const s of TOUR_STEPS) {
      expect(s.href, s.title).toMatch(/^\/(applications|borrower|loans|operations)(\/|\?|$)/)
      expect(s.target, s.title).toMatch(/^[a-z-]+$/)
      // One sentence or two short ones, never a paragraph.
      expect(s.text.length, s.title).toBeLessThan(260)
    }
  })

  it("verify: Hollis clears every check automatically", () => {
    expect(view.verification.checks.every((c) => c.result === "pass")).toBe(true)
    expect(step("Verify").text).toMatch(/clears every one automatically/)
  })

  it("decide: the three answers in the text are the engine's", () => {
    const d = view.decisions
    expect(d.bank.outcome).toBe("decline")
    expect(step("Three lenders").text).toContain(`Kite offers an ${formatCents(d.fintech.limitCents, { whole: true })} line`)
    expect(step("Three lenders").text).toContain(`Northgate structures a ${formatCents(d.credit_union.limitCents, { whole: true })} seasonal line`)
  })

  it("fund: Northgate's line waits for the Branch Manager's sign-off", () => {
    const loan = getLoanView("loan_hollis-family-farm-cu")!
    expect(loan.gate.map((g) => g.label)).toContain("Branch Manager sign-off (maker-checker)")
    expect(loan.draws).not.toBeNull()
  })

  it("collect: the Kite line has an NSF return, retried and cured, before the step's simulated date", () => {
    const s = step("Collect")
    const loan = getLoanView("loan_hollis-family-farm-kite")!
    expect(s.href).toBe(`/loans/${loan.id}`)
    const ret = loan.events.find((e) => e.type === "debit_returned" && e.code === "901")!
    const cured = loan.events.find((e) => e.type === "cured")!
    expect(ret.date.startsWith("2027-03")).toBe(true)
    expect(cured.date <= s.clock!).toBe(true)
    // It says which line, because Northgate's never misses a payment.
    expect(getLoanView("loan_hollis-family-farm-cu")!.events.some((e) => e.type === "debit_returned")).toBe(false)
    expect(s.text).toMatch(/line at Kite/)
  })

  it("operations: Hollis's sign-off is open in the queue at the step's moment", () => {
    const s = step("Operations")
    const item = getOpsItems().find((i) => i.id === `q_signoff-${TOUR_APPLICANT}-cu`)!
    expect(s.href).toBe(`/operations?queue=${item.queue}`)
    expect(item.createdAt <= s.opsMoment!).toBe(true)
    expect(item.completedAt! > s.opsMoment!).toBe(true)
  })
})

describe("navigation", () => {
  it("every old URL has a permanent redirect to its new home", () => {
    const sources = LEGACY_REDIRECTS.map((r) => r.source)
    for (const old of ["/workbench", "/workbench/:id", "/compare/:id", "/apply", "/consents", "/ops", "/ops/dashboard", "/ops/loans", "/ops/loans/:id", "/methodology", "/accuracy"]) {
      expect(sources, old).toContain(old)
    }
  })

  it("every renamed business's old slug redirects to its new one", () => {
    for (const [from, to] of Object.entries(RENAMED_SLUGS)) {
      expect(LEGACY_REDIRECTS.find((r) => r.source === `/applications/${from}`)?.destination, from).toBe(`/applications/${to}`)
      expect(LEGACY_REDIRECTS.find((r) => r.source === `/loans/loan_${from}-:lender`)?.destination, from).toBe(`/loans/loan_${to}-:lender`)
    }
  })

  it("old anchors land on the How it works tab that holds them", () => {
    expect(tabForHash("#regulatory-status")).toBe("canadian-rules")
    expect(tabForHash("#status-cdb-act")).toBe("canadian-rules")
    expect(tabForHash("#misses")).toBe("test-results")
    expect(tabForHash("#money")).toBe("how-it-decides")
    expect(tabForHash("")).toBeNull()
  })

  it("has the four plain-named sections", () => {
    expect(APP_SECTIONS.map((s) => s.label)).toEqual(["Applications", "Borrower view", "Loans", "Operations"])
    expect(APP_SECTIONS.find((s) => s.id === "operations")!.pages.map((p) => p.label)).toEqual(["Queues", "Team", "Policy", "Audit", "Dashboard"])
  })
})
