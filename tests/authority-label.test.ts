import path from "node:path"
import { describe, expect, it } from "vitest"
import { CONFIGS } from "@/lib/engine/config"
import { decideAll } from "@/lib/engine/decide"
import { loadApplicants } from "@/lib/evaluation/load"
import { getAuditEvents, getCast, getOpsItems } from "@/lib/data"
import { landingData } from "@/lib/landing/data"
import { toEngineInput } from "@/lib/schemas"

/*
 * Northgate's $50,000 authority tier is shown as "Lending officer" (its id
 * stays "lender"). This fails if the tier is ever shown as "Lender" in
 * user-facing text. ("Lender" for the lending institution, e.g. "Lender
 * view", is a different word and is fine.)
 */

const TIER_AS_LENDER = /\bLender(?:'s)? (?:sign-off|authority|approves|tier)\b|Sign-off: Lender\b|\bthe lender's \$50,000\b|"title":"Lender"/i

describe("Northgate's lending officer tier", () => {
  const tier = CONFIGS.credit_union.authorityTiers!.find((t) => t.id === "lender")!

  it("is labelled Lending officer, with its id and limit unchanged", () => {
    expect(tier.title).toBe("Lending officer")
    expect(tier.maxExposureCents).toBe(50_000_00)
    expect(CONFIGS.credit_union.authorityTiers!.map((t) => t.title)).not.toContain("Lender")
  })

  it("is never shown as Lender: decisions, landing page, queues, audit trail", () => {
    const planted = loadApplicants(path.join(process.cwd(), "data/planted")).map((a) => decideAll(toEngineInput(a)))
    const decisions = [...getCast().map((c) => c.decisions), ...planted].map((d) => d.credit_union)
    for (const d of decisions) expect(d.approver?.title, d.id).not.toBe("Lender")
    expect(decisions.some((d) => d.approver?.title === "Lending officer")).toBe(true)

    const text = JSON.stringify([landingData(), getOpsItems().map((i) => [i.title, i.detail, i.nextAction]), getAuditEvents().map((e) => e.reason)])
    expect(text).not.toMatch(TIER_AS_LENDER)
    expect(landingData().decisionPanel.signOff!.belowTitle).toBe("Lending officer")
  })
})
