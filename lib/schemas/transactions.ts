import { z } from "zod"
import { IsoDate, IsoDateTime, PositiveCents, Cents, prefixedId } from "./common"

/*
 * Accounts and transactions, loosely modelled on the FDX (Financial Data
 * Exchange) data structure: account, transaction id, posted date, amount,
 * credit/debit memo, description, category, merchant.
 *
 * "FDX-inspired" only. Canada's draft Consumer-Driven Banking Regulations
 * (Canada Gazette Part I, 2026-06-27) leave the technical standard to a body
 * the Minister of Finance will designate, and do not name FDX.
 * https://gazette.gc.ca/rp-pr/p1/2026/2026-06-27/html/reg3-eng.html
 */

export const AccountType = z.enum([
  "CHECKING",
  "SAVINGS",
  "BUSINESS_CHECKING",
  "BUSINESS_SAVINGS",
  "CREDIT_CARD",
  "LINE_OF_CREDIT",
  "LOAN",
])

/** Where the account is held. `other` is an unnamed, fictional institution. */
export const AccountProvider = z.enum(["northgate", "kite", "aspen", "other"])

export const Account = z.object({
  accountId: prefixedId("acc"),
  accountType: AccountType,
  provider: AccountProvider,
  nickname: z.string(),
  openedDate: IsoDate,
  currency: z.literal("CAD"),
  /**
   * Balance at the start of the transaction window, in cents. For deposit
   * accounts, money held; for credit accounts, amount owed.
   */
  openingBalanceCents: Cents,
  /** Credit limit for card and line-of-credit accounts. */
  creditLimitCents: PositiveCents.optional(),
})

export const TransactionCategory = z.enum([
  // inflows
  "PAYROLL",
  "GIG_INCOME",
  /** Direct customer or client payments: invoices, contracts, platform payouts to a business. */
  "BUSINESS_REVENUE",
  /** Batched card sales deposited by a payment processor. */
  "CARD_SETTLEMENT",
  "CASH_DEPOSIT",
  "GOVERNMENT_BENEFIT",
  "PENSION",
  "TRANSFER_IN",
  "PAYMENT_REVERSAL",
  "OTHER_INCOME",
  // outflows
  "RENT_MORTGAGE",
  "UTILITIES",
  "GROCERIES",
  "TRANSPORT",
  "FUEL",
  "INSURANCE",
  "LOAN_PAYMENT",
  "CARD_PAYMENT",
  "PAYROLL_EXPENSE",
  "SUPPLIES_INVENTORY",
  "EQUIPMENT",
  "RENT_COMMERCIAL",
  "TAXES",
  "BANK_FEE",
  "NSF_FEE",
  "DINING",
  "SUBSCRIPTIONS",
  "SHOPPING",
  "CASH_WITHDRAWAL",
  "TRANSFER_OUT",
  "OTHER_SPENDING",
])

/** How the money moved. CASH matters for FINTRAC large cash checks. */
export const Channel = z.enum(["CASH", "CARD", "EFT", "PAD", "ETRANSFER", "CHEQUE", "ATM", "INTERNAL"])

export const Transaction = z.object({
  transactionId: prefixedId("txn"),
  accountId: prefixedId("acc"),
  postedDate: IsoDate,
  /** Time the transaction happened. Needed for the FINTRAC 24-hour rule. */
  transactionTimestamp: IsoDateTime,
  /** Always positive; direction comes from debitCreditMemo. */
  amountCents: PositiveCents.refine((v) => v > 0, "amount must be greater than zero"),
  debitCreditMemo: z.enum(["CREDIT", "DEBIT"]),
  description: z.string().min(1),
  category: TransactionCategory,
  merchant: z.string().optional(),
  channel: Channel,
  /**
   * Set on a reversal credit when an earlier debit was returned unpaid
   * (e.g. a pre-authorized debit bounced for insufficient funds).
   */
  returnOf: z
    .object({
      transactionId: prefixedId("txn"),
      /** Payments Canada return reason code, e.g. "901" (NSF). See servicing.ts. */
      reasonCode: z.string().regex(/^9\d\d$/),
    })
    .optional(),
})

export type AccountType = z.infer<typeof AccountType>
export type Account = z.infer<typeof Account>
export type TransactionCategory = z.infer<typeof TransactionCategory>
export type Channel = z.infer<typeof Channel>
export type Transaction = z.infer<typeof Transaction>
