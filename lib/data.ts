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
import { toEngineInput, type Applicant, type Decision, type VerificationCheck } from "@/lib/schemas"

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

const cast: ApplicantView[] = loadApplicants(path.join(process.cwd(), "data/applicants")).map((a) => {
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
