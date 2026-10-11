import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { findLargeCashEvents, toComplianceFlag } from "@/lib/engine/fintrac"
import { Applicant, ComplianceFlag } from "@/lib/schemas"
import { txn } from "./fixtures"

const cash = (id: string, ts: string, amountCents: number) =>
  txn({ transactionId: `txn_t-${id}`, postedDate: ts.slice(0, 10), transactionTimestamp: ts, amountCents, debitCreditMemo: "CREDIT", category: "CASH_DEPOSIT", channel: "CASH" })

describe("FINTRAC large cash (LCTR) candidates", () => {
  it("flags a single cash deposit of $10,000 or more", () => {
    const [e] = findLargeCashEvents([cash("a", "2026-03-02T10:00:00-05:00", 1_000_000)])
    expect(e.rule).toBe("single")
  })

  it("does not flag $9,999.99", () => {
    expect(findLargeCashEvents([cash("a", "2026-03-02T10:00:00-05:00", 999_999)])).toHaveLength(0)
  })

  it("flags two deposits totalling $10,000+ within 24 hours (the 24-hour rule)", () => {
    const events = findLargeCashEvents([cash("a", "2026-03-02T16:00:00-05:00", 600_000), cash("b", "2026-03-03T15:59:00-05:00", 400_000)])
    expect(events).toHaveLength(1)
    expect(events[0].rule).toBe("24_hour")
    expect(events[0].totalCents).toBe(1_000_000)
  })

  it("does not combine deposits more than 24 hours apart", () => {
    expect(findLargeCashEvents([cash("a", "2026-03-02T16:00:00-05:00", 600_000), cash("b", "2026-03-03T16:00:00-05:00", 400_000)])).toHaveLength(0)
  })

  it("ignores non-cash credits and cash withdrawals", () => {
    const eft = { ...cash("a", "2026-03-02T10:00:00-05:00", 2_000_000), channel: "EFT" as const }
    const withdrawal = { ...cash("b", "2026-03-02T11:00:00-05:00", 2_000_000), debitCreditMemo: "DEBIT" as const }
    expect(findLargeCashEvents([eft, withdrawal])).toHaveLength(0)
  })

  it("produces a valid flag that is never a credit factor", () => {
    const flag = toComplianceFlag(findLargeCashEvents([cash("a", "2026-03-02T10:00:00-05:00", 1_200_000)])[0])
    expect(ComplianceFlag.parse(flag).creditFactor).toBe(false)
  })

  it("finds exactly Main Street Hardware's cash day in the cast", () => {
    const a = Applicant.parse(JSON.parse(readFileSync(path.resolve(__dirname, "../../data/applicants/main-street-hardware.json"), "utf8")))
    const events = findLargeCashEvents(a.transactions)
    expect(events).toHaveLength(1)
    expect(events[0].windowStart.slice(0, 10)).toBe("2026-06-12")
    expect(events[0].totalCents).toBeGreaterThanOrEqual(1_050_000)
  })
})
