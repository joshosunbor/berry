import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { findLargeCashEvents, LCTR_THRESHOLD_CENTS, reviewLargeCash } from "@/lib/engine/fintrac"
import { Applicant } from "@/lib/schemas"

const mainStreet = Applicant.parse(JSON.parse(readFileSync(path.resolve(__dirname, "../../data/applicants/fennick-hardware.json"), "utf8")))

describe("FINTRAC large cash review (Fennick Hardware)", () => {
  const [event] = findLargeCashEvents(mainStreet.transactions)
  const review = reviewLargeCash(event, { reportingEntity: "Northgate Credit Union (fictional)", customerName: "Fennick Hardware Ltd." })

  it("shows both flagged deposits with a running 24-hour total", () => {
    expect(review.rule).toBe("24_hour")
    expect(review.deposits).toHaveLength(2)
    expect(review.deposits.map((d) => d.amountCents)).toEqual([620_000, 430_000])
    expect(review.deposits.map((d) => d.runningTotalCents)).toEqual([620_000, 1_050_000])
    expect(review.deposits[1].hoursFromFirst).toBeLessThan(24)
  })

  it("shows the $10,000 threshold, crossed only by the combined total", () => {
    expect(review.thresholdCents).toBe(LCTR_THRESHOLD_CENTS)
    expect(review.deposits.every((d) => d.amountCents < review.thresholdCents)).toBe(true)
    expect(review.totalCents).toBeGreaterThanOrEqual(review.thresholdCents)
  })

  it("explains why the file went to review, and that credit is unaffected", () => {
    expect(review.reason).toMatch(/24-hour rule/)
    expect(review.reason).toMatch(/does not affect the credit decision/)
    expect(review.creditFactor).toBe(false)
  })

  it("labels the report summary illustrative, not a filing, with a 15-day deadline", () => {
    expect(review.reportSummary.label).toBe("Illustrative — not a filing")
    expect(review.reportSummary.reportDueBy).toBe("2026-06-27")
    expect(review.reportSummary.numberOfDeposits).toBe(2)
    expect(review.reportSummary.source).toContain("fintrac-canafe.canada.ca")
  })
})
