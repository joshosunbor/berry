import { describe, expect, it } from "vitest"
import { getMetricSources } from "@/lib/data"
import { bottleneck, businessText, collectedCents, computeKpis, hoursText, lossesCents, reconciliations, type LenderFilter } from "@/lib/ops/metrics"
import { OPS_MOMENTS } from "@/lib/ops/moments"
import { slaState } from "@/lib/ops/queues"
import { MODES } from "@/lib/modes"
import { monthEnds, reconcile } from "@/lib/servicing/reconcile"
import { CLOCK_START } from "@/lib/servicing/views"

describe("durations read as plain English", () => {
  it("singular for one, plural otherwise", () => {
    expect(businessText(60)).toBe("1 business hour")
    expect(businessText(90)).toBe("1.5 business hours")
    expect(businessText(480)).toBe("1 business day")
    expect(businessText(960)).toBe("2 business days")
    expect(hoursText(60 * 24 * 2)).toBe("2 days")
    expect(hoursText(60)).toBe("1 h")
  })
})

const src = getMetricSources()
const FILTERS: LenderFilter[] = ["all", ...MODES]
const kpi = (f: LenderFilter, at: string, id: string) => computeKpis(src, f, at).find((k) => k.id === id)!
const books = (f: LenderFilter) => (f === "all" ? MODES : [f]).map((m) => src.books[m])

describe("tie-outs: every KPI equals its source", () => {
  for (const { at, label } of OPS_MOMENTS) {
    const date = at.slice(0, 10)
    for (const f of FILTERS) {
      it(`${label}, ${f}: losses = sum of charge-off ledger entries`, () => {
        const fromEntries = books(f)
          .flatMap((b) => b.ledger.all.filter((e) => e.type === "charge_off" && e.date <= date))
          .reduce((t, e) => t + e.lines.reduce((x, l) => x + l.debitCents, 0), 0)
        const fromBalance = books(f).reduce((t, b) => t + b.ledger.balance(`credit_loss:${b.institutionId}`, date), 0)
        expect(kpi(f, at, "losses").raw).toBe(fromEntries)
        expect(fromBalance).toBe(fromEntries)
      })

      it(`${label}, ${f}: collected = settled debits − returns after settlement`, () => {
        const attempts = src.loans.filter((l) => f === "all" || l.mode === f).flatMap((l) => l.attempts)
        const settled = attempts.filter((a) => a.settledOn && a.settledOn <= date).reduce((t, a) => t + a.amountCents, 0)
        const returned = attempts.filter((a) => a.outcome === "returned" && a.stage === "settled" && a.returnedOn! <= date).reduce((t, a) => t + a.amountCents, 0)
        expect(kpi(f, at, "collected").raw).toBe(settled - returned)
        expect(collectedCents(src, f, date)).toEqual({ settledCents: settled, returnedCents: returned, collectedCents: settled - returned })
      })

      it(`${label}, ${f}: match rate = the reconciliation report`, () => {
        const cut = monthEnds(CLOCK_START, date).at(-1)
        const k = kpi(f, at, "match_rate")
        if (!cut) return expect(k.raw).toBeNull()
        const reports = books(f).map((b) => reconcile(b, cut))
        expect(reconciliations(src, f, date)).toEqual(reports)
        if (f !== "all") expect(k.raw).toBeCloseTo(reports[0].matchRate, 3)
        expect(k.raw).toBe(reports.reduce((t, r) => t + r.matched.length * 2, 0) / reports.reduce((t, r) => t + r.linesCompared, 0))
      })

      it(`${label}, ${f}: SLA breaches = the queue engine's breached and missed count`, () => {
        const items = src.items.filter((i) => (f === "all" || i.mode === f) && i.createdAt <= at)
        const late = items.filter((i) => ["breached", "missed"].includes(slaState(i, at))).length
        expect(kpi(f, at, "sla_breaches").raw).toBe(late)
      })
    }
  }
})

describe("KPIs", () => {
  const end = OPS_MOMENTS.at(-1)!.at

  it("lenders add up to all lenders for amounts", () => {
    for (const { at } of OPS_MOMENTS) {
      const sum = (id: string) => MODES.reduce((t, m) => t + (kpi(m, at, id).raw ?? 0), 0)
      expect(kpi("all", at, "collected").raw).toBe(sum("collected"))
      expect(kpi("all", at, "losses").raw).toBe(sum("losses"))
      expect(lossesCents(src, "all", at.slice(0, 10))).toBe(sum("losses"))
    }
  })

  it("move with time: nothing collected at the start, losses and collections by the end", () => {
    expect(kpi("all", OPS_MOMENTS[0].at, "collected").raw).toBe(0)
    expect(kpi("all", end, "collected").raw).toBeGreaterThan(kpi("all", OPS_MOMENTS[5].at, "collected").raw!)
    expect(kpi("credit_union", end, "losses").raw).toBeGreaterThan(0)
    expect(kpi("all", OPS_MOMENTS[0].at, "time_to_funding").raw).toBeNull()
    expect(kpi("all", end, "return_rate").breakdown!.map((b) => b.label.slice(0, 3))).toEqual(expect.arrayContaining(["901", "903", "905", "907"]))
  })

  it("every KPI has a definition and how it's computed; illustrative inputs are labelled", () => {
    for (const f of FILTERS) {
      for (const k of computeKpis(src, f, end)) {
        expect(k.definition.length, k.id).toBeGreaterThan(20)
        expect(k.how.length, k.id).toBeGreaterThan(20)
      }
    }
    const ks = computeKpis(src, "all", end)
    for (const id of ["cost_per_loan", "borrower_fees", "losses", "time_to_funding"]) expect(ks.find((k) => k.id === id)!.illustrative, id).toBeTruthy()
  })

  it("names the biggest bottleneck from the queue engine's manual work", () => {
    const b = bottleneck(src, "all", end)!
    expect(b.queue).toBe("credit_referral")
    expect(b.text).toMatch(/% of manual work/)
    expect(bottleneck(src, "fintech", OPS_MOMENTS[0].at)).toBeNull()
  })
})
