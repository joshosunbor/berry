import type { InstitutionConfig, ProductType, Recommendation } from "@/lib/schemas"
import type { Features } from "./features"
import type { ModeResult } from "./types"

/*
 * Advice-based suggestions (CLAUDE.md §4.5): the product that fits, with one
 * sentence on why. No hard sell, at most two.
 */

export const MAX_RECOMMENDATIONS = 2

/** Credit products are suggested only if this lender offers them; deposit products are assumed available. */
export function recommend(f: Features, kind: "personal" | "business", result: ModeResult, config: InstitutionConfig): Recommendation[] {
  const offered = (p: Recommendation["product"]) => {
    const credit = config.products.find((t) => t.product === (p as ProductType))
    return credit ? credit.offered : true
  }
  const out: Recommendation[] = []
  const thinFile = f.creditHistoryMonths < 12 && !f.foreignReportAvailable

  if (thinFile) {
    out.push({ product: "credit_builder", why: "Small, on-time payments are the fastest way to build a Canadian credit history." })
  }
  if (f.income.type === "seasonal" && result.product !== "seasonal_operating_line") {
    out.push({ product: "seasonal_operating_line", why: "A line you repay after your busy season fits income that arrives in a few months of the year." })
  }
  if ((f.income.type === "irregular" || f.income.type === "gig") && result.structure === "term") {
    out.push({ product: kind === "business" ? "business_line_of_credit" : "line_of_credit", why: "A line of credit lets you borrow only what you need between uneven paydays, instead of a fixed payment." })
  }
  if (f.daysCashOnHand >= 90 && f.nsf90 === 0) {
    out.push(
      kind === "business"
        ? { product: "term_deposit", why: "You usually hold more than three months of spending; a short term deposit could earn more on cash you won't need right away." }
        : { product: "high_interest_savings", why: "You usually keep more than three months of spending in your account; a high-interest savings account could earn more on it." },
    )
  }
  return out.filter((r) => offered(r.product)).slice(0, MAX_RECOMMENDATIONS)
}
