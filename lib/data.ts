import path from "node:path"
import { decideAll } from "@/lib/engine/decide"
import { computeFeatures, type Features } from "@/lib/engine/features"
import { loadApplicants } from "@/lib/evaluation/load"
import type { Mode } from "@/lib/modes"
import { toEngineInput, type Applicant, type Decision } from "@/lib/schemas"

/*
 * Server-side data for pages. The synthetic cast is read once at module
 * scope and every decision is computed at build time, so pages prerender as
 * static HTML. Protected attributes never leave this module: pages get the
 * applicant without them.
 */

export type PublicApplicant = Omit<Applicant, "protected" | "transactions">

export interface ApplicantView {
  applicant: PublicApplicant
  features: Features
  decisions: Record<Mode, Decision>
}

const cast: ApplicantView[] = loadApplicants(path.join(process.cwd(), "data/applicants")).map((a) => {
  const input = toEngineInput(a)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { protected: _p, transactions: _t, ...applicant } = a
  return { applicant, features: computeFeatures(input), decisions: decideAll(input) }
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
