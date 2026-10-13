import { z } from "zod"
import {
  ApplicantKind,
  IsoDate,
  PositiveCents,
  ProductType,
  Province,
  prefixedId,
} from "./common"
import { Account, Transaction } from "./transactions"

/**
 * Attributes a credit decision must never use (CLAUDE.md §4.6). Kept in their
 * own object so the fairness test can shuffle them, and stripped from the
 * engine's input type so the engine cannot read them.
 */
export const ProtectedAttributes = z.object({
  fullName: z.string().min(1),
  dateOfBirth: IsoDate,
  gender: z.enum(["female", "male", "non_binary", "undisclosed"]),
  nationality: z.string().min(1),
  immigrationStatus: z.enum(["citizen", "permanent_resident", "work_permit", "study_permit", "undisclosed"]),
  /** Fictional, format-valid only (forward sortation area + LDU). */
  postalCode: z.string().regex(/^[A-Z]\d[A-Z] \d[A-Z]\d$/),
})

export const CreditRequest = z.object({
  product: ProductType,
  amountCents: PositiveCents,
  /** For term products; omitted for revolving credit. */
  termMonths: z.number().int().positive().optional(),
  purpose: z.string().min(1),
})

export const CreditFile = z.object({
  /** Months of Canadian credit history on the (synthetic) bureau file. */
  historyMonths: z.number().int().nonnegative(),
  /** Coarse synthetic bureau band. "none" means no Canadian score yet. */
  bureauBand: z.enum(["none", "thin", "fair", "good", "excellent"]),
  /**
   * Whether an imported foreign credit report is available. Coverage is
   * limited to certain countries (e.g. Equifax Canada's Global Consumer
   * Credit File launched in Oct 2024 with India).
   */
  foreignReport: z.object({
    available: z.boolean(),
    band: z.enum(["fair", "good", "excellent"]).optional(),
  }),
})

/** Membership at Northgate Credit Union, used only in credit union mode. */
export const Relationship = z.object({
  institutionId: z.literal("northgate"),
  memberSince: IsoDate,
  productsHeld: z.array(
    z.enum(["chequing", "savings", "term_deposit", "mortgage", "credit_card", "line_of_credit", "business_account", "rrsp", "tfsa"]),
  ),
  /**
   * What the member already owes Northgate (balances or limits on credit it
   * holds there), for delegated authority. Its payments must appear in the
   * transactions so coverage counts them. Omitted: none.
   */
  existingCreditCents: z.number().int().nonnegative().optional(),
})

export const BusinessProfile = z.object({
  legalName: z.string().min(1),
  /** Fictional registration number. */
  registrationNo: z.string().min(1),
  structure: z.enum(["sole_proprietorship", "partnership", "corporation"]),
  industry: z.string().min(1),
  yearsOperating: z.number().nonnegative(),
  employees: z.number().int().nonnegative(),
})

export const Applicant = z
  .object({
    id: prefixedId("apl"),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    kind: ApplicantKind,
    /** Short display name shown in the UI, e.g. "Priya" or "Hollis Family Farm". */
    displayName: z.string().min(1),
    /** The one-line story shown on the applicant card. */
    story: z.string().min(1),
    /** Province at most; never a town or address. */
    province: Province,
    request: CreditRequest,
    creditFile: CreditFile,
    relationship: Relationship.nullable(),
    business: BusinessProfile.nullable(),
    protected: ProtectedAttributes,
    accounts: z.array(Account).min(1),
    transactions: z.array(Transaction),
    /** Generator provenance, for reproducibility. */
    generated: z.object({ seed: z.number().int(), windowStart: IsoDate, windowEnd: IsoDate, generatorVersion: z.string() }),
  })
  .superRefine((a, ctx) => {
    if (a.kind === "business" && !a.business) {
      ctx.addIssue({ code: "custom", path: ["business"], message: "business applicants need a business profile" })
    }
    if (a.kind === "personal" && a.business) {
      ctx.addIssue({ code: "custom", path: ["business"], message: "personal applicants have no business profile" })
    }
    const accountIds = new Set(a.accounts.map((acc) => acc.accountId))
    a.transactions.forEach((t, i) => {
      if (!accountIds.has(t.accountId)) {
        ctx.addIssue({ code: "custom", path: ["transactions", i, "accountId"], message: `unknown account ${t.accountId}` })
      }
    })
  })

/**
 * What the decision engine is allowed to see: no protected attributes, no
 * names, no story, no location.
 */
export type EngineInput = Omit<z.infer<typeof Applicant>, "protected" | "displayName" | "story" | "province">

export function toEngineInput(applicant: z.infer<typeof Applicant>): EngineInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { protected: _p, displayName: _d, story: _s, province: _pr, ...rest } = applicant
  return rest
}

export type ProtectedAttributes = z.infer<typeof ProtectedAttributes>
export type CreditRequest = z.infer<typeof CreditRequest>
export type CreditFile = z.infer<typeof CreditFile>
export type Relationship = z.infer<typeof Relationship>
export type BusinessProfile = z.infer<typeof BusinessProfile>
export type Applicant = z.infer<typeof Applicant>
