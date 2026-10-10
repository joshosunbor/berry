import { z } from "zod"
import { ApplicantKind, IsoDate, IsoDateTime, ProductType, prefixedId } from "./common"

/*
 * Onboarding: application, consent and identity / business verification.
 *
 * Consent is built around the consent principles in Canada's draft
 * Consumer-Driven Banking Regulations (Canada Gazette Part I, 2026-06-27):
 * clear scope and duration, renewal within at most 12 months, free to give or
 * withdraw, and consent records kept. Berry is not "compliant" or "certified";
 * the framework is still in draft.
 * https://gazette.gc.ca/rp-pr/p1/2026/2026-06-27/html/reg3-eng.html
 */

export const ApplicationStatus = z.enum([
  "draft",
  "submitted",
  "verifying",
  "decisioning",
  "decided",
  "withdrawn",
])

export const ApplicationStep = z.enum(["about_you", "consent", "verification", "request", "review"])

export const Application = z.object({
  id: prefixedId("app"),
  applicantId: prefixedId("apl"),
  kind: ApplicantKind,
  product: ProductType,
  status: ApplicationStatus,
  /** Furthest step reached, for save-and-resume. */
  step: ApplicationStep,
  startedAt: IsoDateTime,
  savedAt: IsoDateTime,
  submittedAt: IsoDateTime.optional(),
  decidedAt: IsoDateTime.optional(),
})

/** Data categories a lender can ask to read. Berry requests only what the decision needs. */
export const DataCategory = z.enum([
  "account_details",
  "balances",
  "transactions",
  "lending_accounts",
  "registered_accounts",
  "investments",
  "identity",
])

/** Draft regulations cap consent duration before renewal at 12 months. */
export const MAX_CONSENT_DAYS = 365

export const Consent = z
  .object({
    id: prefixedId("cns"),
    applicantId: prefixedId("apl"),
    /** What data. */
    dataCategories: z.array(DataCategory).min(1),
    /** Categories deliberately not requested (data minimization), shown in the UI. */
    notRequested: z.array(DataCategory),
    /** For what purpose, in plain language. */
    purpose: z.string().min(1),
    /** Who receives it (a fictional institution). */
    recipient: z.string().min(1),
    accountIds: z.array(prefixedId("acc")),
    grantedAt: IsoDateTime,
    /** For how long. */
    expiresAt: IsoDateTime,
    revokedAt: IsoDateTime.optional(),
  })
  .refine((c) => {
    const days = (Date.parse(c.expiresAt) - Date.parse(c.grantedAt)) / 86_400_000
    return days > 0 && days <= MAX_CONSENT_DAYS
  }, "consent must expire after it is granted and within 12 months")

export const ConsentEvent = z.object({
  consentId: prefixedId("cns"),
  type: z.enum(["granted", "data_read", "renewed", "revoked", "expired"]),
  at: IsoDateTime,
  detail: z.string().optional(),
})

export const VerificationKind = z.enum([
  "id_document",
  "name_dob_match",
  "sanctions_screening",
  "pep_screening",
  "business_registration",
  "beneficial_ownership",
])

export const VerificationResult = z.enum(["pass", "needs_review", "fail"])

/** A simulated KYC/KYB check against synthetic data and a fictional watch list. */
export const VerificationCheck = z.object({
  id: prefixedId("ver"),
  applicantId: prefixedId("apl"),
  kind: VerificationKind,
  result: VerificationResult,
  reasons: z.array(z.string()),
  /** Cleared without a person looking at it. */
  automated: z.boolean(),
  startedAt: IsoDateTime,
  completedAt: IsoDateTime.optional(),
  durationMs: z.number().int().nonnegative().optional(),
  simulated: z.literal(true),
})

export const IdentityDocument = z.object({
  type: z.enum(["drivers_licence", "passport", "pr_card", "provincial_id"]),
  expiresOn: IsoDate,
})

export type ApplicationStatus = z.infer<typeof ApplicationStatus>
export type Application = z.infer<typeof Application>
export type DataCategory = z.infer<typeof DataCategory>
export type Consent = z.infer<typeof Consent>
export type ConsentEvent = z.infer<typeof ConsentEvent>
export type VerificationKind = z.infer<typeof VerificationKind>
export type VerificationResult = z.infer<typeof VerificationResult>
export type VerificationCheck = z.infer<typeof VerificationCheck>
