import { describe, expect, it } from "vitest"
import { routeApproval } from "@/lib/engine/authority"
import { CONFIGS } from "@/lib/engine/config"

const tiers = CONFIGS.credit_union.authorityTiers!

describe("delegated authority", () => {
  it.each([
    [500_000, "msr"],
    [1_000_000, "msr"],
    [1_000_001, "lender"],
    [5_000_000, "lender"],
    [5_000_001, "branch_manager"],
    [25_000_000, "branch_manager"],
    [25_000_001, "credit_committee"],
    [100_000_000, "credit_committee"],
  ])("routes $%d cents to %s", (cents, tier) => {
    expect(routeApproval(tiers, cents).id).toBe(tier)
  })

  it("moves a relationship exception up one tier", () => {
    expect(routeApproval(tiers, 500_000, true).id).toBe("lender")
    expect(routeApproval(tiers, 30_000_000, true).id).toBe("credit_committee")
  })

  it("does not depend on the order tiers are listed in", () => {
    expect(routeApproval([...tiers].reverse(), 6_000_000).id).toBe("branch_manager")
  })
})
