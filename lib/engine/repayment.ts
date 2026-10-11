import type { Features } from "@/lib/engine/features"
import type { Decision } from "@/lib/schemas"

/*
 * Pre-authorized debit (PAD) repayment schedules, following Payments Canada
 * Rule H1 (https://www.payments.ca/sites/default/files/h1eng.pdf):
 * - s.16: confirmation at least 10 calendar days before the first PAD
 * - s.17: pre-notification at least 10 calendar days before each
 *   variable-amount PAD (after the first) and before any change
 * - s.24: recourse of 90 calendar days (personal) or 10 business days (business)
 * - Appendix II: mandatory agreement elements, including the verbatim
 *   recourse statement
 * Berry never waives confirmation or pre-notification.
 *
 * Interest is illustrative: simple monthly compounding at the decision's APR,
 * in integer cents. Revolving and seasonal schedules assume the line is fully
 * drawn on day one (illustrative).
 */

export const PAD_RULES = {
  confirmationDays: 10,
  preNotificationDays: 10,
  recourse: { personal: "90 calendar days", business: "10 business days" },
  maxCancellationNoticeDays: 30,
  /** The notice period Berry's agreements set, within the 30-day maximum. */
  cancellationNoticeDays: 10,
  /** Revolving minimum payment: interest plus this share of the balance (illustrative). */
  revolvingPrincipalRate: 0.02,
  source: "https://www.payments.ca/sites/default/files/h1eng.pdf",
} as const

/** Rule H1 Appendix II recourse statement, used verbatim (personal and business PADs). */
export const RECOURSE_STATEMENT =
  "You have certain recourse rights if any debit does not comply with this agreement. For example, you have the right to receive reimbursement for any debit that is not authorized or is not consistent with this PAD Agreement. To obtain more information on your recourse rights, contact your financial institution or visit www.payments.ca."

export type Frequency = "monthly" | "biweekly" | "seasonal"

export interface ScheduledDebit {
  n: number
  date: string
  amountCents: number
  interestCents: number
  principalCents: number
  balanceAfterCents: number
  /** For variable-amount debits: the latest date the borrower must be told the amount. */
  preNotifyBy?: string
}

export interface ChecklistItem {
  element: string
  detail: string
  reference: string
}

export interface PadPlan {
  category: "personal" | "business"
  frequency: Frequency
  amountType: "fixed" | "variable"
  agreementSignedOn: string
  confirmationSentOn: string
  firstDebitOn: string
  debits: ScheduledDebit[]
  totalPrincipalCents: number
  totalInterestCents: number
  assumptions: string[]
  checklist: ChecklistItem[]
}

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => {
  const x = d(s)
  x.setUTCDate(x.getUTCDate() + n)
  return iso(x)
}
/** A debit due on a weekend is presented on the next business day (illustrative: holidays not modelled). */
const onBusinessDay = (s: string) => {
  let x = s
  while ([0, 6].includes(d(x).getUTCDay())) x = addDays(x, 1)
  return x
}
const addMonths = (s: string, n: number, day: number) => {
  const x = d(s)
  const y = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1))
  const last = new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth() + 1, 0)).getUTCDate()
  return iso(new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), Math.min(day, last))))
}

function amortized(principal: number, aprBps: number, periodsPerYear: number, n: number): number {
  const r = aprBps / 10_000 / periodsPerYear
  if (r === 0) return Math.ceil(principal / n)
  return Math.ceil((principal * r) / (1 - Math.pow(1 + r, -n)))
}

export interface PadInput {
  decision: Decision
  features: Pick<Features, "income">
  kind: "personal" | "business"
  agreementSignedOn: string
}

export function buildPadPlan({ decision, features, kind, agreementSignedOn }: PadInput): PadPlan {
  if (decision.outcome === "decline" || decision.outcome === "refer" || decision.aprBps === null || !decision.structure) {
    throw new Error("A PAD plan needs an approved decision")
  }
  const principal = decision.limitCents
  const apr = decision.aprBps
  const confirmationSentOn = agreementSignedOn
  const earliest = addDays(confirmationSentOn, PAD_RULES.confirmationDays)
  const debits: ScheduledDebit[] = []
  const assumptions: string[] = []
  let frequency: Frequency
  let amountType: "fixed" | "variable"

  if (decision.structure === "term") {
    const payroll = features.income.payroll
    const biweekly = kind === "personal" && payroll?.cadenceDays === 14
    frequency = biweekly ? "biweekly" : "monthly"
    amountType = "fixed"
    const term = decision.termMonths ?? 12
    const periods = biweekly ? Math.round((term * 26) / 12) : term
    const perYear = biweekly ? 26 : 12
    const payment = amortized(principal, apr, perYear, periods)
    // Bi-weekly debits land on payday; monthly debits on the 1st.
    let date = biweekly ? payroll!.nextExpectedDate : addMonths(earliest, 1, 1)
    while (date < earliest) date = biweekly ? addDays(date, 14) : addMonths(date, 1, 1)
    let balance = principal
    for (let n = 1; n <= periods; n++) {
      const interest = Math.round((balance * apr) / 10_000 / perYear)
      const principalPart = n === periods ? balance : Math.min(balance, payment - interest)
      balance -= principalPart
      debits.push({ n, date: onBusinessDay(date), amountCents: principalPart + interest, interestCents: interest, principalCents: principalPart, balanceAfterCents: balance })
      date = biweekly ? addDays(date, 14) : addMonths(date, 1, 1)
    }
    if (biweekly) assumptions.push("Debits fall on the borrower's payday, every 14 days, to match how they're paid.")
  } else if (decision.structure === "seasonal_operating") {
    frequency = "seasonal"
    amountType = "variable"
    const peak = features.income.peakMonths
    let date = addMonths(earliest, 1, 1)
    let balance = principal
    const perPeak = Math.ceil(principal / peak.length)
    for (let n = 1; n <= 12; n++) {
      const month = d(date).getUTCMonth() + 1
      const interest = Math.round((balance * apr) / 10_000 / 12)
      const principalPart = peak.includes(month) ? Math.min(balance, perPeak) : 0
      balance -= principalPart
      debits.push({ n, date: onBusinessDay(date), amountCents: principalPart + interest, interestCents: interest, principalCents: principalPart, balanceAfterCents: balance })
      date = addMonths(date, 1, 1)
    }
    assumptions.push("Assumes the line is fully drawn on day one (illustrative). Interest only in quiet months; principal is repaid from peak-season sales.")
  } else {
    frequency = "monthly"
    amountType = "variable"
    let date = addMonths(earliest, 1, 1)
    let balance = principal
    for (let n = 1; n <= 12; n++) {
      const interest = Math.round((balance * apr) / 10_000 / 12)
      const principalPart = Math.min(balance, Math.ceil(balance * PAD_RULES.revolvingPrincipalRate))
      balance -= principalPart
      debits.push({ n, date: onBusinessDay(date), amountCents: principalPart + interest, interestCents: interest, principalCents: principalPart, balanceAfterCents: balance })
      date = addMonths(date, 1, 1)
    }
    assumptions.push(
      `Assumes the full limit is drawn on day one and only the minimum is paid: interest plus ${PAD_RULES.revolvingPrincipalRate * 100}% of the balance (illustrative). The first 12 months are shown.`,
    )
  }

  if (amountType === "variable") {
    debits.forEach((x, i) => {
      if (i > 0) x.preNotifyBy = addDays(x.date, -PAD_RULES.preNotificationDays)
    })
  }

  return {
    category: kind,
    frequency,
    amountType,
    agreementSignedOn,
    confirmationSentOn,
    firstDebitOn: debits[0].date,
    debits,
    totalPrincipalCents: debits.reduce((s, x) => s + x.principalCents, 0),
    totalInterestCents: debits.reduce((s, x) => s + x.interestCents, 0),
    assumptions,
    checklist: checklist(kind, frequency, amountType, confirmationSentOn, debits[0].date),
  }
}

function checklist(kind: "personal" | "business", frequency: Frequency, amountType: "fixed" | "variable", confirmation: string, first: string): ChecklistItem[] {
  const timing = frequency === "biweekly" ? "every 14 days (bi-weekly)" : frequency === "seasonal" ? "monthly, larger in peak-season months" : "monthly"
  return [
    { element: "Date and signature", detail: "Execution date recorded; electronic signature captured.", reference: "H1 Appendix II" },
    { element: "Authority to debit account", detail: "Borrower authorizes the lender to debit the account they name, clearly and unambiguously.", reference: "H1 Appendix II" },
    { element: "PAD category", detail: kind === "personal" ? "Personal" : "Business", reference: "H1 Appendix II" },
    { element: "Amount and timing", detail: `${amountType === "fixed" ? "Fixed" : "Variable"} amount, ${timing}.`, reference: "H1 Appendix II" },
    {
      element: "Cancellation",
      detail: `The borrower may cancel at any time with ${PAD_RULES.cancellationNoticeDays} days' notice (the agreement may set no more than ${PAD_RULES.maxCancellationNoticeDays} calendar days). A sample cancellation form is available from their financial institution or www.payments.ca.`,
      reference: "H1 Appendix II; s.30",
    },
    { element: "Contact information", detail: "Lender contact details for questions, privacy, information and recourse.", reference: "H1 Appendix II" },
    { element: "Recourse statement (verbatim)", detail: RECOURSE_STATEMENT, reference: "H1 Appendix II" },
    {
      element: "Confirmation",
      detail: `Sent ${confirmation}, at least ${PAD_RULES.confirmationDays} calendar days before the first debit on ${first}. Not waived.`,
      reference: "H1 s.16",
    },
    {
      element: "Pre-notification",
      detail:
        amountType === "variable"
          ? `The amount and date of each debit after the first are sent at least ${PAD_RULES.preNotificationDays} calendar days ahead. Not waived.`
          : `Fixed amount: notice at least ${PAD_RULES.preNotificationDays} calendar days before any change to the amount or dates. Not waived.`,
      reference: "H1 s.17",
    },
    { element: "Recourse period", detail: `The borrower can claim reimbursement for a debit that does not follow the agreement within ${PAD_RULES.recourse[kind]}.`, reference: "H1 s.24" },
  ]
}
