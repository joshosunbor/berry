import { formatCents } from "@/lib/money"
import { addBusinessDays } from "@/lib/rules/nsf"
import type { FundingRail } from "@/lib/schemas"
import { nameSimilarity } from "@/lib/onboarding/names"
import { SERVICING, type ServicingConfig } from "./config"

/*
 * Funding rails. The lender chooses how to send the loan:
 * - AFT: batch file (Standard 005 layout), funds available next business day
 * - Interac e-Transfer: minutes; lender-set limit (illustrative)
 * - Real-Time Rail: seconds. SIMULATED: Payments Canada's Real-Time Rail is
 *   launching in phases from Q4 2026; lenders cannot fund on it today.
 * Costs and timings are illustrative.
 */

export const RTR_LABEL = "simulated — RTR launching"

export interface RailInfo {
  rail: FundingRail
  name: string
  /** Shown next to the name wherever the rail appears. */
  badge?: string
  timing: string
  reversibility: string
  fraud: string
  instant: boolean
}

export const RAILS: Record<FundingRail, RailInfo> = {
  aft: {
    rail: "aft",
    name: "AFT",
    timing: "Next business day: sent in the day's batch file, available the next morning",
    reversibility: "A credit can be returned by the receiving institution (for example, account closed), so funds can come back days later.",
    fraud: "Lower risk of a rushed mistake: there is time to catch an error before funds land.",
    instant: false,
  },
  etransfer: {
    rail: "etransfer",
    name: "Interac e-Transfer",
    timing: "Usually minutes",
    reversibility: "Final once deposited.",
    fraud: "Fast and final, so the account must be verified first; a common target for redirection scams.",
    instant: true,
  },
  rtr_simulated: {
    rail: "rtr_simulated",
    name: "Real-Time Rail",
    badge: RTR_LABEL,
    timing: "Seconds, any time",
    reversibility: "Final once sent.",
    fraud: "Irrevocable and instant: verify the account and warn about scams before sending.",
    instant: true,
  },
}

// ---------------------------------------------------------------------------
// Account verification (simulated name-and-account match)
// ---------------------------------------------------------------------------

export type VerificationResult = "match" | "close_match" | "no_match"

export interface AccountVerificationOutcome {
  result: VerificationResult
  /** Plain language; never includes a name. */
  message: string
  scamWarning: string
  canFund: "yes" | "after_confirming" | "no"
  simulated: true
}

const SCAM_WARNING =
  "Before sending: confirm the account with the borrower through a channel you already trust. Scammers ask for loans to be sent to a new account at the last minute."

/** Compares the name the receiving institution holds for the account with the borrower's name. */
export function verifyAccount(nameOnAccount: string, borrowerName: string): AccountVerificationOutcome {
  const score = nameSimilarity(nameOnAccount, borrowerName)
  if (score === 1) {
    return { result: "match", message: "The name on the account matches the borrower.", scamWarning: SCAM_WARNING, canFund: "yes", simulated: true }
  }
  if (score >= 0.5) {
    return {
      result: "close_match",
      message: "The name on the account is close to the borrower's, but not exact (for example, initials or a missing part of a name). Confirm with the borrower before sending.",
      scamWarning: SCAM_WARNING,
      canFund: "after_confirming",
      simulated: true,
    }
  }
  return { result: "no_match", message: "The name on the account doesn't match the borrower. Don't send funds to this account.", scamWarning: SCAM_WARNING, canFund: "no", simulated: true }
}

// ---------------------------------------------------------------------------
// Funding
// ---------------------------------------------------------------------------

export interface FundingRequest {
  loanId: string
  amountCents: number
  rail: FundingRail
  /** Local date-time the lender sends the funds, e.g. 2026-10-06T10:00. */
  initiatedAt: string
  verification?: AccountVerificationOutcome
  /** For a close match: the lender confirmed the account with the borrower. */
  confirmedWithBorrower?: boolean
}

export interface FundingResult {
  loanId: string
  rail: FundingRail
  amountCents: number
  initiatedAt: string
  completedAt: string
  /** The date the loan is funded in the ledger. */
  fundedOn: string
  timeToFundMinutes: number
  costCents: number
  label?: string
}

export class FundingBlocked extends Error {}

const minutesBetween = (a: string, b: string) => Math.round((Date.parse(`${b}Z`) - Date.parse(`${a}Z`)) / 60_000)
const addMinutes = (at: string, m: number) => new Date(Date.parse(`${at}Z`) + m * 60_000).toISOString().slice(0, 16)

export function fund(req: FundingRequest, config: ServicingConfig = SERVICING): FundingResult {
  if (!Number.isInteger(req.amountCents) || req.amountCents <= 0) throw new Error("funding amount must be a positive number of cents")
  const info = RAILS[req.rail]
  if (info.instant) {
    if (!req.verification) throw new FundingBlocked(`${info.name} is instant and final: verify the account first.`)
    if (req.verification.canFund === "no") throw new FundingBlocked("Account verification failed: the name doesn't match. Funds were not sent.")
    if (req.verification.canFund === "after_confirming" && !req.confirmedWithBorrower) {
      throw new FundingBlocked("Close match: confirm the account with the borrower before sending.")
    }
  }
  if (req.rail === "etransfer" && req.amountCents > config.rails.etransfer.limitCents) {
    throw new FundingBlocked(`Interac e-Transfer is limited to ${formatCents(config.rails.etransfer.limitCents, { whole: true })} per transfer here (illustrative), so use AFT for this amount.`)
  }

  let completedAt: string
  if (req.rail === "aft") {
    const date = req.initiatedAt.slice(0, 10)
    const sendDate = req.initiatedAt.slice(11) <= config.rails.aft.cutoffLocal ? date : addBusinessDays(date, 1)
    completedAt = `${addBusinessDays(sendDate, 1)}T${config.rails.aft.availableLocal}`
  } else if (req.rail === "etransfer") {
    completedAt = addMinutes(req.initiatedAt, config.rails.etransfer.minutesToComplete)
  } else {
    completedAt = new Date(Date.parse(`${req.initiatedAt}Z`) + config.rails.rtr_simulated.secondsToComplete * 1000).toISOString().slice(0, 19)
  }
  return {
    loanId: req.loanId,
    rail: req.rail,
    amountCents: req.amountCents,
    initiatedAt: req.initiatedAt,
    completedAt,
    fundedOn: completedAt.slice(0, 10),
    timeToFundMinutes: Math.max(0, minutesBetween(req.initiatedAt, completedAt.slice(0, 16))),
    costCents: config.rails[req.rail].costCents,
    label: info.badge,
  }
}

export function formatTimeToFund(minutes: number): string {
  if (minutes < 1) return "Seconds"
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
