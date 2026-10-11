import path from "node:path"
import { CONFIGS } from "@/lib/engine/config"
import { decideAll } from "@/lib/engine/decide"
import { computeFeatures } from "@/lib/engine/features"
import { formatCents } from "@/lib/money"
import { MODE_META, type Mode } from "@/lib/modes"
import { toEngineInput, type Decision } from "@/lib/schemas"
import { loadApplicants } from "./load"

/*
 * Two planted cases where the right answer is debatable (published on
 * /accuracy). Every number below is read from the engine's decision and
 * features at build time, so the write-up can't drift from what the engine
 * does. Nothing here changes an outcome.
 */

export interface EdgeCase {
  id: string
  description: string
  lender: Mode
  engineAnswer: string
  otherLenders: string
  argumentAgainst: string
  wouldChange: string
}

const x = (v: number) => `${v.toFixed(2)}x`
const coverage = (avgNetCents: number, d: Decision) => avgNetCents / d.paymentCents!

function load(id: string) {
  const a = loadApplicants(path.join(process.cwd(), "data/planted")).find((p) => p.slug === `planted-${id}`)!
  const input = toEngineInput(a)
  return { a, f: computeFeatures(input), d: decideAll(input) }
}

export function edgeCases(): EdgeCase[] {
  const b07 = load("b07")
  const p19 = load("p19")
  const cu = CONFIGS.credit_union.thresholds

  const ng = b07.d.credit_union
  const b07Months = b07.f.windowMonths

  const p = p19.d.credit_union
  const cov = coverage(p19.f.avgMonthlyNetCents, p)
  const medianCov = p19.f.medianMonthlyNetCents / p.paymentCents!
  // The loan size that would meet the standard minimum at the same rate and term (payment scales with the amount).
  const standardAmount = Math.floor((p.limitCents * (p19.f.avgMonthlyNetCents / cu.minDscr / p.paymentCents!)) / 10_000) * 10_000

  return [
    {
      id: "b07",
      description: "A small business paid by client invoices, with steady months",
      lender: "bank",
      engineAnswer: `${MODE_META.bank.institution} refers it: when income comes from invoices, its policy asks for two years of Notices of Assessment before deciding.`,
      otherLenders: `${MODE_META.credit_union.institution} approves ${formatCents(ng.limitCents, { whole: true })}; ${MODE_META.fintech.institution} approves ${formatCents(b07.d.fintech.limitCents, { whole: true })}.`,
      argumentAgainst: `The bank data already answers the question the tax returns are meant to answer. Over ${b07Months} months, income varied by ${Math.round(b07.f.incomeCv * 100)}% from month to month, there were no returned payments, and the business keeps about ${b07.f.daysCashOnHand} days of spending in the bank. At ${MODE_META.credit_union.institution}'s proposed payment, cash flow covers it ${x(coverage(b07.f.avgMonthlyNetCents, ng))} over. Asking for two years of returns adds days and work for a file the bank data already shows is strong.`,
      wouldChange: `Either the two years of Notices of Assessment the policy asks for, or a policy change that accepts at least 12 months of verified account income for invoice earners whose income varies less than a set amount. That's a change ${MODE_META.bank.institution} would make in the Policy tab, with its impact on other cases shown first.`,
    },
    {
      id: "p19",
      description: `A long-standing member asking for a personal loan, with coverage just under the standard minimum`,
      lender: "credit_union",
      engineAnswer: `${MODE_META.credit_union.institution} approves ${formatCents(p.limitCents, { whole: true })} as a relationship exception: coverage is ${x(cov)}, under the standard ${x(cu.minDscr)} but above the ${x(cu.relationshipMinDscr)} allowed for a strong relationship (${Math.floor(p19.f.relationship!.tenureYears)} years, ${p19.f.relationship!.productsHeld} products). Because it's an exception, sign-off moves up one authority tier (${p.approver?.title ?? "the next tier"}).`,
      otherLenders: `${MODE_META.fintech.institution} approves ${formatCents(p19.d.fintech.limitCents, { whole: true })}; ${MODE_META.bank.institution} approves ${formatCents(p19.d.bank.limitCents, { whole: true })}.`,
      argumentAgainst: `The ${x(cov)} is an average, lifted by a few stronger months. In a typical month the cash left over (${formatCents(p19.f.medianMonthlyNetCents)}) covers the ${formatCents(p.paymentCents!)} payment only ${x(medianCov)}, which is why ${MODE_META.fintech.institution}, looking at the typical month, offers ${formatCents(p19.d.fintech.limitCents, { whole: true })}. A membership of ${Math.floor(p19.f.relationship!.tenureYears)} years shows commitment, not spare cash: a smaller loan would leave more room in an ordinary month.`,
      wouldChange: `For a standard approval with no exception: coverage of ${x(cu.minDscr)}, either from slightly stronger average cash flow or a smaller loan of about ${formatCents(standardAmount, { whole: true })}. For a smaller offer or a decline: returned payments, a weaker relationship, or a typical month that can't carry the payment once other debts are counted.`,
    },
  ]
}
