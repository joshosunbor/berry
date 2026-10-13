import { formatCents } from "@/lib/money"

/** Plain labels for institution config thresholds shown on /methodology. */
const LABELS: Record<string, { label: string; format: (v: number) => string }> = {
  minDscr: { label: "Minimum debt service coverage", format: (v) => `${v.toFixed(2)}x` },
  relationshipMinDscr: { label: "Coverage minimum for strong members", format: (v) => `${v.toFixed(2)}x` },
  strongRelationship: { label: "Relationship score counted as strong", format: (v) => `${v} of 1` },
  fullTenureYears: { label: "Years of membership for full tenure credit", format: (v) => `${v}` },
  seasonalPeakCoverage: { label: "Peak-season surplus must cover a seasonal line", format: (v) => `${v.toFixed(2)}x` },
  relationshipSeasonalPeakCoverage: { label: "…for strong members", format: (v) => `${v.toFixed(2)}x` },
  maxNsf90: { label: "Most bounced payments allowed in 90 days", format: (v) => `${v}` },
  maxNsf12m: { label: "Most bounced payments allowed in 12 months", format: (v) => `${v}` },
  recentNsfLimitMonthsOfNet: { label: "With recent bounces, limit capped at months of net cash flow", format: (v) => `${v}` },
  maxCreditUtilization: { label: "Highest card utilization allowed", format: (v) => `${Math.round(v * 100)}%` },
  nonMemberRevolvingMaxCents: { label: "Unsecured revolving limit for non-members", format: (v) => formatCents(v, { whole: true }) },
  thinFileMemberMaxCents: { label: "Starter limit for thin-file members", format: (v) => formatCents(v, { whole: true }) },
  thinFileHistoryMonths: { label: "Credit history under this many months is a thin file", format: (v) => `${v} months` },
  minHistoryMonths: { label: "Minimum months of account history", format: (v) => `${v}` },
  minCreditHistoryMonths: { label: "Minimum months of Canadian credit history", format: (v) => `${v}` },
  maxIncomeCv: { label: "Highest income variability (CV) allowed", format: (v) => `${v}` },
  minDscrOnMedian: { label: "Minimum coverage, measured on the median month", format: (v) => `${v.toFixed(2)}x` },
  personalRevolvingToMedianNet: { label: "Personal revolving limit, in median months of net cash flow", format: (v) => `${v}x` },
  businessRevolvingToMedianNet: { label: "Business revolving limit, in median months of net cash flow", format: (v) => `${v}x` },
  maxRevolvingPaymentShareOfMedianNet: { label: "Assessed payment may use at most this share of the median month", format: (v) => `${Math.round(v * 100)}%` },
  thinFileMaxCents: { label: "Starter cap for thin files without a foreign report", format: (v) => formatCents(v, { whole: true }) },
  revolvingAssessmentRate: { label: "Revolving credit assessed at this share of the limit each month", format: (v) => `${Math.round(v * 1000) / 10}%` },
  limitStepUnder10kCents: { label: "Limits under $10,000 round down to steps of", format: (v) => formatCents(v, { whole: true }) },
  limitStepUnder50kCents: { label: "Limits under $50,000 round down to steps of", format: (v) => formatCents(v, { whole: true }) },
  limitStepAboveCents: { label: "Larger limits round down to steps of", format: (v) => formatCents(v, { whole: true }) },
  relationshipTenureWeight: { label: "Relationship score: weight on years of membership", format: (v) => `${Math.round(v * 100)}%` },
  relationshipProductsWeight: { label: "Relationship score: weight on products held", format: (v) => `${Math.round(v * 100)}%` },
  relationshipDepositsWeight: { label: "Relationship score: weight on deposits", format: (v) => `${Math.round(v * 100)}%` },
  relationshipFullProducts: { label: "Products held for full product credit", format: (v) => `${v}` },
  seasonalTermMonths: { label: "Seasonal operating line term", format: (v) => `${v} months` },
}

export function thresholdLabel(key: string, value: number): { label: string; value: string } {
  const l = LABELS[key]
  return l ? { label: l.label, value: l.format(value) } : { label: key, value: String(value) }
}
