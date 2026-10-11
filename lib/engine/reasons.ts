import { money, monthRange, pct, plural, times } from "./format"

/*
 * Reason codes in two registers (CLAUDE.md §4.4): customer-facing text a
 * member or business owner would understand, and lender-facing text with
 * the figures. Negative codes also say what would change the decision.
 */

export type Evidence = Record<string, number | string | boolean>
type Text = (e: Evidence) => string

interface ReasonDef {
  direction: "positive" | "negative" | "neutral"
  customer: Text
  lender: Text
  counterfactual?: Text
}

const n = (e: Evidence, k: string) => Number(e[k])
const s = (e: Evidence, k: string) => String(e[k])
const months = (e: Evidence, k: string) => s(e, k).split(",").map(Number)

export const REASONS = {
  // ---- positive ---------------------------------------------------------
  STABLE_PAYROLL: {
    direction: "positive",
    customer: (e) => `Your pay arrives regularly, about ${money(n(e, "typicalPayCents"))} every ${n(e, "cadenceDays")} days.`,
    lender: (e) => `Salaried; payroll every ${n(e, "cadenceDays")} days, typical ${money(n(e, "typicalPayCents"))}; income CV ${n(e, "incomeCv")}.`,
  },
  STEADY_REVENUE: {
    direction: "positive",
    customer: (e) => `Your business brings in a steady amount each month, about ${money(n(e, "avgIncomeCents"))}.`,
    lender: (e) => `Steady business revenue ${money(n(e, "avgIncomeCents"))}/month; income CV ${n(e, "incomeCv")}.`,
  },
  GROWING_REVENUE: {
    direction: "positive",
    customer: (e) => `Your income has grown recently, up ${pct(n(e, "trend"))} on the three months before.`,
    lender: (e) => `Income trend +${pct(n(e, "trend"))} (last 3 vs prior 3 months).`,
  },
  CONSISTENT_GIG_INCOME: {
    direction: "positive",
    customer: (e) => `You earn on most days, and it adds up to a steady ${money(n(e, "avgIncomeCents"))} a month.`,
    lender: (e) => `Gig income ${money(n(e, "avgIncomeCents"))}/month from ${n(e, "depositsPerMonth")} deposits/month; monthly CV ${n(e, "incomeCv")}.`,
  },
  STRONG_COVERAGE: {
    direction: "positive",
    customer: (e) => `After your current bills, you'd have about ${times(n(e, "dscr"))} what the new payment needs.`,
    lender: (e) => `DSCR ${times(n(e, "dscr"))} at proposed payment ${money(n(e, "paymentCents"))} (minimum ${times(n(e, "minDscr"))}).`,
  },
  HEALTHY_CASH_BUFFER: {
    direction: "positive",
    customer: (e) => `Your balance would cover about ${plural(n(e, "days"), "day")} of your usual spending.`,
    lender: (e) => `${n(e, "days")} days cash on hand; average balance ${money(n(e, "avgBalanceCents"))}.`,
  },
  NO_RETURNED_PAYMENTS: {
    direction: "positive",
    customer: () => "None of your payments bounced in the last year.",
    lender: () => "No NSF returns in 12 months.",
  },
  ESTABLISHED_CREDIT_HISTORY: {
    direction: "positive",
    customer: (e) => `You have ${plural(Math.floor(n(e, "months") / 12), "year")} of Canadian credit history.`,
    lender: (e) => `Bureau history ${n(e, "months")} months.`,
  },
  LONG_MEMBERSHIP: {
    direction: "positive",
    customer: (e) => `You've been a member for ${plural(Math.floor(n(e, "tenureYears")), "year")} and hold ${plural(n(e, "products"), "product")} with us.`,
    lender: (e) => `Member ${n(e, "tenureYears")} yrs, ${n(e, "products")} products; relationship score ${n(e, "score")}.`,
  },
  RELATIONSHIP_SUPPORTS_APPROVAL: {
    direction: "positive",
    customer: () => "Your history with us helped: we can accept a slightly smaller cushion than usual.",
    lender: (e) => `Relationship exception: DSCR ${times(n(e, "dscr"))} accepted against relationship minimum ${times(n(e, "minDscr"))} (standard ${times(n(e, "standardMinDscr"))}). Approval moves up one authority tier.`,
  },
  SEASONAL_REPAYMENT_FITS: {
    direction: "positive",
    customer: (e) =>
      `Most of your income arrives ${monthRange(months(e, "peakMonths"))}. We've set the line up so you draw on it in quieter months and repay it from those sales.`,
    lender: (e) =>
      `Seasonal: ${pct(n(e, "peakShare"))} of income in ${monthRange(months(e, "peakMonths"))}. Peak-season surplus ${money(n(e, "peakSurplusCents"))} covers the line ${times(n(e, "coverage"))} (minimum ${times(n(e, "minCoverage"))}). Assessed on annual cash flow.`,
  },
  SAVINGS_HABIT: {
    direction: "positive",
    customer: (e) => `You've kept ${money(n(e, "avgBalanceCents"))} on average in your accounts with us.`,
    lender: (e) => `Average Northgate deposit balance ${money(n(e, "avgBalanceCents"))}.`,
  },
  STARTER_PATH: {
    direction: "positive",
    customer: (e) => `Your steady pay and the way you manage your accounts let us offer starter credit of ${money(n(e, "limitCents"))}, even with a short credit history.`,
    lender: (e) => `Thin-file path: ${n(e, "historyMonths")} months bureau history; payroll regular; ${n(e, "days")} days cash on hand.`,
  },

  // ---- negative ---------------------------------------------------------
  RECENT_NSF: {
    direction: "negative",
    customer: (e) => `${plural(n(e, "count"), "payment")} from your account bounced in the last 90 days.`,
    lender: (e) => `${n(e, "count")} NSF returns in 90 days (maximum ${n(e, "max")}).`,
    counterfactual: () => "Approval is more likely once 90 days pass with no bounced payments.",
  },
  NSF_HISTORY: {
    direction: "negative",
    customer: (e) => `${plural(n(e, "count"), "payment")} from your account bounced in the last 12 months.`,
    lender: (e) => `${n(e, "count")} NSF returns in 12 months (policy maximum ${n(e, "max")}).`,
    counterfactual: (e) => `Approval is more likely once a full 12 months pass with at most ${plural(n(e, "max"), "bounced payment")}.`,
  },
  LOW_COVERAGE: {
    direction: "negative",
    customer: (e) => `After your current bills, there isn't quite enough left each month for a ${money(n(e, "paymentCents"))} payment.`,
    lender: (e) => `DSCR ${times(n(e, "dscr"))} at ${money(n(e, "paymentCents"))}/month, below minimum ${times(n(e, "minDscr"))}.`,
    counterfactual: (e) =>
      n(e, "maxAffordableCents") > 0
        ? `Approval is likely for ${money(n(e, "maxAffordableCents"))} or less, or if your monthly cash left over rises.`
        : "Approval is more likely if your monthly cash left over rises or your existing payments go down.",
  },
  INCOME_TOO_VARIABLE: {
    direction: "negative",
    customer: () => "Your income changes a lot from month to month, so a fixed monthly payment would be hard to keep up in quiet months.",
    lender: (e) => `Income CV ${n(e, "incomeCv")} exceeds policy maximum ${n(e, "max")}.`,
    counterfactual: () => "A lender that can match repayment to your busy season may be able to help; a fixed monthly payment doesn't fit this income pattern.",
  },
  SHORT_ACCOUNT_HISTORY: {
    direction: "negative",
    customer: (e) => `We can see ${plural(n(e, "months"), "month")} of your banking, and we need at least ${n(e, "min")}.`,
    lender: (e) => `${n(e, "months")} months of transactions (minimum ${n(e, "min")}).`,
    counterfactual: (e) => `Approval is more likely once there are ${n(e, "min")} months of account history.`,
  },
  SHORT_CREDIT_HISTORY: {
    direction: "negative",
    customer: (e) => `You have ${plural(n(e, "months"), "month")} of Canadian credit history, and this product needs ${n(e, "min")}.`,
    lender: (e) => `Bureau history ${n(e, "months")} months (minimum ${n(e, "min")}); no foreign report.`,
    counterfactual: (e) => `Approval is more likely once you have ${n(e, "min")} months of Canadian credit history, or with an imported foreign credit report if one is available for your country.`,
  },
  HIGH_CARD_UTILIZATION: {
    direction: "negative",
    customer: (e) => `Your credit cards are at ${pct(n(e, "utilization"))} of their limits.`,
    lender: (e) => `Revolving utilization ${pct(n(e, "utilization"))} (maximum ${pct(n(e, "max"))}).`,
    counterfactual: (e) => `Approval is more likely with card balances below ${pct(n(e, "max"))} of their limits.`,
  },
  RISING_CARD_BALANCES: {
    direction: "negative",
    customer: (e) => `Your card balances went up by ${money(n(e, "changeCents"))} over the year.`,
    lender: (e) => `Revolving balances +${money(n(e, "changeCents"))} over the window; utilization ${pct(n(e, "utilization"))}.`,
    counterfactual: () => "Paying your card balances down below half of their limits would also help.",
  },
  NEGATIVE_TYPICAL_MONTH: {
    direction: "negative",
    customer: () => "In a typical month, more money goes out of your account than comes in.",
    lender: (e) => `Median monthly net cash flow ${money(n(e, "medianNetCents"))}.`,
    counterfactual: () => "Approval is more likely once most months end with more coming in than going out.",
  },
  INCOME_NEEDS_DOCUMENTS: {
    direction: "negative",
    customer: () => "We need to confirm your self-employed income with your tax returns before we can decide.",
    lender: (e) => `Income type ${s(e, "incomeType")}: policy requires two years of Notices of Assessment.`,
    counterfactual: () => "A decision can be made once two years of tax returns (Notices of Assessment) are provided.",
  },
  LIMIT_REDUCED: {
    direction: "negative",
    customer: (e) => `We can offer ${money(n(e, "limitCents"))} rather than the ${money(n(e, "requestedCents"))} you asked for, so the payments stay comfortable.`,
    lender: (e) => `Limit reduced to ${money(n(e, "limitCents"))} from ${money(n(e, "requestedCents"))}: ${s(e, "basis")}.`,
    counterfactual: () => "A higher amount is likely after another few months of cash flow at or above today's level.",
  },
  PRODUCT_MAX: {
    direction: "negative",
    customer: (e) => `${money(n(e, "maxCents"))} is the most we lend for this product.`,
    lender: (e) => `Request ${money(n(e, "requestedCents"))} exceeds product maximum ${money(n(e, "maxCents"))}.`,
  },
  NON_MEMBER_CAP: {
    direction: "negative",
    customer: (e) => `For new customers we start unsecured credit at up to ${money(n(e, "capCents"))}.`,
    lender: (e) => `Non-member revolving cap ${money(n(e, "capCents"))}.`,
    counterfactual: () => "Banking with us for a while (deposits and everyday spending) could support a higher limit at review.",
  },
  NO_SEASONAL_STRUCTURE: {
    direction: "neutral",
    customer: () => "We don't offer a line repaid around your busy season, so we've sized a standard line on a typical month instead.",
    lender: (e) => `Seasonal product not offered; standard revolving line sized on median month ${money(n(e, "medianNetCents"))}.`,
  },
  THIN_FILE_LIMIT: {
    direction: "negative",
    customer: (e) => `With ${plural(n(e, "months"), "month")} of credit history, we start you at ${money(n(e, "capCents"))}.`,
    lender: (e) => `Thin file (${n(e, "months")} months bureau, no foreign report): cap ${money(n(e, "capCents"))}.`,
    counterfactual: () => "Six on-time payments, or an imported foreign credit report, could support a higher limit.",
  },
  PEAK_SURPLUS_LIMITS_LINE: {
    direction: "negative",
    customer: (e) => `Your busy-season sales can comfortably repay ${money(n(e, "limitCents"))}, so that's the size of the line.`,
    lender: (e) => `Line sized to peak surplus ${money(n(e, "peakSurplusCents"))} / ${times(n(e, "minCoverage"))} coverage.`,
  },
  RECENT_NSF_CAUTION: {
    direction: "negative",
    customer: (e) => `${plural(n(e, "count"), "payment")} bounced recently, so we're starting with a smaller limit and a few conditions.`,
    lender: (e) => `${n(e, "count")} NSF in 90 days (within maximum): limit capped at ${n(e, "monthsOfNet")} months of average net cash flow.`,
    counterfactual: () => "A limit review is likely after 90 days with no bounced payments.",
  },
} satisfies Record<string, ReasonDef>

export type ReasonKey = keyof typeof REASONS

export interface ReasonHit {
  code: ReasonKey
  /** 0–1; higher shows first within its group. */
  weight: number
  evidence: Evidence
}
