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
import { buildItems, runTeam, type OpsItem } from "@/lib/ops/queues"
import type { AuditEvent } from "@/lib/schemas"
import { FUNDING_INITIATED_AT, buildBooks, loanIdFor } from "@/lib/servicing/portfolio"
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
}

export interface ApplicantView {
  applicant: PublicApplicant
  features: Features
  decisions: Record<Mode, Decision>
  verification: { checks: VerificationCheck[]; summary: VerificationSummary }
  pad: Record<Mode, PadPlan | null>
  aft: Record<Mode, AftView | null>
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

function aftFor(a: Applicant, d: Decision, mode: Mode): AftView {
  const lender = LENDER_AFT[mode]
  const rng = new Rng(hashSeed(`acct:${a.slug}`))
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
    credits: [
      {
        amountCents: d.limitCents,
        fundsAvailableOn: "2026-10-06",
        institutionId: `0999${String(rng.int(1, 99_999)).padStart(5, "0")}`,
        account: String(rng.int(1_000_000, 9_999_999_999)),
        // Business legal name, or a generic label: personal names stay off the page.
        payeeName: a.business?.legalName ?? `Applicant ${a.slug.toUpperCase()}`,
        crossReference: `loan_${a.slug}`.slice(0, 19),
      },
    ],
  })
  return { ...file, fileName: `berry-aft-${a.slug}-${mode.replace("_", "-")}.txt` }
}

const raw = loadApplicants(path.join(process.cwd(), "data/applicants"))

const cast: ApplicantView[] = raw.map((a) => {
  const input = toEngineInput(a)
  const features = computeFeatures(input)
  const decisions = decideAll(input)
  const checks = verifyApplicant(a)
  const reportingEntity = a.accounts.some((x) => x.provider === "northgate") ? "Northgate Credit Union (fictional)" : "The applicant's own bank (fictional)"
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { protected: _p, transactions: _t, ...applicant } = a
  return {
    applicant,
    features,
    decisions,
    verification: { checks, summary: summarize(checks) },
    pad: Object.fromEntries(
      MODES.map((m) => [m, approved(decisions[m]) ? buildPadPlan({ decision: decisions[m], features, kind: a.kind, agreementSignedOn: AGREEMENT_SIGNED_ON }) : null]),
    ) as Record<Mode, PadPlan | null>,
    aft: Object.fromEntries(MODES.map((m) => [m, approved(decisions[m]) ? aftFor(a, decisions[m], m) : null])) as Record<Mode, AftView | null>,
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

/** The three lenders' loan books, simulated to the servicing horizon at build time. */
const books: Record<Mode, BookResult> = buildBooks(
  cast.map((c) => {
    const a = raw.find((x) => x.slug === c.applicant.slug)!
    return { slug: a.slug, name: a.displayName, kind: a.kind, accounts: a.accounts, features: c.features, decisions: c.decisions, pad: c.pad, accountVerification: c.accountVerification }
  }),
)

export function getBooks(): Record<Mode, BookResult> {
  return books
}

const loanViews: LoanView[] = (Object.values(books) as BookResult[]).flatMap((book) => {
  const breaks = breaksByLoan(book)
  return book.loans.map((l) => toLoanView(book, l, breaks.get(l.setup.id) ?? []))
})

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
const opsRun = runTeam(
  buildItems({
    verification: cast.map((c) => ({ slug: c.applicant.slug, name: c.applicant.displayName, checks: c.verification.checks })),
    largeCash: cast.flatMap((c) => c.largeCash.map((review) => ({ slug: c.applicant.slug, name: c.applicant.displayName, review }))),
    decisions: cast.flatMap((c) => MODES.map((mode) => ({ slug: c.applicant.slug, name: c.applicant.displayName, mode, decision: c.decisions[mode], features: c.features }))),
    loans: loanViews,
    payee: cast.flatMap((c) =>
      MODES.flatMap((mode) => {
        const loan = loanViews.find((l) => l.id === loanIdFor(c.applicant.slug, mode))
        if (!loan || c.accountVerification.result !== "close_match" || loan.funding.rail === "aft") return []
        return [{ slug: c.applicant.slug, name: c.applicant.displayName, mode, loanId: loan.id, amountCents: loan.principalCents, verification: c.accountVerification, at: FUNDING_INITIATED_AT }]
      }),
    ),
  }),
)

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
