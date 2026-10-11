import type { Features } from "@/lib/engine/features"
import type { Decision } from "@/lib/schemas"
import { buildMemoFacts, type MemoFacts, type MemoRequest } from "./facts"

/*
 * The template credit memo (CLAUDE.md §6). Deterministic: built only from
 * the structured facts (engine output and key features), so the same input
 * always gives the same memo, and every figure in it comes from the engine.
 * It always works, with or without an API key. The memo states the engine's
 * outcome; it never sets one.
 */

export interface MemoInput {
  decision: Decision
  features: Features
  request: MemoRequest
}

/** The section headings every memo uses, in order. Claude drafts must use them too. */
export const MEMO_SECTIONS = ["Applicant summary", "Cash flow", "Strengths", "Risks", "Structure", "Conditions", "Recommendation"] as const

const list = (items: string[], empty: string) => (items.length ? items.map((i) => `- ${i}`) : [`- ${empty}`])

export function renderTemplateMemo(f: MemoFacts): string {
  const a = f.applicant
  const d = f.decision
  const c = f.cashFlow
  const lines: string[] = []

  lines.push(`## Applicant summary`)
  lines.push(
    `A ${a.type} applicant asking ${f.lender} (${f.lenderType}) for a ${a.productRequested.toLowerCase()} of ${a.amountRequested}` +
      (a.termRequestedMonths ? ` over ${a.termRequestedMonths} months.` : "."),
  )

  lines.push("", `## Cash flow`)
  lines.push(`- ${c.monthsOfHistory} months of account history. Income type: ${c.incomeType}.`)
  lines.push(`- Average monthly income ${c.averageMonthlyIncome}; typical (median) monthly cash left over ${c.typicalMonthlyCashLeftOver}.`)
  lines.push(`- Income variation (coefficient of variation): ${c.incomeVariation}.`)
  if (c.busiestMonths && c.shareOfIncomeInBusiestMonths) {
    lines.push(`- Busiest months: ${c.busiestMonths} (${c.shareOfIncomeInBusiestMonths} of income).`)
  }
  lines.push(`- Returned payments: ${c.returnedPaymentsLast90Days} in the last 90 days, ${c.returnedPaymentsLast12Months} in the last 12 months.`)
  lines.push(`- Existing debt payments: ${c.existingDebtPaymentsPerMonth} per month.`)
  lines.push(`- Days of cash on hand: ${c.daysOfCashOnHand}.`)

  lines.push("", `## Strengths`, ...list(f.strengths, "None recorded by the engine."))
  lines.push("", `## Risks`, ...list(f.risks, "None recorded by the engine."))

  lines.push("", `## Structure`)
  if (d.limit) {
    lines.push(`- Product: ${d.product}, limit ${d.limit}.`)
    if (d.structure) lines.push(`- Structure: ${d.structure}.`)
    if (d.apr) lines.push(`- Rate: ${d.apr} APR (illustrative).`)
    if (d.termMonths) lines.push(`- Term: ${d.termMonths} months.`)
    if (d.payment) lines.push(`- Proposed payment: ${d.payment}.`)
  } else {
    lines.push(`- No credit offered at this stage.`)
  }
  if (d.signOffAuthority) lines.push(`- Sign-off authority: ${d.signOffAuthority} (illustrative tiers).`)

  lines.push("", `## Conditions`, ...list(f.conditions, "None."))

  if (f.complianceFlags.length) {
    lines.push("", `## Compliance flags`, ...f.complianceFlags.map((x) => `- ${x}`))
  }
  if (f.whatWouldChange.length) {
    lines.push("", `## What would change the decision`, ...f.whatWouldChange.map((x) => `- ${x}`))
  }

  lines.push("", `## Recommendation`)
  lines.push(d.recommendationLine)
  lines.push(`The engine set this outcome. This memo explains it and does not change it.`)

  return lines.join("\n")
}

/** Pure: same input, same memo. */
export function templateMemo(input: MemoInput): string {
  return renderTemplateMemo(buildMemoFacts(input.decision, input.features, input.request))
}
