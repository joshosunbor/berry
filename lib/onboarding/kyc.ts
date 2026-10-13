import registryJson from "@/data/registry.json"
import watchlistJson from "@/data/watchlist.json"
import { Rng, hashSeed } from "@/lib/rng"
import type { Applicant, VerificationCheck, VerificationKind } from "@/lib/schemas"
import { nameSimilarity } from "./names"

/*
 * Simulated identity (KYC) and business (KYB) checks on synthetic data.
 * No real identity service, registry or watch list is used: the watch list
 * and registry are fictional files in /data. Results are deterministic per
 * applicant.
 *
 * These checks read the applicant's name and date of birth, which is what
 * identity verification is for. They live outside lib/engine and never
 * feed the credit decision (see tests/fairness.test.ts).
 */

export const SCREENING = {
  /** At or above: treated as a confirmed match when the date of birth also matches. */
  matchThreshold: 0.9,
  /** At or above: a possible match a person must review. */
  reviewThreshold: 0.6,
  /** Months after the last annual filing before a registration is treated as overdue. */
  annualFilingOverdueMonths: 14,
} as const

const WATCHLIST = watchlistJson.entries
const REGISTRY = registryJson.records

interface Draft {
  kind: VerificationKind
  result: VerificationCheck["result"]
  reasons: string[]
}

function screen(name: string, dob: string | null, list: "sanctions" | "pep"): Draft {
  const kind: VerificationKind = list === "sanctions" ? "sanctions_screening" : "pep_screening"
  const label = list === "sanctions" ? "sanctions list" : "politically exposed persons list"
  let best: { entry: (typeof WATCHLIST)[number]; score: number } | null = null
  for (const entry of WATCHLIST.filter((e) => e.list === list)) {
    const score = nameSimilarity(name, entry.name)
    if (!best || score > best.score) best = { entry, score }
  }
  if (!best || best.score < SCREENING.reviewThreshold) {
    return { kind, result: "pass", reasons: [`No match on the fictional ${label}.`] }
  }
  const dobMatches = dob !== null && "dateOfBirth" in best.entry && best.entry.dateOfBirth === dob
  if (best.score >= SCREENING.matchThreshold && dobMatches) {
    return { kind, result: "fail", reasons: [`Confirmed match on the fictional ${label} (${best.entry.id}): name and date of birth agree.`] }
  }
  return {
    kind,
    result: "needs_review",
    reasons: [
      `Possible match on the fictional ${label}: the ${list === "sanctions" && !dob ? "business" : "applicant"}'s name is similar to entry ${best.entry.id} (similarity ${best.score}).`,
      dobMatches ? "Date of birth also matches." : "Date of birth does not match the entry; an analyst should confirm and clear.",
    ],
  }
}

function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`)
  const b = new Date(`${to}T00:00:00Z`)
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
}

export interface IdentityDocument {
  type: "drivers_licence" | "passport" | "pr_card" | "provincial_id"
  expiresOn: string
  nameOnDocument: string
  dateOfBirthOnDocument: string
}

/** A synthetic identity document consistent with the applicant's protected record. */
export function syntheticDocument(a: Applicant): IdentityDocument {
  const rng = new Rng(hashSeed(`doc:${a.generated.seedKey ?? a.slug}`))
  const type = a.protected.immigrationStatus === "permanent_resident" ? "pr_card" : rng.pick(["drivers_licence", "passport", "provincial_id"] as const)
  return { type, expiresOn: `${rng.int(2027, 2031)}-${String(rng.int(1, 12)).padStart(2, "0")}-15`, nameOnDocument: a.protected.fullName, dateOfBirthOnDocument: a.protected.dateOfBirth }
}

/** Runs every simulated check for an applicant. */
export function verifyApplicant(a: Applicant, asOf = a.generated.windowEnd): VerificationCheck[] {
  const drafts: Draft[] = []
  const doc = syntheticDocument(a)

  drafts.push(
    doc.expiresOn > asOf
      ? { kind: "id_document", result: "pass", reasons: [`Simulated ${doc.type.replaceAll("_", " ")} check: authentic and not expired.`] }
      : { kind: "id_document", result: "fail", reasons: ["The identity document has expired."] },
  )
  const nameOk = nameSimilarity(doc.nameOnDocument, a.protected.fullName) === 1
  const dobOk = doc.dateOfBirthOnDocument === a.protected.dateOfBirth
  drafts.push(
    nameOk && dobOk
      ? { kind: "name_dob_match", result: "pass", reasons: ["Name and date of birth match the document."] }
      : { kind: "name_dob_match", result: "needs_review", reasons: [!nameOk ? "Name differs from the document." : "Date of birth differs from the document."] },
  )
  drafts.push(screen(a.protected.fullName, a.protected.dateOfBirth, "sanctions"))
  drafts.push(screen(a.protected.fullName, a.protected.dateOfBirth, "pep"))

  if (a.business) {
    const entity = screen(a.business.legalName, null, "sanctions")
    if (entity.result !== "pass") drafts.push(entity)
    const record = REGISTRY.find((r) => r.registrationNo === a.business!.registrationNo)
    if (!record) {
      drafts.push({ kind: "business_registration", result: "fail", reasons: ["No record in the fictional business registry."] })
    } else {
      const months = monthsBetween(record.lastAnnualFiling, asOf)
      drafts.push(
        record.status !== "active"
          ? { kind: "business_registration", result: "fail", reasons: [`Registration status is ${record.status}.`] }
          : months > SCREENING.annualFilingOverdueMonths
            ? {
                kind: "business_registration",
                result: "needs_review",
                reasons: [`Registered and active, but the last annual filing was ${months} months ago (on ${record.lastAnnualFiling}). Ask for proof of filing.`],
              }
            : { kind: "business_registration", result: "pass", reasons: [`Active registration; last annual filing ${record.lastAnnualFiling}.`] },
      )
      if (a.business.structure !== "sole_proprietorship") {
        const major = record.owners.filter((o) => o.sharePct >= 25)
        drafts.push({
          kind: "beneficial_ownership",
          result: major.length ? "pass" : "needs_review",
          reasons: [major.length ? `${major.length} owner(s) with 25% or more identified.` : "No owner with 25% or more identified."],
        })
      }
    }
  }

  // Simulated timing: automated checks take seconds; a manual review takes hours.
  const rng = new Rng(hashSeed(`kyc-time:${a.generated.seedKey ?? a.slug}`))
  const start = Date.parse(`${asOf}T14:00:00Z`)
  return drafts.map((d, i) => {
    const automated = d.result === "pass"
    const durationMs = automated ? rng.int(600, 4_000) : rng.int(3, 7) * 3_600_000 + rng.int(0, 59) * 60_000
    return {
      id: `ver_${a.slug}-${i + 1}`,
      applicantId: a.id,
      kind: d.kind,
      result: d.result,
      reasons: d.reasons,
      automated,
      startedAt: new Date(start).toISOString(),
      completedAt: new Date(start + durationMs).toISOString(),
      durationMs,
      simulated: true,
    }
  })
}

export interface VerificationSummary {
  outcome: "pass" | "needs_review" | "fail"
  /** Checks run in parallel, so time to verify is the slowest check. */
  timeToVerifyMs: number
  automated: boolean
}

export function summarize(checks: VerificationCheck[]): VerificationSummary {
  const outcome = checks.some((c) => c.result === "fail") ? "fail" : checks.some((c) => c.result === "needs_review") ? "needs_review" : "pass"
  return { outcome, timeToVerifyMs: Math.max(...checks.map((c) => c.durationMs ?? 0)), automated: checks.every((c) => c.automated) }
}
