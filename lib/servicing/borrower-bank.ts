import { nsfFee, NSF_RULES, type NsfFeeResult } from "@/lib/rules/nsf"
import type { Account } from "@/lib/schemas"
import { SERVICING, type ServicingConfig } from "./config"

/*
 * What the borrower's own bank charges when one of our debits is returned
 * NSF. Berry's lenders charge no fee of their own; this is shown so each
 * recovery choice's cost to the borrower is visible.
 *
 * The NSF fee rules in force 2026-03-12 (cap $10, one fee per 2 business
 * days, none under $10 overdrawn) apply to personal accounts at federally
 * regulated banks, so lib/rules/nsf.ts is applied only there. Provincially
 * regulated credit unions set their own fees: Berry uses an illustrative
 * fee from config.
 */

export const PROVINCIAL_CU_LABEL = "provincially regulated — fee illustrative"

export interface BorrowerAccount {
  institutionType: Account["institutionType"]
  kind: "personal" | "business"
}

export interface BorrowerFee extends Omit<NsfFeeResult, "rule"> {
  rule: NsfFeeResult["rule"] | "provincially_regulated"
  label?: string
}

export function borrowerNsfFee(
  account: BorrowerAccount,
  input: { date: string; shortfallCents: number; priorFeeDates: string[] },
  config: ServicingConfig = SERVICING,
): BorrowerFee {
  if (account.institutionType === "credit_union") {
    return {
      feeCents: config.borrowerBank.provincialCreditUnionNsfFeeCents,
      rule: "provincially_regulated",
      explanation: "The borrower banks at a provincially regulated credit union, which sets its own NSF fee; the federal fee rules for banks don't apply.",
      label: PROVINCIAL_CU_LABEL,
    }
  }
  return nsfFee({ accountKind: account.kind, bankFeeCents: config.borrowerBank.standardNsfFeeCents, ...input })
}

export { NSF_RULES }
