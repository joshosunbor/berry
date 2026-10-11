import type { Outcome, ReasonCode } from "@/lib/schemas"
import { REASONS, type ReasonHit } from "./reasons"

/*
 * Turns reason hits into ranked, plain-language reason codes (§4.4) and
 * "what would change this decision" statements.
 */

export const MAX_REASONS_SHOWN = 4
export const MAX_COUNTERFACTUALS = 3

/**
 * Ranks reasons for the outcome: a decline or referral leads with what held
 * it back; a full approval leads with strengths. When the amount was reduced
 * (`limited`), reasons rank by weight alone, so what shaped the offer shows
 * first.
 */
export function explain(outcome: Outcome, hits: ReasonHit[], limited = false): ReasonCode[] {
  const leadsWithNegatives = outcome === "decline" || outcome === "refer"
  const rank = (h: ReasonHit) => {
    if (limited) return -h.weight
    const dir = REASONS[h.code].direction
    const group = dir === "neutral" ? 1 : (dir === "negative") === leadsWithNegatives ? 0 : 2
    return group * 10 - h.weight
  }
  const seen = new Set<string>()
  return [...hits]
    .sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code))
    .filter((h) => (seen.has(h.code) ? false : (seen.add(h.code), true)))
    .map((h) => {
      const def = REASONS[h.code]
      return {
        code: h.code,
        direction: def.direction,
        weight: h.weight,
        customerText: def.customer(h.evidence),
        lenderText: def.lender(h.evidence),
        evidence: h.evidence,
      }
    })
}

/** "What would change this decision", from the negative reasons that carry one, most important first. */
export function counterfactuals(hits: ReasonHit[]): string[] {
  return [...hits]
    .filter((h) => REASONS[h.code].direction === "negative" && "counterfactual" in REASONS[h.code])
    .sort((a, b) => b.weight - a.weight)
    .map((h) => (REASONS[h.code] as { counterfactual: (e: ReasonHit["evidence"]) => string }).counterfactual(h.evidence))
    .filter((text, i, all) => all.indexOf(text) === i)
    .slice(0, MAX_COUNTERFACTUALS)
}
