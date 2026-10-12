import { addBusinessDays } from "@/lib/rules/nsf"
import type { Decision } from "@/lib/schemas"

/*
 * Pre-funding gate. Nothing is sent to a borrower until every check that
 * applies has cleared: the delegated-authority sign-off (Northgate), identity
 * checks that needed a person, the documents on Aspen's checklist, and any
 * condition the decision set before funding. Each check records when it
 * cleared; the loan is ready at the latest of them. A pending or failed check
 * means the loan doesn't fund.
 */

/** Decisions are made at the end of September; applications reach operations on October 1. */
export const DECIDED_AT = "2026-10-01T09:00"

export type GateKind = "signoff" | "verification" | "documents" | "condition"

export interface GateCheck {
  kind: GateKind
  label: string
  /** When it cleared ("YYYY-MM-DDTHH:MM"); null while pending or if it failed. */
  clearedAt: string | null
  /** Simulated in Berry rather than worked by the team (e.g. documents arriving). */
  simulated?: boolean
}

export interface FundingGate {
  checks: GateCheck[]
  readyAt: string | null
}

export interface GateInput {
  decision: Decision
  /** Date of the applicant's most recent returned payment, if any. */
  lastNsfDate: string | null
  /** Sign-off completion for approvals that need one; null while pending. */
  signOffAt?: string | null
  /** When identity checks that needed review were cleared; null while pending; "failed" if one failed. Absent: none needed. */
  verification?: string | null | "failed"
  /** The earliest the lender sends funds (its funding run). */
  earliest: string
  /** Illustrative: business days after the decision for the borrower's documents to arrive. */
  documentsBusinessDays: number
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export function fundingGate(i: GateInput): FundingGate {
  const d = i.decision
  const checks: GateCheck[] = []
  if (d.mode === "credit_union" && d.approver) {
    checks.push({ kind: "signoff", label: `${d.approver.title} sign-off (maker-checker)`, clearedAt: i.signOffAt ?? null })
  }
  if (i.verification !== undefined) {
    checks.push({
      kind: "verification",
      label: i.verification === "failed" ? "Identity checks failed: can't fund" : "Identity checks that needed a person cleared",
      clearedAt: i.verification === "failed" ? null : i.verification,
    })
  }
  if (d.documents?.length) {
    checks.push({
      kind: "documents",
      label: `All ${d.documents.length} documents received, PAD agreement signed`,
      clearedAt: `${addBusinessDays(DECIDED_AT.slice(0, 10), i.documentsBusinessDays)}T09:00`,
      simulated: true,
    })
  }
  for (const c of d.fundingConditions ?? []) {
    checks.push({
      kind: "condition",
      label: `No returned payments in the ${c.days} days before the first draw`,
      clearedAt: i.lastNsfDate ? `${addDays(i.lastNsfDate, c.days)}T09:00` : i.earliest,
    })
  }
  const times = checks.map((c) => c.clearedAt)
  const readyAt = times.some((t) => t === null) ? null : [i.earliest, ...(times as string[])].sort().at(-1)!
  return { checks, readyAt }
}
