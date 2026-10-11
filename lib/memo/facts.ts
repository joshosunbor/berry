import type { Features } from "@/lib/engine/features"
import { monthRange } from "@/lib/engine/format"
import { INCOME_LABELS, PRODUCT_LABELS, STRUCTURE_LABELS } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODE_META } from "@/lib/modes"
import type { Decision, Outcome, ProductType } from "@/lib/schemas"

/*
 * The structured facts behind a credit memo (CLAUDE.md §6). This is the only
 * thing that may be sent to a model: engine output and a few cash-flow
 * features, already formatted. It never holds raw transactions, protected
 * attributes (name, date of birth, gender, nationality, immigration status,
 * postal code), the applicant's display name, story or location, or the
 * names of anyone they pay. Every number a memo may state is in here.
 */

export interface MemoRequest {
  kind: "personal" | "business"
  product: ProductType
  amountCents: number
  termMonths?: number | null
}

export interface MemoFacts {
  lender: string
  lenderType: string
  applicant: {
    type: "personal" | "business"
    productRequested: string
    amountRequested: string
    termRequestedMonths: number | null
  }
  decision: {
    outcome: Outcome
    outcomeLabel: string
    /** The exact sentence the memo's Recommendation section must open with. */
    recommendationLine: string
    product: string
    limit: string | null
    apr: string | null
    termMonths: number | null
    structure: string | null
    payment: string | null
    signOffAuthority: string | null
  }
  cashFlow: {
    monthsOfHistory: number
    incomeType: string
    averageMonthlyIncome: string
    typicalMonthlyCashLeftOver: string
    incomeVariation: string
    busiestMonths: string | null
    shareOfIncomeInBusiestMonths: string | null
    returnedPaymentsLast90Days: number
    returnedPaymentsLast12Months: number
    existingDebtPaymentsPerMonth: string
    daysOfCashOnHand: number
  }
  strengths: string[]
  risks: string[]
  conditions: string[]
  whatWouldChange: string[]
  complianceFlags: string[]
}

export const OUTCOME_LABELS: Record<Outcome, string> = {
  approve: "Approve",
  approve_with_conditions: "Approve with conditions",
  refer: "Refer",
  decline: "Decline",
}

const money = (c: number) => formatCents(c, { whole: c % 100 === 0 })
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`

export function buildMemoFacts(decision: Decision, features: Features, request: MemoRequest): MemoFacts {
  const meta = MODE_META[decision.mode]
  const approved = decision.outcome === "approve" || decision.outcome === "approve_with_conditions"
  const peak = features.income.peakMonths.length > 0 && (features.income.type === "seasonal" || features.income.peakShare >= 0.5)
  const outcomeLabel = OUTCOME_LABELS[decision.outcome]
  const line =
    approved
      ? `Engine outcome: ${outcomeLabel}, ${money(decision.limitCents)} ${PRODUCT_LABELS[decision.product].toLowerCase()}.`
      : `Engine outcome: ${outcomeLabel}.`
  return {
    lender: meta.institution,
    lenderType: meta.sector.toLowerCase(),
    applicant: {
      type: request.kind,
      productRequested: PRODUCT_LABELS[request.product],
      amountRequested: money(request.amountCents),
      termRequestedMonths: request.termMonths ?? null,
    },
    decision: {
      outcome: decision.outcome,
      outcomeLabel,
      recommendationLine: line,
      product: PRODUCT_LABELS[decision.product],
      limit: approved ? money(decision.limitCents) : null,
      apr: approved && decision.aprBps !== null ? pct(decision.aprBps) : null,
      termMonths: approved ? decision.termMonths : null,
      structure: approved && decision.structure ? STRUCTURE_LABELS[decision.structure] : null,
      payment: approved && decision.paymentCents !== null ? money(decision.paymentCents) : null,
      signOffAuthority: decision.approver?.title ?? null,
    },
    cashFlow: {
      monthsOfHistory: features.windowMonths,
      incomeType: INCOME_LABELS[features.income.type],
      averageMonthlyIncome: money(features.avgMonthlyIncomeCents),
      typicalMonthlyCashLeftOver: money(features.medianMonthlyNetCents),
      incomeVariation: features.incomeCv.toFixed(2),
      busiestMonths: peak ? monthRange(features.income.peakMonths) : null,
      shareOfIncomeInBusiestMonths: peak ? `${Math.round(features.income.peakShare * 100)}%` : null,
      returnedPaymentsLast90Days: features.nsf90,
      returnedPaymentsLast12Months: features.nsf12m,
      existingDebtPaymentsPerMonth: money(features.existingDebtMonthlyCents),
      daysOfCashOnHand: features.daysCashOnHand,
    },
    strengths: decision.reasons.filter((r) => r.direction === "positive").map((r) => r.lenderText),
    risks: decision.reasons.filter((r) => r.direction === "negative").map((r) => r.lenderText),
    conditions: approved ? (decision.conditions ?? []) : [],
    whatWouldChange: decision.counterfactuals,
    complianceFlags: decision.flags.map((f) => f.summary),
  }
}

// ---------------------------------------------------------------------------
// Numbers

/**
 * A number as it appears in text: a dollar amount, a percentage, a ratio
 * ("1.25x") or a plain number (counts, months, years). `value` is the
 * canonical value with separators and trailing zeros removed, so $1,234,
 * $1,234.00 and 1234 all read as 1234.
 */
export interface NumberToken {
  raw: string
  unit: "$" | "%" | "x" | ""
  value: string
  index: number
}

const NUMBER = /([-−]?\$\s?)?(\d[\d,]*(?:\.\d+)?|\.\d+)(\s?%|\s?percent\b|x\b|×|\s?times\b)?/gi

export function canonical(n: string): string {
  const v = Number(n.replace(/,/g, ""))
  return Number.isFinite(v) ? String(v) : n
}

export function numberTokens(text: string): NumberToken[] {
  const out: NumberToken[] = []
  for (const m of text.matchAll(NUMBER)) {
    const before = text[m.index - 1]
    // Part of a word or identifier (e.g. "H1", "005-style" is fine, "v2" is not a figure).
    if (before && /[A-Za-z_]/.test(before) && !m[1]) continue
    const suffix = (m[3] ?? "").trim().toLowerCase()
    const unit: NumberToken["unit"] = m[1] ? "$" : suffix === "%" || suffix === "percent" ? "%" : suffix ? "x" : ""
    const negative = m[1] ? /^[-−]/.test(m[1]) : false
    out.push({ raw: m[0], unit, value: canonical(negative ? `-${m[2]}` : m[2]), index: m.index })
  }
  return out
}

function strings(v: unknown, acc: string[] = []): string[] {
  if (typeof v === "string") acc.push(v)
  else if (typeof v === "number") acc.push(String(v))
  else if (Array.isArray(v)) v.forEach((x) => strings(x, acc))
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, acc))
  return acc
}

/**
 * Every number that legitimately appears in the facts, keyed as
 * "<unit>:<canonical value>" (e.g. "$:60000", "%:7.95", "x:1.15", ":12").
 * Raw numeric fields are included as plain numbers.
 */
export function allowedNumbers(facts: MemoFacts): Set<string> {
  // The reporting windows named in the facts' field names (last 90 days, last 12 months).
  const set = new Set<string>([":90", ":12"])
  for (const s of strings(facts)) for (const t of numberTokens(s)) set.add(`${t.unit}:${t.value}`)
  return set
}
