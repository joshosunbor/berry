import type { AuthorityTier } from "@/lib/schemas"

/*
 * Delegated lending authority (credit union mode). The tiers come from
 * institution config and are illustrative; real tiers vary by credit union.
 */

/**
 * The lowest tier allowed to approve `exposureCents`. If approval relied on
 * a relationship exception, it moves up one tier.
 */
export function routeApproval(tiers: AuthorityTier[], exposureCents: number, relationshipException = false): AuthorityTier {
  const ordered = [...tiers].sort((a, b) => a.order - b.order)
  if (!ordered.length) throw new Error("no authority tiers configured")
  let i = ordered.findIndex((t) => t.maxExposureCents === null || exposureCents <= t.maxExposureCents)
  if (i === -1) i = ordered.length - 1
  if (relationshipException) i = Math.min(i + 1, ordered.length - 1)
  return ordered[i]
}
