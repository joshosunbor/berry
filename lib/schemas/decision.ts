import { z } from "zod"
import {
  Bps,
  Cents,
  InstitutionId,
  IsoDateTime,
  Mode,
  PositiveCents,
  ProductType,
  Structure,
  prefixedId,
} from "./common"

/*
 * Decision output (CLAUDE.md §4.3). Every number here is set by deterministic,
 * unit-tested engine code. AI never sets a limit, price or approval.
 */

export const Outcome = z.enum(["approve", "approve_with_conditions", "refer", "decline"])

/** A ranked reason, with plain-language text in two registers (§4.4). */
export const ReasonCode = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  direction: z.enum(["positive", "negative", "neutral"]),
  /** Ranking weight, 0–1. The UI shows the top 4. */
  weight: z.number().min(0).max(1),
  /** For the member or business owner. */
  customerText: z.string().min(1),
  /** For the lender, with figures. */
  lenderText: z.string().min(1),
  /** The figures behind the reason, so memos can be checked against them. */
  evidence: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
})

/** A delegated lending authority tier (credit union mode). Illustrative; real tiers vary. */
export const AuthorityTier = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int().nonnegative(),
  /** Highest total exposure this tier can approve; null means no cap (credit committee). */
  maxExposureCents: PositiveCents.nullable(),
})

export const ComplianceFlagType = z.enum(["FINTRAC_LCTR_CANDIDATE", "SANCTIONS_REVIEW", "PEP_REVIEW"])

/**
 * A compliance flag routes work to a review queue. It is explicitly not a
 * credit factor: `creditFactor` is the literal `false`.
 */
export const ComplianceFlag = z.object({
  type: ComplianceFlagType,
  summary: z.string().min(1),
  transactionIds: z.array(prefixedId("txn")),
  totalCents: PositiveCents.optional(),
  windowStart: IsoDateTime.optional(),
  windowEnd: IsoDateTime.optional(),
  /** "single" ($10,000+ in one transaction) or "24_hour" (2+ cash amounts within 24 hours). */
  rule: z.enum(["single", "24_hour"]).optional(),
  creditFactor: z.literal(false),
  source: z.url(),
})

export const RecommendedProduct = z.enum([
  "high_interest_savings",
  "term_deposit",
  "line_of_credit",
  "business_line_of_credit",
  "seasonal_operating_line",
  "secured_card",
  "credit_builder",
])

/** An advice-based suggestion (§4.5): one sentence on why, no hard sell. */
export const Recommendation = z.object({
  product: RecommendedProduct,
  why: z.string().min(1),
})

export const Decision = z
  .object({
    id: prefixedId("dec"),
    applicantId: prefixedId("apl"),
    mode: Mode,
    institutionId: InstitutionId,
    outcome: Outcome,
    product: ProductType,
    /** Approved limit or principal; 0 on decline. */
    limitCents: PositiveCents,
    /** Illustrative APR in basis points. */
    aprBps: Bps.nullable(),
    termMonths: z.number().int().positive().nullable(),
    structure: Structure.nullable(),
    /** Ranked, most important first. */
    reasons: z.array(ReasonCode),
    /** "What would change this decision". */
    counterfactuals: z.array(z.string()),
    approver: AuthorityTier.optional(),
    conditions: z.array(z.string()).optional(),
    /** Documents required (bank mode checklist). */
    documents: z.array(z.object({ name: z.string(), received: z.boolean() })).optional(),
    recommendations: z.array(Recommendation).optional(),
    flags: z.array(ComplianceFlag),
    /** Feature keys the decision used, for the "What this decision used" panel. */
    inputsUsed: z.array(z.string()),
    /** Proposed periodic payment, for debt service coverage. */
    paymentCents: Cents.nullable(),
    decidedAt: IsoDateTime,
    engineVersion: z.string(),
    policyVersion: z.number().int().positive(),
  })
  .superRefine((d, ctx) => {
    if (d.outcome === "decline" && d.limitCents !== 0) {
      ctx.addIssue({ code: "custom", path: ["limitCents"], message: "a decline has no limit" })
    }
    if ((d.outcome === "approve" || d.outcome === "approve_with_conditions") && d.limitCents <= 0) {
      ctx.addIssue({ code: "custom", path: ["limitCents"], message: "an approval needs a limit" })
    }
    if (d.outcome === "approve_with_conditions" && !d.conditions?.length) {
      ctx.addIssue({ code: "custom", path: ["conditions"], message: "conditional approval needs conditions" })
    }
  })

export type Outcome = z.infer<typeof Outcome>
export type ReasonCode = z.infer<typeof ReasonCode>
export type AuthorityTier = z.infer<typeof AuthorityTier>
export type ComplianceFlag = z.infer<typeof ComplianceFlag>
export type RecommendedProduct = z.infer<typeof RecommendedProduct>
export type Recommendation = z.infer<typeof Recommendation>
export type Decision = z.infer<typeof Decision>
