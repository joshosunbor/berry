import type { Features } from "@/lib/engine/features"
import { isBusinessDay } from "@/lib/rules/nsf"
import { SERVICING } from "@/lib/servicing/config"
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

export interface Draw {
  date: string
  amountCents: number
}

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
  /** Null when nothing is due (an operating line that isn't drawn). */
  firstDebitOn: string | null
  debits: ScheduledDebit[]
  /** Seasonal lines only: when money is drawn on the line, and how much. */
  draws?: Draw[]
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
/** A debit due on a weekend or a non-processing day is presented on the next business day (holiday calendar illustrative). */
const onBusinessDay = (s: string) => {
  let x = s
  while (!isBusinessDay(x)) x = addDays(x, 1)
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
  features: Pick<Features, "income" | "monthly" | "avgMonthlyOutflowCents">
  kind: "personal" | "business"
  agreementSignedOn: string
  /** Months of average spending a seasonal line keeps in the account (illustrative config). */
  operatingReserveMonths?: number
}

export function buildPadPlan({ decision, features, kind, agreementSignedOn, operatingReserveMonths = SERVICING.operatingReserveMonthsOfSpending }: PadInput): PadPlan {
  if (decision.outcome === "decline" || decision.outcome === "refer" || decision.aprBps === null || !decision.structure) {
    throw new Error("A PAD plan needs an approved decision")
  }
  const principal = decision.limitCents
  const apr = decision.aprBps
  const confirmationSentOn = agreementSignedOn
  const earliest = addDays(confirmationSentOn, PAD_RULES.confirmationDays)
  const debits: ScheduledDebit[] = []
  const assumptions: string[] = []
  let planDraws: Draw[] | undefined
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
    // An operating line is a limit, not a lump sum. The borrower spends its
    // own cash first; the line is drawn only to keep the operating reserve
    // (operatingReserveMonthsOfSpending of average spending, illustrative
    // config; 1 month by default) in the account. Each quiet month's
    // need comes from the lowest balance that calendar month reached in the
    // borrower's own history; the first peak month's dip counts toward the
    // last draw before the peak. Draws accumulate until the peak sweep and
    // never exceed the limit. Interest is charged monthly in arrears on the
    // drawn balance only. Whatever isn't drawn is headroom (e.g. for a poor
    // harvest or a price drop).
    frequency = "seasonal"
    amountType = "variable"
    const peak = features.income.peakMonths
    const monthOf = (iso: string) => d(iso).getUTCMonth() + 1
    const start = addMonths(earliest, 1, 1)
    const quiet: string[] = []
    let firstPeak: string | null = null
    for (let i = 0, probe = start; i < 24; i++, probe = addMonths(probe, 1, 1)) {
      if (!peak.includes(monthOf(probe))) quiet.push(probe)
      else if (quiet.length) {
        firstPeak = probe
        break
      }
    }
    const reserve = Math.round(features.avgMonthlyOutflowCents * operatingReserveMonths)
    const lowest = (m: number) => {
      const lows = features.monthly.filter((x) => Number(x.month.slice(5, 7)) === m).map((x) => x.lowBalanceCents)
      return lows.length ? Math.min(...lows) : Infinity
    }
    let target = 0
    const amounts = quiet.map((q, i) => {
      let need = Math.max(0, reserve - lowest(monthOf(q)))
      if (i === quiet.length - 1 && firstPeak) need = Math.max(need, reserve - lowest(monthOf(firstPeak)))
      const next = Math.min(principal, Math.max(target, need))
      const draw = next - target
      target = next
      return draw
    })
    const draws: Draw[] = quiet.map((q, i) => ({ date: onBusinessDay(q), amountCents: amounts[i] })).filter((x) => x.amountCents > 0)
    const totalDrawn = target
    const drawByMonth = new Map(quiet.map((q, i) => [q, amounts[i]]))

    let date = start
    let balance = 0
    let drawn = 0
    let peakStartBalance = 0
    let n = 0
    for (let i = 0; i < 36 && (drawn < totalDrawn || balance > 0); i++) {
      const month = monthOf(date)
      const inPeak = peak.includes(month)
      // Interest in arrears on what was drawn over the past month.
      const interest = Math.round((balance * apr) / 10_000 / 12)
      let principalPart = 0
      if (inPeak && drawn === totalDrawn && balance > 0) {
        if (peakStartBalance === 0) peakStartBalance = balance
        const isLastPeak = !peak.includes((month % 12) + 1)
        principalPart = isLastPeak ? balance : Math.min(balance, Math.ceil(peakStartBalance / peak.length))
      } else if (!inPeak) {
        peakStartBalance = 0
      }
      balance -= principalPart
      if (interest + principalPart > 0) {
        n++
        debits.push({ n, date: onBusinessDay(date), amountCents: principalPart + interest, interestCents: interest, principalCents: principalPart, balanceAfterCents: balance })
      }
      // This month's draw, after the debit.
      const draw = drawByMonth.get(date) ?? 0
      drawn += draw
      balance += draw
      date = addMonths(date, 1, 1)
    }
    assumptions.push(
      "Draws keep one month's average spending in the account: the borrower uses its own cash first, and the line covers only the gap, based on its past year (illustrative). Interest is charged only on what's drawn; principal is repaid from peak-season sales. The rest of the limit is headroom for a poor harvest or a price drop.",
    )
    planDraws = draws
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
    firstDebitOn: debits[0]?.date ?? null,
    debits,
    draws: planDraws,
    totalPrincipalCents: debits.reduce((s, x) => s + x.principalCents, 0),
    totalInterestCents: debits.reduce((s, x) => s + x.interestCents, 0),
    assumptions,
    checklist: checklist(kind, frequency, amountType, confirmationSentOn, debits[0]?.date ?? null),
  }
}

function checklist(kind: "personal" | "business", frequency: Frequency, amountType: "fixed" | "variable", confirmation: string, first: string | null): ChecklistItem[] {
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
      detail: first
        ? `Sent ${confirmation}, at least ${PAD_RULES.confirmationDays} calendar days before the first debit on ${first}. Not waived.`
        : `Sent ${confirmation}. No debits are scheduled until the line is drawn; any first debit will be at least ${PAD_RULES.confirmationDays} calendar days after confirmation. Not waived.`,
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
