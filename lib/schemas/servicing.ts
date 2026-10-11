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

/*
 * Double-entry ledger. Every journal entry has two or more lines; each line
 * is a debit or a credit in integer cents, never both; total debits equal
 * total credits. Entries are append-only: a correction is a new entry that
 * reverses the original.
 *
 * Accounts are named "<kind>:<owner>": per-loan receivables
 * (principal:<loanId>, interest:<loanId>) and per-lender accounts
 * (settlement, clearing, interest_income, credit_loss).
 */
export const LedgerAccountKind = z.enum(["principal", "interest", "settlement", "clearing", "interest_income", "credit_loss"])
export const LedgerAccount = z.string().regex(/^(principal|interest|settlement|clearing|interest_income|credit_loss):[a-z0-9_-]+$/)

export const JournalLine = z
  .object({
    account: LedgerAccount,
    debitCents: PositiveCents,
    creditCents: PositiveCents,
  })
  .refine((l) => (l.debitCents > 0) !== (l.creditCents > 0), "a line is either a debit or a credit, not both or neither")

export const JournalEntryType = z.enum([
  "disbursement",
  "draw",
  "interest_accrual",
  "collection_sent",
  "collection_settled",
  "return_from_clearing",
  "return_after_settlement",
  "charge_off",
  "reversal",
])

export const JournalEntry = z
  .object({
    id: prefixedId("jrn"),
    seq: z.number().int().nonnegative(),
    institutionId: InstitutionId,
    loanId: prefixedId("loan").optional(),
    type: JournalEntryType,
    date: IsoDate,
    memo: z.string().min(1),
    ref: SubjectRef.optional(),
    reversesEntryId: prefixedId("jrn").optional(),
    lines: z.array(JournalLine).min(2),
  })
  .refine((e) => e.lines.reduce((s, l) => s + l.debitCents, 0) === e.lines.reduce((s, l) => s + l.creditCents, 0), {
    message: "debits must equal credits",
    path: ["lines"],
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
 * Payments Canada return reason codes, with the exact labels in Standard
 * 007 ("List of Return Reason Codes", amendment effective July 3, 2026),
 * which Standard 005 and the Standard 017 ISO 20022 guidelines both refer
 * to. Every code listed was confirmed in Standard 007.
 * https://www.payments.ca/sites/default/files/standard007eng.pdf
 * There is no ISO 20022 reason-code mapping: returns carry the CPA code.
 */
export const RETURN_CODES = {
  "900": { label: "Edit Reject", applies: "debits and credits" },
  "901": { label: "NSF (Debit Only)", applies: "debits only" },
  "902": { label: "Account not found", applies: "debits and credits" },
  "903": { label: "Payment Stopped/Recalled", applies: "debits and credits" },
  "905": { label: "Account Closed", applies: "debits and credits" },
  "907": { label: "No Debit Allowed", applies: "debits and credits" },
  "908": { label: "Funds Not Cleared (Debit Only)", applies: "debits only" },
  "909": { label: "Currency/Account Mismatch", applies: "debits and credits" },
  "910": { label: "Payor/Payee Deceased", applies: "debits and credits" },
  "911": { label: "Account Frozen", applies: "debits and credits" },
  "912": { label: "Invalid/Incorrect Account No.", applies: "debits and credits" },
  "914": { label: "Incorrect Payor/Payee Name", applies: "debits and credits" },
  "915": { label: "No Agreement Existed", applies: "debits only" },
  "916": { label: "Not According to Agreement – Personal", applies: "debits only" },
  "917": { label: "Agreement Revoked – Personal", applies: "debits only" },
  "918": { label: "No Confirmation/Pre-Notification – Personal", applies: "debits only" },
  "919": { label: "Not According to Agreement – Business", applies: "debits only" },
  "920": { label: "Agreement Revoked – Business", applies: "debits only" },
  "921": { label: "No Confirmation/Pre-Notification – Business", applies: "debits only" },
  "922": { label: "Customer Initiated Return", applies: "credits only" },
} as const

export const RETURN_CODES_SOURCE = "https://www.payments.ca/sites/default/files/standard007eng.pdf"

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
  journalEntryId: prefixedId("jrn").optional(),
  status: z.enum(["matched", "unmatched", "amount_mismatch"]),
  differenceCents: Cents,
  queueItemId: prefixedId("q").optional(),
})

export type LoanStatus = z.infer<typeof LoanStatus>
export type FundingRail = z.infer<typeof FundingRail>
export type Loan = z.infer<typeof Loan>
export type PadAgreement = z.infer<typeof PadAgreement>
export type Disbursement = z.infer<typeof Disbursement>
export type LedgerAccountKind = z.infer<typeof LedgerAccountKind>
export type JournalLine = z.infer<typeof JournalLine>
export type JournalEntryType = z.infer<typeof JournalEntryType>
export type JournalEntry = z.infer<typeof JournalEntry>
export type ScheduledPayment = z.infer<typeof ScheduledPayment>
export type Collection = z.infer<typeof Collection>
export type ReturnCode = z.infer<typeof ReturnCode>
export type PaymentReturn = z.infer<typeof PaymentReturn>
export type RecoveryAction = z.infer<typeof RecoveryAction>
export type ReconciliationMatch = z.infer<typeof ReconciliationMatch>
