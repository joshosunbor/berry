import path from "node:path"
import { buildAftFile, type AftRecord } from "@/lib/engine/aft"
import { decideAll } from "@/lib/engine/decide"
import { computeFeatures, type Features } from "@/lib/engine/features"
import { findLargeCashEvents, reviewLargeCash, type LctrReview } from "@/lib/engine/fintrac"
import { buildPadPlan, type PadPlan } from "@/lib/engine/repayment"
import { loadApplicants } from "@/lib/evaluation/load"
import { MODES, MODE_META, type Mode } from "@/lib/modes"
import { summarize, verifyApplicant, type VerificationSummary } from "@/lib/onboarding/kyc"
import { Rng, hashSeed } from "@/lib/rng"
import { verifyAccount, type AccountVerificationOutcome } from "@/lib/servicing/funding"
import type { MetricSources } from "@/lib/ops/metrics"
import type { PolicyCase } from "@/lib/ops/policy"
import { member } from "@/lib/ops/config"
import type { AuditLog } from "@/lib/ops/audit"
import { buildItems, runTeam, type OpsItem } from "@/lib/ops/queues"
import type { AuditEvent } from "@/lib/schemas"
import { SERVICING } from "@/lib/servicing/config"
import { NO_OPS_DECISIONS, buildBooks, loanIdFor, type OpsDecisions } from "@/lib/servicing/portfolio"
import { stressSeason, type StressResult } from "@/lib/servicing/stress"
import type { BookResult } from "@/lib/servicing/simulate"
import { breaksByLoan, summarize as summarizeLoan, toLoanView, type LoanSummary, type LoanView } from "@/lib/servicing/views"
import { toEngineInput, type Applicant, type Decision, type EngineInput, type VerificationCheck } from "@/lib/schemas"

/*
 * Server-side data for pages. The synthetic cast is read once at module
 * scope and every decision, schedule and file is computed at build time,
 * so pages prerender as static HTML. Protected attributes never leave this
 * module: pages get the applicant without them, and nothing derived from
 * them (screening reasons are written without names).
 */

export type PublicApplicant = Omit<Applicant, "protected" | "transactions">

export interface AftView {
  records: AftRecord[]
  text: string
  totalCents: number
  fileName: string
  /** Shown above the file, e.g. that a line's draws each go in that day's file. */
  note?: string
}

/** No AFT payout for this approval, and why (e.g. a card limit isn't paid out). */
export interface AftNone {
  none: true
  reason: string
}

export interface ApplicantView {
  applicant: PublicApplicant
  features: Features
  decisions: Record<Mode, Decision>
  verification: { checks: VerificationCheck[]; summary: VerificationSummary }
  pad: Record<Mode, PadPlan | null>
  aft: Record<Mode, AftView | AftNone | null>
  largeCash: LctrReview[]
  /** Simulated name-and-account check for the borrower's account (no names leave the server). */
  accountVerification: AccountVerificationOutcome
}

/**
 * The name the receiving institution holds for each borrower's account.
 * Normally the borrower's own name; one planted close match (a missing part
 * of a surname) shows the confirm-before-sending path.
 */
function nameOnAccount(a: Applicant): string {
  if (a.business) return a.business.legalName
  if (a.slug === "grace") return "Grace Lavallee"
  return a.protected.fullName
}

/** Agreements are signed a few days after the data window ends (fixed, so builds are reproducible). */
export const AGREEMENT_SIGNED_ON = "2026-10-05"

/** Fictional AFT identities for each lender. No real institution numbers. */
const LENDER_AFT: Record<Mode, { originatorId: string; shortName: string; dataCentre: string; returnsInstitutionId: string; returnsAccount: string }> = {
  credit_union: { originatorId: "0000099901", shortName: "NORTHGATE CU", dataCentre: "00990", returnsInstitutionId: "099900010", returnsAccount: "1000200030" },
  fintech: { originatorId: "0000099902", shortName: "KITE", dataCentre: "00991", returnsInstitutionId: "099800010", returnsAccount: "2000300040" },
  bank: { originatorId: "0000099903", shortName: "ASPEN BANK", dataCentre: "00992", returnsInstitutionId: "099700010", returnsAccount: "3000400050" },
}

const approved = (d: Decision) => d.outcome === "approve" || d.outcome === "approve_with_conditions"

const CARD_PRODUCTS = new Set(["credit_card", "starter_credit"])

/**
 * The sample AFT disbursement file for an approval: what the loan actually
 * pays out. A term loan is one credit; a line drawn over time is one credit
 * per planned draw, on its date; a card limit isn't paid out by AFT at all.
 */
function aftFor(a: Applicant, d: Decision, mode: Mode, plan: PadPlan | null): AftView | AftNone {
  if (CARD_PRODUCTS.has(d.product)) return { none: true, reason: "A card limit is made available on the card, not paid into the borrower's account, so there is no AFT payout." }
  const draws = plan?.draws
  if (draws && !draws.length) return { none: true, reason: "Nothing is drawn under the plan: the borrower's own cash covers the season, so nothing is paid out by AFT." }
  const lender = LENDER_AFT[mode]
  const rng = new Rng(hashSeed(`acct:${a.slug}`))
  const institutionId = `0999${String(rng.int(1, 99_999)).padStart(5, "0")}`
  const account = String(rng.int(1_000_000, 9_999_999_999))
  // Business legal name, or a generic label: personal names stay off the page.
  const payeeName = a.business?.legalName ?? `Applicant ${a.slug.toUpperCase()}`
  const crossReference = `loan_${a.slug}`.slice(0, 19)
  const payouts = draws ? draws.map((x) => ({ amountCents: x.amountCents, on: x.date })) : [{ amountCents: d.limitCents, on: "2026-10-06" }]
  const file = buildAftFile({
    originatorId: lender.originatorId,
    fileCreationNumber: rng.int(1, 9999),
    createdOn: AGREEMENT_SIGNED_ON,
    destinationDataCentre: lender.dataCentre,
    originatingDataCentre: lender.dataCentre,
    shortName: lender.shortName,
    longName: MODE_META[mode].institution,
    returnsInstitutionId: lender.returnsInstitutionId,
    returnsAccount: lender.returnsAccount,
    credits: payouts.map((p) => ({ amountCents: p.amountCents, fundsAvailableOn: p.on, institutionId, account, payeeName, crossReference })),
  })
  return {
    ...file,
    fileName: `berry-aft-${a.slug}-${mode.replace("_", "-")}.txt`,
    note: draws ? `A line is paid out as it's drawn: each draw would go in that day's AFT file. The ${draws.length} planned draw${draws.length === 1 ? "" : "s"} are shown together here, each with its own date.` : undefined,
  }
}

const raw = loadApplicants(path.join(process.cwd(), "data/applicants"))

const cast: ApplicantView[] = raw.map((a) => {
  const input = toEngineInput(a)
  const features = computeFeatures(input)
  const decisions = decideAll(input)
  const checks = verifyApplicant(a)
  const reportingEntity = a.accounts.some((x) => x.provider === "northgate") ? "Northgate Credit Union (fictional)" : "The applicant's own bank (fictional)"
  const pad = Object.fromEntries(
    MODES.map((m) => [m, approved(decisions[m]) ? buildPadPlan({ decision: decisions[m], features, kind: a.kind, agreementSignedOn: AGREEMENT_SIGNED_ON }) : null]),
  ) as Record<Mode, PadPlan | null>
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { protected: _p, transactions: _t, ...applicant } = a
  return {
    applicant,
    features,
    decisions,
    verification: { checks, summary: summarize(checks) },
    pad,
    aft: Object.fromEntries(MODES.map((m) => [m, approved(decisions[m]) ? aftFor(a, decisions[m], m, pad[m]) : null])) as Record<Mode, AftView | AftNone | null>,
    largeCash: findLargeCashEvents(a.transactions).map((e) =>
      reviewLargeCash(e, { reportingEntity, customerName: a.business?.legalName ?? "The applicant" }),
    ),
    accountVerification: verifyAccount(nameOnAccount(a), a.business?.legalName ?? a.protected.fullName),
  }
})

/** Display order: the generator's cast order (required ten first). */
const ORDER = [
  "priya",
  "hollis-family-farm",
  "amara",
  "daniel",
  "sofia",
  "northline-auto-repair",
  "bright-smile-dental",
  "corner-grind-cafe",
  "lakeside-lodge",
  "main-street-hardware",
  "ellen",
  "grace",
  "quillfeather-plumbing",
  "petalwick-florals",
]
cast.sort((a, b) => ORDER.indexOf(a.applicant.slug) - ORDER.indexOf(b.applicant.slug))

export function getCast(): ApplicantView[] {
  return cast
}

export function getApplicant(slug: string): ApplicantView | undefined {
  return cast.find((c) => c.applicant.slug === slug)
}

/**
 * What /apply needs to run the engine in the browser: the engine input
 * (no protected attributes, name, story or location) plus the precomputed
 * simulated checks.
 */
export interface ApplyPayload {
  input: EngineInput
  verification: { checks: VerificationCheck[]; summary: VerificationSummary }
}

export function getApplyPayload(slug: string): ApplyPayload | undefined {
  const a = raw.find((x) => x.slug === slug)
  const view = getApplicant(slug)
  if (!a || !view) return undefined
  return { input: toEngineInput(a), verification: view.verification }
}

/**
 * The three lenders' loan books, simulated to the servicing horizon at build
 * time. Servicing and operations feed each other: a hardship deferral only
 * takes effect once the team's maker-checker approval completes. So the books
 * are simulated once to find the requests, the team works them, and the books
 * are simulated again with the team's decisions. Items are worked in time
 * order, so the second pass can't move an earlier decision (tested).
 */
const bookInputs = cast.map((c) => {
  const a = raw.find((x) => x.slug === c.applicant.slug)!
  const results = c.verification.checks.map((x) => x.result)
  const identity = results.includes("fail") ? ("failed" as const) : results.includes("needs_review") ? ("needs_review" as const) : ("passed" as const)
  return { slug: a.slug, name: a.displayName, kind: a.kind, accounts: a.accounts, features: c.features, decisions: c.decisions, pad: c.pad, accountVerification: c.accountVerification, identity }
})

const viewsOf = (bs: Record<Mode, BookResult>): LoanView[] =>
  (Object.values(bs) as BookResult[]).flatMap((book) => {
    const breaks = breaksByLoan(book)
    return book.loans.map((l) => toLoanView(book, l, breaks.get(l.setup.id) ?? []))
  })

/** Queue items built only from open items: onboarding, decisions and servicing. */
const opsItemsFor = (views: LoanView[]) =>
  buildItems({
    verification: cast.map((c) => ({ slug: c.applicant.slug, name: c.applicant.displayName, checks: c.verification.checks })),
    largeCash: cast.flatMap((c) => c.largeCash.map((review) => ({ slug: c.applicant.slug, name: c.applicant.displayName, review }))),
    decisions: cast.flatMap((c) => MODES.map((mode) => ({ slug: c.applicant.slug, name: c.applicant.displayName, mode, decision: c.decisions[mode], features: c.features }))),
    loans: views,
    payee: cast.flatMap((c) =>
      MODES.flatMap((mode) => {
        const loan = views.find((l) => l.id === loanIdFor(c.applicant.slug, mode))
        if (!loan || c.accountVerification.result !== "close_match" || loan.funding.rail === "aft") return []
        return [{ slug: c.applicant.slug, name: c.applicant.displayName, mode, loanId: loan.id, amountCents: loan.principalCents, verification: c.accountVerification, at: loan.gateReadyAt }]
      }),
    ),
  })

/** What the team decided: hardship approvals by loan, sign-offs by decision, identity reviews by applicant. */
export function opsDecisionsFrom(items: OpsItem[]): OpsDecisions {
  const hardship: OpsDecisions["hardship"] = {}
  const signOff: OpsDecisions["signOff"] = {}
  const verification: OpsDecisions["verification"] = {}
  for (const c of cast) {
    const ids = new Set(c.verification.checks.filter((x) => x.result === "needs_review").map((x) => x.id))
    const done = items.filter((it) => it.queue === "verification" && ids.has(it.subject.id))
    if (ids.size && done.length === ids.size && done.every((it) => it.completedAt)) verification[c.applicant.slug] = done.map((it) => it.completedAt!).sort().at(-1)!
  }
  for (const it of items) {
    if (it.queue === "credit_referral" && it.id.startsWith("q_signoff-") && it.completedAt) signOff[it.subject.id] = it.completedAt
    if (it.queue === "hardship" && it.completedAt && it.approverId) {
      const m = member(it.approverId)!
      hardship[it.subject.id] = { on: it.completedAt.slice(0, 10), approved: true, by: `${m.name}, ${m.role.replace("_", " ")}` }
    }
  }
  return { hardship, signOff, verification }
}

/** Simulate, let the team work the queues, feed its decisions back; repeat until nothing moves. */
function settle(): { books: Record<Mode, BookResult>; decisions: OpsDecisions; rounds: number } {
  let decisions = NO_OPS_DECISIONS
  for (let rounds = 1; rounds <= 6; rounds++) {
    const books = buildBooks(bookInputs, undefined, undefined, decisions)
    const next = opsDecisionsFrom(runTeam(opsItemsFor(viewsOf(books))).items)
    if (JSON.stringify(next) === JSON.stringify(decisions)) return { books, decisions, rounds }
    decisions = next
  }
  throw new Error("servicing and operations did not settle")
}

const settled = settle()
const books: Record<Mode, BookResult> = settled.books

/** The team's decisions servicing was simulated with, and those the final queues produce: they must match. */
export function getOpsDecisions(): { used: OpsDecisions; final: OpsDecisions; rounds: number } {
  return { used: settled.decisions, final: opsDecisionsFrom(opsRun.items), rounds: settled.rounds }
}

export function getBooks(): Record<Mode, BookResult> {
  return books
}

const loanViews: LoanView[] = viewsOf(books)

export function getLoanViews(): LoanView[] {
  return loanViews
}

export function getLoanView(id: string): LoanView | undefined {
  return loanViews.find((l) => l.id === id)
}

const cureMap = new Map((Object.values(books) as BookResult[]).flatMap((b) => b.loans.map((l) => [l.setup.id, l.cures] as const)))
const loanSummaries: LoanSummary[] = loanViews.map((v) => summarizeLoan(v, cureMap.get(v.id) ?? []))

export function getLoanSummaries(): LoanSummary[] {
  return loanSummaries
}

/**
 * The foreign credit report toggle (/methodology): a planted newcomer whose
 * credit history comes from a country covered by a foreign credit report
 * program, decided with and without the imported report.
 */
export const FOREIGN_REPORT_CASE = "planted-p21"

const foreignCase = loadApplicants(path.join(process.cwd(), "data/planted")).find((a) => a.slug === FOREIGN_REPORT_CASE)!
const foreignInput = toEngineInput(foreignCase)
const foreignDemo = {
  story: foreignCase.story,
  request: foreignCase.request,
  creditHistoryMonths: foreignCase.creditFile.historyMonths,
  withReport: decideAll({ ...foreignInput, creditFile: { ...foreignInput.creditFile, foreignReport: { available: true, band: "good" } } }),
  withoutReport: decideAll({ ...foreignInput, creditFile: { ...foreignInput.creditFile, foreignReport: { available: false } } }),
}

export function getForeignReportDemo() {
  return foreignDemo
}

/**
 * Operations: queue items built only from the open items above, worked by
 * the simulated team in business hours. The audit trail is the hash-chained
 * log of every step.
 */
/** Each loan's pre-funding gate clearing is on the audit trail, before the funding it allows. */
const gateEvents = loanViews.map((l) => ({
  at: l.gateReadyAt,
  run: (log: AuditLog) =>
    log.append({
      at: l.gateReadyAt,
      actor: { kind: "system", id: "funding-gate" },
      action: "loan.funding_gate_cleared",
      subject: { kind: "loan", id: l.id },
      after: { checks: l.gate.map((c) => ({ check: c.label, clearedAt: c.clearedAt })) },
      reason: l.gate.length ? "Every pre-funding check cleared." : "No pre-funding checks apply.",
    }),
}))

const opsRun = runTeam(opsItemsFor(loanViews), gateEvents)

export function getOpsItems(): OpsItem[] {
  return opsRun.items
}

export function getAuditEvents(): readonly AuditEvent[] {
  return opsRun.log.all
}

/** The queue item each audit event belongs to, by sequence number (null for none). */
export function getOpsEventItems(): readonly (string | null)[] {
  return opsRun.eventItems
}

/**
 * Cases for the policy impact preview: the cast and the planted cases, with
 * features precomputed and transactions left out (decisions read only the
 * request, kind and features; a test checks the results are identical).
 */
const policyCases: PolicyCase[] = [
  ...raw.map((a) => ({ a, group: "cast" as const })),
  ...loadApplicants(path.join(process.cwd(), "data/planted")).map((a) => ({ a, group: "planted" as const })),
].map(({ a, group }) => {
  const input = toEngineInput(a)
  return { slug: a.slug, name: a.displayName, group, input: { ...input, transactions: [] }, features: computeFeatures(input) }
})

export function getPolicyCases(): PolicyCase[] {
  return policyCases
}

/** Everything the operations dashboard computes its KPIs from. */
export function getMetricSources(): MetricSources {
  return {
    items: opsRun.items,
    loans: loanViews,
    books,
    cast: cast.map((c) => ({ slug: c.applicant.slug, decisions: c.decisions, checks: c.verification.checks })),
  }
}

/** Poor-harvest stress results for a seasonal operating line, for each configured percentage (illustrative). */
export function getStress(loanId: string): Record<number, StressResult> | null {
  const loan = getLoanView(loanId)
  if (!loan?.draws) return null
  const a = getApplicant(loan.applicantSlug)!
  const plan = a.pad[loan.mode]!
  return Object.fromEntries(
    SERVICING.stress.optionsPct.map((dropPct) => [
      dropPct,
      stressSeason({ decision: a.decisions[loan.mode], features: a.features, kind: a.applicant.kind, agreementSignedOn: AGREEMENT_SIGNED_ON, plan, dropPct }),
    ]),
  )
}
