import { z } from "zod"
import { INSTITUTION_IDS, MODES } from "@/lib/modes"

/** Money is always integer cents (CAD). See lib/money.ts. */
export const Cents = z.number().int()
export const PositiveCents = Cents.nonnegative()

/** Interest rates in basis points (1% = 100 bps). Illustrative only. */
export const Bps = z.number().int().nonnegative()

export const IsoDate = z.iso.date()
export const IsoDateTime = z.iso.datetime({ offset: true })

/** IDs are lowercase, prefixed by entity type, e.g. `loan_hollis-01`. */
export function prefixedId<P extends string>(prefix: P) {
  return z.string().regex(new RegExp(`^${prefix}_[a-z0-9][a-z0-9_-]*$`), `expected an id starting with "${prefix}_"`)
}

export const ID_PREFIXES = {
  applicant: "apl",
  account: "acc",
  transaction: "txn",
  application: "app",
  consent: "cns",
  verification: "ver",
  decision: "dec",
  loan: "loan",
  padAgreement: "pad",
  disbursement: "dsb",
  ledgerEntry: "led",
  scheduledPayment: "sch",
  collection: "col",
  paymentReturn: "ret",
  recoveryAction: "rec",
  reconciliation: "rcn",
  queueItem: "q",
  analyst: "usr",
  auditEvent: "aud",
  approval: "apv",
  policyVersion: "pol",
  aftFile: "aft",
} as const

/** Canadian provinces and territories. Applicants show a province at most. */
export const Province = z.enum(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"])

export const Mode = z.enum(MODES)
export const InstitutionId = z.enum(INSTITUTION_IDS)

export const ApplicantKind = z.enum(["personal", "business"])

/** The eight credit products Berry decides on (CLAUDE.md §1). */
export const PERSONAL_PRODUCTS = ["personal_loan", "line_of_credit", "credit_card", "starter_credit"] as const
export const BUSINESS_PRODUCTS = [
  "business_term_loan",
  "business_line_of_credit",
  "equipment_financing",
  "seasonal_operating_line",
] as const
export const ProductType = z.enum([...PERSONAL_PRODUCTS, ...BUSINESS_PRODUCTS])

/** How a credit product is structured and repaid. */
export const Structure = z.enum(["term", "revolving", "seasonal_operating", "secured_starter"])

/** A typed pointer to any entity, used by queues, audit events and reconciliation. */
export const SubjectRef = z.object({
  kind: z.enum([
    "applicant",
    "application",
    "decision",
    "loan",
    "collection",
    "payment_return",
    "reconciliation",
    "policy",
    "consent",
    "verification",
    "transaction",
  ]),
  id: z.string().min(1),
})

/** Marks data or rules that are illustrative rather than verified against a source. */
export const Illustrative = z.literal(true)

export type Cents = z.infer<typeof Cents>
export type Province = z.infer<typeof Province>
export type ApplicantKind = z.infer<typeof ApplicantKind>
export type ProductType = z.infer<typeof ProductType>
export type Structure = z.infer<typeof Structure>
export type SubjectRef = z.infer<typeof SubjectRef>
