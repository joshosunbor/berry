import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { computeFeatures } from "@/lib/engine/features"
import { bestConsecutive } from "@/lib/engine/patterns"
import { Applicant, toEngineInput } from "@/lib/schemas"
import { input, monthlyCredits, pay } from "./fixtures"

const castPattern = (slug: string) => {
  const a = Applicant.parse(JSON.parse(readFileSync(path.resolve(__dirname, `../../data/applicants/${slug}.json`), "utf8")))
  return computeFeatures(toEngineInput(a)).income
}

describe("best consecutive months", () => {
  it("wraps December into January", () => {
    const months = [30, 5, 0, 0, 0, 0, 0, 0, 0, 0, 5, 60]
    expect(bestConsecutive(months, 3)).toEqual({ months: [11, 12, 1], share: 0.95 })
  })
})

describe("income patterns on fixtures", () => {
  it("salaried: regular bi-weekly payroll", () => {
    const paydays = Array.from({ length: 13 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 2 + i * 14))
      return pay(d.toISOString().slice(0, 10), 200_000)
    })
    const p = computeFeatures(input(paydays)).income
    expect(p.type).toBe("salaried")
    expect(p.payroll?.cadenceDays).toBe(14)
    expect(p.payroll?.nextExpectedDate).toBe("2026-07-03")
  })

  it("gig: most income from platform payouts", () => {
    const payouts = Array.from({ length: 150 }, (_, i) => pay(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), 8_000, "GIG_INCOME"))
    expect(computeFeatures(input(payouts)).income.type).toBe("gig")
  })

  it("seasonal needs a full year of history", () => {
    const year = input(
      monthlyCredits([1, 1, 1, 1, 1, 1].map(() => 10_000)).concat([pay("2026-06-20", 2_000_000, "BUSINESS_REVENUE")]),
      { kind: "business" },
    )
    expect(computeFeatures(year).income.type).not.toBe("seasonal")
  })

  it("steady business: many business deposits a month with low volatility", () => {
    const daily = Array.from({ length: 180 }, (_, i) => pay(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), 50_000, "CARD_SETTLEMENT"))
    expect(computeFeatures(input(daily)).income.type).toBe("steady_business")
  })

  it("invoice-based even when months are even: it's about how income arrives", () => {
    const p = computeFeatures(input(monthlyCredits([500_000, 520_000, 480_000, 510_000, 530_000, 495_000], 10, "BUSINESS_REVENUE"))).income
    expect(p.type).toBe("invoice")
  })

  it("invoice-based: a few large client payments a month that swing a lot", () => {
    const p = computeFeatures(input(monthlyCredits([100_000, 900_000, 50_000, 700_000, 20_000, 800_000], 10, "BUSINESS_REVENUE"))).income
    expect(p.type).toBe("invoice")
  })

  it("pension: pension and government benefits", () => {
    const p = computeFeatures(input([...monthlyCredits(Array(6).fill(235_000), 25, "PENSION"), ...monthlyCredits(Array(6).fill(155_000), 27, "GOVERNMENT_BENEFIT")])).income
    expect(p.type).toBe("pension")
  })

  it("irregular: mixed, unpredictable sources", () => {
    const p = computeFeatures(input(monthlyCredits([100_000, 900_000, 50_000, 700_000, 20_000, 800_000], 10, "OTHER_INCOME"))).income
    expect(p.type).toBe("irregular")
  })
})

describe("income patterns on the cast", () => {
  it.each([
    ["priya", "salaried"],
    ["daniel", "salaried"],
    ["sofia", "salaried"],
    ["amara", "gig"],
    ["hollis-family-farm", "seasonal"],
    ["larchmere-lodge", "seasonal"],
    ["corvane-auto-repair", "steady_business"],
    ["halverly-dental", "steady_business"],
    ["quillbean-cafe", "steady_business"],
    ["fennick-hardware", "steady_business"],
    ["ellen", "pension"],
    ["grace", "salaried"],
    ["quillfeather-plumbing", "invoice"],
    ["petalwick-florals", "steady_business"],
  ])("%s is %s", (slug, type) => {
    expect(castPattern(slug).type).toBe(type)
  })

  it("finds harvest and summer peaks", () => {
    expect(castPattern("hollis-family-farm").peakMonths).toEqual([9, 10, 11])
    expect(castPattern("larchmere-lodge").peakMonths).toEqual([6, 7, 8])
  })
})
