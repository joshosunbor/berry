import { describe, expect, it } from "vitest"
import * as CONTENT from "@/content/landing"
import statusFile from "@/data/regulatory-status.json"
import { getApplicant, getBooks, getCast, getLoanView, getOpsItems, getPolicyCases } from "@/lib/data"
import { CONFIGS } from "@/lib/engine/config"
import { LANDING_APPLICANT, LANDING_LOAN, LANDING_POLICY_EXAMPLE, LANDING_QUEUE_AT, landingData } from "@/lib/landing/data"
import { MODES } from "@/lib/modes"
import { impactOf } from "@/lib/ops/policy"
import { slaState } from "@/lib/ops/queues"
import { outstandingAsOf } from "@/lib/servicing/views"

/*
 * Every figure on the landing page comes from the engine, the seed data,
 * the simulator or the queue engine. These tests recompute each from its
 * source; nothing on the page may be typed in.
 */

const data = landingData()
const view = getApplicant(LANDING_APPLICANT)!
const loan = getLoanView(LANDING_LOAN)!
const dollars = (s: string) => Math.round(Number(s.replace(/[^0-9.]/g, "")) * 100)

describe("landing figures are bound to their sources", () => {
  it("each lender's answer, limit, product and reasons are the engine's", () => {
    for (const m of MODES) {
      const d = view.decisions[m]
      const l = data.lenders[m]
      expect(l.outcome).toBe(d.outcome)
      if (l.approved) expect(dollars(l.headline)).toBe(d.limitCents)
      expect(l.borrowerReason).toBe(d.reasons[0].customerText)
      expect(l.lenderReason).toBe(d.reasons[0].lenderText)
    }
    expect(data.lenders.bank.headline).toBe("Declined")
    expect(data.lenders.credit_union.outcomeLabel).toBe("Approved")
  })

  it("the borrower view is plain language; the technical wording is only in the lender view", () => {
    const jargon = /\b(CV|DSCR|NSF|median|coverage|policy maximum)\b|\d\.\d+x/i
    for (const m of MODES) expect(data.lenders[m].borrowerReason, m).not.toMatch(jargon)
    for (const r of data.decisionPanel.reasons) expect(r).not.toMatch(jargon)
    expect(data.lenders.bank.lenderReason).toMatch(jargon)
  })

  it("applicant details come from the seed data", () => {
    const a = view.applicant
    expect(data.applicant.name).toBe(a.displayName)
    expect(a.province).toBe("SK")
    expect(data.applicant.province).toBe("Saskatchewan")
    expect(a.story.startsWith(data.applicant.description.split(",")[0])).toBe(true)
    expect(data.otherApplicants).toBe(getCast().length - 1)
  })

  it("the chart, months of history, tenure and products are the features'", () => {
    const f = view.features
    expect(data.months.map((m) => [m.month, m.inCents, m.outCents])).toEqual(f.monthly.map((m) => [m.month, m.inflowCents, m.outflowCents]))
    expect(data.months.filter((m) => m.peak).map((m) => Number(m.month.slice(5)))).toEqual(expect.arrayContaining(f.income.peakMonths))
    const feat = Object.fromEntries(data.features.map((x) => [x.k, x.v]))
    expect(feat["Months of history"]).toBe(String(f.windowMonths))
    expect(feat["Returned payments, 12 mo"]).toBe(String(f.nsf12m))
    expect(feat["Member since"]).toBe(view.applicant.relationship!.memberSince!.slice(0, 4))
    expect(feat["Products held"]).toBe(String(f.relationship!.productsHeld))
  })

  it("the sign-off and authority come from Northgate's tiers", () => {
    const cu = view.decisions.credit_union
    const tiers = CONFIGS.credit_union.authorityTiers!
    expect(data.decisionPanel.signOff!.title).toBe(cu.approver!.title)
    const below = tiers.find((t) => t.order === cu.approver!.order - 1)!
    expect(data.decisionPanel.signOff!.belowTitle).toBe(below.title)
    expect(dollars(data.decisionPanel.signOff!.belowLimit!)).toBe(below.maxExposureCents)
    expect(cu.limitCents).toBeGreaterThan(below.maxExposureCents!)
  })

  it("the ledger rows are the loan's journal entries, then its remaining schedule, and end at zero", () => {
    const posted = data.ledger.filter((r) => !r.scheduled)
    const last = posted.at(-1)!
    expect(last.balanceCents).toBe(outstandingAsOf(loan, last.date))
    expect(data.servicing.outstandingAtEndCents).toBe(last.balanceCents)
    for (const r of posted) expect(r.balanceCents).toBe(outstandingAsOf(loan, r.date) + posted.filter((x) => x.date === r.date && posted.indexOf(x) > posted.indexOf(r)).reduce((t, x) => t - x.amountCents, 0))
    // The simulation runs past the final payment, so every row is posted and the line is repaid.
    expect(data.ledger.filter((r) => r.scheduled)).toHaveLength(0)
    expect(data.ledger.at(-1)!.balanceCents).toBe(0)
    expect(data.servicing.paidOffOn).toBe(loan.statusTimeline.find((t) => t.status === "paid_off")!.date)
    expect(data.servicing.finalPaymentOn).toBe(loan.schedule.at(-1)!.date)
    expect(data.servicing.peakDrawnCents).toBe(29_012_03)
    expect(data.servicing.seasonInterestCents).toBe(view.pad.credit_union!.totalInterestCents)
    const tb = getBooks().credit_union.ledger.trialBalance()
    expect(data.servicing.balanced).toBe(tb.debitCents === tb.creditCents)
  })

  it("queue rows are real open items at that moment, with the queue engine's SLA state", () => {
    const open = getOpsItems().filter((i) => i.createdAt <= LANDING_QUEUE_AT && (!i.completedAt || i.completedAt > LANDING_QUEUE_AT))
    expect(data.queue.openCount).toBe(open.length)
    for (const r of data.queue.rows) {
      const item = open.find((i) => i.title === r.title)!
      expect(item, r.title).toBeDefined()
      expect(r.sla).toBe(slaState(item, LANDING_QUEUE_AT))
    }
    expect(data.queue.rows).toHaveLength(open.length)
    expect(data.queue.rows.map((r) => r.sla)).toContain("breached")
  })

  it("time to funding is the median of the simulator's funding results, by rail", () => {
    const fund = MODES.flatMap((m) => getBooks()[m].loans.map((l) => l.setup.funding))
    for (const r of data.railTimes) {
      const xs = fund.filter((x) => x.rail === r.rail).map((x) => x.timeToFundMinutes).sort((a, b) => a - b)
      expect(r.loans).toBe(xs.length)
      expect(r.minutes).toBe(xs.length % 2 ? xs[(xs.length - 1) / 2] : Math.round((xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2))
    }
    expect(data.railTimes.find((r) => r.rail === "rtr_simulated")!.label).toContain("simulated")
  })

  it("the policy-preview quote is a real impact run", () => {
    const ex = LANDING_POLICY_EXAMPLE
    const cur = CONFIGS[ex.mode]
    const cases = getPolicyCases()
    const i = impactOf(ex.mode, cur, { ...cur, version: cur.version + 1, thresholds: { ...cur.thresholds, [ex.key]: ex.to } }, cases).byLender[ex.mode]
    const n = [...i.cast, ...i.planted].filter((c) => !c.from.outcome.startsWith("approve") && c.to.outcome.startsWith("approve")).length
    expect(data.policyQuote).toContain(`approved ${n} more of the ${cases.length}`)
  })

  it("the regulatory status date is the status file's", () => {
    expect(data.statusAsOf).toBe(new Date(`${statusFile.asOf}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }))
  })
})

describe("landing copy follows the hybrid-concept brief", () => {
  const text = JSON.stringify(CONTENT)

  it("has nothing commercial and no placeholders", () => {
    for (const banned of ["Book a demo", "Pricing", "pricing", "[confirm]", "[status]", "[Legal", "hello@", "SOC 2", "PIPEDA", "E-23", "hosted in Canada", "security pack", "Privacy policy"]) expect(text, banned).not.toContain(banned)
  })

  it("links only to routes that exist", () => {
    const hrefs = [...text.matchAll(/"href":"([^"]+)"/g)].map((m) => m[1])
    for (const h of hrefs) {
      expect(h, h).not.toMatch(/^\/(demo|security|privacy|terms|accessibility)\b/)
      if (h.startsWith("/")) expect(h).toMatch(/^\/(workbench|compare|apply|ops|methodology|accuracy)(\/|#|$)/)
    }
  })

  it("the primary call to action is the live demo", () => {
    expect(CONTENT.LIVE_DEMO).toEqual({ label: "Try the live demo", href: "/workbench" })
    expect(CONTENT.NAV.map((n) => n.label)).toEqual(["Product", "How a pilot works", "Methodology", "Live demo"])
  })

  it("the pilot is a concept, and How it's built lists only what's true today", () => {
    expect(CONTENT.PILOT.label).toBe("Concept")
    expect(CONTENT.PILOT.disclaimer).toBe("Berry is a portfolio project. This is how I'd run a pilot with a lender.")
    expect(CONTENT.BUILT.items).toEqual([
      "Synthetic data only",
      "No personal data sent to AI",
      "Append-only, hash-chained audit trail",
      "Maker-checker on every approval",
      "Deterministic, tested decisions",
      "Rate-limited AI route",
    ])
    expect(CONTENT.FAQ.items.map((f) => f.q)).toContain("Is Berry a real product?")
  })

  it("never presents simulated rails or sample files as live", () => {
    expect(text).not.toMatch(/\btoday\b/i)
    const funding = [CONTENT.TOOLS.cards.find((c) => c.name === "Fund")!.copy, CONTENT.LIFECYCLE.steps.find((s) => s.name === "Fund")!.body, CONTENT.CANADA.tiles.find((t) => t.t.startsWith("AFT"))!.d]
    for (const s of funding) {
      if (/e-Transfer|Real-Time Rail/.test(s)) expect(s, s).toMatch(/simulat/i)
      if (/\bAFT\b|CPA 005/.test(s)) expect(s, s).toMatch(/\bsample\b/i)
    }
  })

  it("doesn't call the enacted Consumer-Driven Banking Act a draft", () => {
    const tile = CONTENT.CANADA.tiles.find((t) => t.t.startsWith("Consent"))!.d
    expect(tile).not.toMatch(/draft consumer-driven banking framework/i)
    expect(tile).toMatch(/not (yet )?in force/i)
    expect(tile).toMatch(/regulations (are )?in draft/i)
  })

  it("speaks in product voice: no implied customers", () => {
    for (const phrase of [/\byour (team|lenders|policy|account|compliance)\b/i, /\bwe['’]re onboarding\b/i, /\blenders ask us\b/i]) expect(text).not.toMatch(phrase)
  })
})
