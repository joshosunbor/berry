import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { decideAll } from "@/lib/engine/decide"
import type { Mode } from "@/lib/modes"
import { Applicant, toEngineInput, type Outcome } from "@/lib/schemas"

/*
 * Regression guard for the 14-applicant cast across all three lenders.
 * These are the outcomes the brief's stories call for (CLAUDE.md §3). This
 * is not the accuracy evaluation: planted cases with hidden expectations
 * come on Day 2.
 */

type Expect = { outcome: Outcome; limit?: number; approver?: string; product?: string; reason?: string }
const E = (outcome: Outcome, limit?: number, extra: Omit<Expect, "outcome" | "limit"> = {}): Expect => ({ outcome, limit, ...extra })

const TABLE: Record<string, Record<Mode, Expect>> = {
  priya: {
    credit_union: E("approve", 15_000, { approver: "lender" }),
    fintech: E("approve", 15_000),
    bank: E("approve", 15_000),
  },
  "hollis-family-farm": {
    credit_union: E("approve", 60_000, { approver: "branch_manager", product: "seasonal_operating_line", reason: "SEASONAL_REPAYMENT_FITS" }),
    fintech: E("approve", 8_000, { product: "business_line_of_credit", reason: "NO_SEASONAL_STRUCTURE" }),
    bank: E("decline", 0, { reason: "INCOME_TOO_VARIABLE" }),
  },
  amara: {
    credit_union: E("approve", 2_000, { approver: "msr", reason: "NON_MEMBER_CAP" }),
    fintech: E("approve", 3_000, { reason: "CONSISTENT_GIG_INCOME" }),
    bank: E("refer", 0, { reason: "INCOME_NEEDS_DOCUMENTS" }),
  },
  daniel: {
    credit_union: E("approve", 2_000, { reason: "STARTER_PATH" }),
    fintech: E("approve", 1_000, { reason: "THIN_FILE_LIMIT" }),
    bank: E("decline", 0, { reason: "SHORT_CREDIT_HISTORY" }),
  },
  sofia: {
    credit_union: E("decline", 0, { reason: "RECENT_NSF" }),
    fintech: E("decline", 0, { reason: "RECENT_NSF" }),
    bank: E("decline", 0, { reason: "NSF_HISTORY" }),
  },
  "northline-auto-repair": {
    credit_union: E("approve", 80_000, { approver: "branch_manager" }),
    fintech: E("approve", 80_000),
    bank: E("approve", 80_000),
  },
  "bright-smile-dental": {
    credit_union: E("approve", 350_000, { approver: "credit_committee" }),
    fintech: E("approve", 150_000, { reason: "PRODUCT_MAX" }),
    bank: E("approve", 350_000),
  },
  "corner-grind-cafe": {
    credit_union: E("approve_with_conditions", 7_500, { reason: "RECENT_NSF_CAUTION" }),
    fintech: E("decline", 0, { reason: "RECENT_NSF" }),
    bank: E("decline", 0, { reason: "NSF_HISTORY" }),
  },
  "lakeside-lodge": {
    credit_union: E("approve", 80_000, { approver: "branch_manager", reason: "PEAK_SURPLUS_LIMITS_LINE" }),
    fintech: E("decline", 0, { reason: "NEGATIVE_TYPICAL_MONTH" }),
    bank: E("decline", 0, { reason: "INCOME_TOO_VARIABLE" }),
  },
  "main-street-hardware": {
    credit_union: E("approve", 40_000, { approver: "lender" }),
    fintech: E("approve", 7_500),
    bank: E("approve", 40_000),
  },
  ellen: {
    credit_union: E("approve", 15_000, { approver: "lender", reason: "STABLE_PENSION" }),
    fintech: E("approve", 9_500, { reason: "LIMIT_REDUCED" }),
    bank: E("approve", 15_000, { reason: "STABLE_PENSION" }),
  },
  grace: {
    credit_union: E("approve", 8_000, { reason: "PAYING_DOWN_CARDS" }),
    fintech: E("approve", 8_000),
    bank: E("decline", 0, { reason: "NSF_HISTORY" }),
  },
  "quillfeather-plumbing": {
    credit_union: E("approve", 20_000, { approver: "lender" }),
    fintech: E("approve", 5_500, { reason: "LIMIT_REDUCED" }),
    bank: E("decline", 0, { reason: "INCOME_TOO_VARIABLE" }),
  },
  "petalwick-florals": {
    credit_union: E("approve", 60_000, { approver: "credit_committee", reason: "RELATIONSHIP_SUPPORTS_APPROVAL" }),
    fintech: E("approve", 23_000, { reason: "LIMIT_REDUCED" }),
    bank: E("approve", 42_000, { reason: "LIMIT_REDUCED" }),
  },
}

const rows = Object.entries(TABLE).flatMap(([slug, modes]) => Object.entries(modes).map(([mode, e]) => [slug, mode as Mode, e] as const))

describe("cast outcomes", () => {
  const cache = new Map<string, ReturnType<typeof decideAll>>()
  const decisions = (slug: string) => {
    if (!cache.has(slug)) {
      const a = Applicant.parse(JSON.parse(readFileSync(path.resolve(__dirname, `../../data/applicants/${slug}.json`), "utf8")))
      cache.set(slug, decideAll(toEngineInput(a)))
    }
    return cache.get(slug)!
  }

  it.each(rows)("%s / %s", (slug, mode, e) => {
    const d = decisions(slug)[mode]
    expect(d.outcome).toBe(e.outcome)
    if (e.limit !== undefined) expect(d.limitCents / 100).toBe(e.limit)
    if (e.approver) expect(d.approver?.id).toBe(e.approver)
    if (e.product) expect(d.product).toBe(e.product)
    if (e.reason) expect(d.reasons.map((r) => r.code)).toContain(e.reason)
    if (mode === "credit_union" && d.outcome !== "decline") expect(d.approver).toBeDefined()
  })

  it("flags only Main Street Hardware for FINTRAC review", () => {
    for (const slug of Object.keys(TABLE)) {
      expect(decisions(slug).bank.flags.length, slug).toBe(slug === "main-street-hardware" ? 1 : 0)
    }
  })
})
