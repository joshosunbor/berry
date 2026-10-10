import { z } from "zod"
import {
  Bps,
  Cents,
  InstitutionId,
  IsoDate,
  IsoDateTime,
  Mode,
  PositiveCents,
  ProductType,
  Structure,
  SubjectRef,
  prefixedId,
} from "./common"

/* Money movement after approval: funding, ledger, collections, returns, recovery, reconciliation. */

export const LoanStatus = z.enum([
  "approved",
  "funding",
  "funded",
  "active",
  "delinquent",
  "hardship",
  "paid_off",
  "charged_off",
])

/**
 * Funding rails. RTR is simulated: Payments Canada's Real-Time Rail is
 * launching in phases from Q4 2026.
 * https://www.payments.ca/real-time-rail-payment-system
 */
export const FundingRail = z.enum(["aft", "etransfer", "rtr_simulated"])

export const Loan = z.object({
  id: prefixedId("loan"),
  applicantId: prefixedId("apl"),
  decisionId: prefixedId("dec"),
  mode: Mode,
  institutionId: InstitutionId,
  product: ProductType,
  structure: Structure,
  limitCents: PositiveCents,
  aprBps: Bps,
  termMonths: z.number().int().positive().nullable(),
  status: LoanStatus,
  approvedAt: IsoDateTime,
  fundedAt: IsoDateTime.optional(),
  padAgreementId: prefixedId("pad").optional(),
})

/**
 * Pre-authorized debit agreement, per Payments Canada Rule H1
 * (https://www.payments.ca/sites/default/files/h1eng.pdf):
 * - categories: personal, business (also funds transfer, cash management)
 * - confirmation at least 10 calendar days before the first debit
 * - pre-notification at least 10 calendar days before a change, or before
 *   each variable-amount debit, unless reduced or waived in the agreement
 * - recourse: 90 calendar days (personal), 10 business days (business)
 */
export const PadAgreement = z.object({
  id: prefixedId("pad"),
  loanId: prefixedId("loan"),
  category: z.enum(["personal", "business"]),
  amountType: z.enum(["fixed", "variable"]),
  frequency: z.enum(["monthly", "biweekly", "seasonal"]),
  signedAt: IsoDateTime,
  confirmationSentAt: IsoDateTime.optional(),
  preNotificationDays: z.number().int().nonnegative(),
  preNotificationWaived: z.boolean(),
  cancellationInstructions: z.string(),
  recourseStatement: z.string(),
  payeeContact: z.string(),
})

export const AccountVerification = z.object({
  result: z.enum(["match", "close_match", "no_match"]),
  checkedAt: IsoDateTime,
  scamWarningShown: z.boolean(),
  simulated: z.literal(true),
})

export const Disbursement = z.object({
  id: prefixedId("dsb"),
  loanId: prefixedId("loan"),
  rail: FundingRail,
  amountCents: PositiveCents,
  initiatedAt: IsoDateTime,
  completedAt: IsoDateTime.optional(),
  accountVerification: AccountVerification.optional(),
  aftFileId: prefixedId("aft").optional(),
})

export const LedgerEntryType = z.enum([
  "disbursement",
  "draw",
  "interest_accrual",
  "fee",
  "payment",
  "payment_return",
  "adjustment",
  "deferral",
  "write_off",
])

/**
 * One immutable ledger line. Sign convention: positive increases what the
 * borrower owes, negative reduces it. Corrections are new entries
 * (`reversesEntryId`), never edits.
 */
export const LedgerEntry = z.object({
  id: prefixedId("led"),
  loanId: prefixedId("loan"),
  seq: z.number().int().nonnegative(),
  type: LedgerEntryType,
  amountCents: Cents,
  effectiveDate: IsoDate,
  postedAt: IsoDateTime,
  memo: z.string(),
  ref: SubjectRef.optional(),
  reversesEntryId: prefixedId("led").optional(),
})

export const ScheduledPayment = z.object({
  id: prefixedId("sch"),
  loanId: prefixedId("loan"),
  dueDate: IsoDate,
  amountCents: PositiveCents,
  principalCents: PositiveCents,
  interestCents: PositiveCents,
  status: z.enum(["scheduled", "pre_notified", "submitted", "paid", "returned", "deferred", "skipped"]),
})

export const Collection = z.object({
  id: prefixedId("col"),
  scheduledPaymentId: prefixedId("sch"),
  loanId: prefixedId("loan"),
  /** 1 for the original debit, 2+ for retries. */
  attempt: z.number().int().positive(),
  submittedDate: IsoDate,
  settlementDate: IsoDate.optional(),
  amountCents: PositiveCents,
  status: z.enum(["submitted", "settled", "returned"]),
})

/**
 * Payments Canada AFT/PAD return reason codes, from the Standard 017 Part C
 * mapping of Standard 005 return records.
 * https://paiements.ca/sites/default/files/2022-08/part_c_of_5_payment_return.pdf
 */
export const RETURN_CODES = {
  "900": "Edit reject",
  "901": "NSF (debit only)",
  "902": "Account not found",
  "903": "Payment stopped/recalled",
  "905": "Account closed",
  "907": "No debit allowed",
  "908": "Funds not cleared",
  "910": "Payor/payee deceased",
  "911": "Account frozen",
  "912": "Invalid/incorrect account number",
  "914": "Incorrect payor/payee name",
  "915": "No agreement existed",
  "917": "Agreement revoked (personal)",
  "920": "Agreement revoked (business)",
} as const

export const ReturnCode = z.enum(Object.keys(RETURN_CODES) as [keyof typeof RETURN_CODES, ...(keyof typeof RETURN_CODES)[]])

export const PaymentReturn = z.object({
  id: prefixedId("ret"),
  collectionId: prefixedId("col"),
  loanId: prefixedId("loan"),
  code: ReturnCode,
  returnedDate: IsoDate,
  amountCents: PositiveCents,
})

export const RecoveryActionType = z.enum([
  "retry",
  "notify_borrower",
  "outreach_task",
  "request_banking_details",
  "hardship_offer",
  "escalate",
])

export const RecoveryAction = z.object({
  id: prefixedId("rec"),
  loanId: prefixedId("loan"),
  paymentReturnId: prefixedId("ret").optional(),
  type: RecoveryActionType,
  scheduledFor: IsoDate,
  status: z.enum(["planned", "done", "cancelled"]),
  /** Plain-language reason, e.g. "Retry on next payroll date (Friday)". */
  reason: z.string().min(1),
})

export const ReconciliationMatch = z.object({
  id: prefixedId("rcn"),
  collectionId: prefixedId("col").optional(),
  paymentReturnId: prefixedId("ret").optional(),
  ledgerEntryId: prefixedId("led").optional(),
  status: z.enum(["matched", "unmatched", "amount_mismatch"]),
  differenceCents: Cents,
  queueItemId: prefixedId("q").optional(),
})

export type LoanStatus = z.infer<typeof LoanStatus>
export type FundingRail = z.infer<typeof FundingRail>
export type Loan = z.infer<typeof Loan>
export type PadAgreement = z.infer<typeof PadAgreement>
export type Disbursement = z.infer<typeof Disbursement>
export type LedgerEntryType = z.infer<typeof LedgerEntryType>
export type LedgerEntry = z.infer<typeof LedgerEntry>
export type ScheduledPayment = z.infer<typeof ScheduledPayment>
export type Collection = z.infer<typeof Collection>
export type ReturnCode = z.infer<typeof ReturnCode>
export type PaymentReturn = z.infer<typeof PaymentReturn>
export type RecoveryAction = z.infer<typeof RecoveryAction>
export type ReconciliationMatch = z.infer<typeof ReconciliationMatch>
