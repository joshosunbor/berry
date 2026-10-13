import { getApplicant, getCast, getLoanViews } from "@/lib/data"
import { MODES } from "@/lib/modes"
import { statusOn } from "@/lib/servicing/simulate"

/*
 * Every cast applicant's decisions and every loan's servicing outcome, keyed
 * by the applicant's seed key (its original slug), not its display name or
 * current slug. Renaming an applicant must leave this unchanged.
 */
export function castFingerprint() {
  const out: Record<string, unknown> = {}
  for (const c of getCast()) {
    const a = c.applicant
    const key = a.generated.seedKey ?? a.slug
    const view = getApplicant(a.slug)!
    out[key] = {
      decisions: Object.fromEntries(
        MODES.map((m) => {
          const d = c.decisions[m]
          return [m, { outcome: d.outcome, product: d.product, limitCents: d.limitCents, aprBps: d.aprBps, termMonths: d.termMonths, structure: d.structure, approver: d.approver?.id ?? null, reasons: d.reasons.map((r) => r.code), flags: d.flags.length }]
        }),
      ),
      verification: view.verification.checks.map((x) => [x.kind, x.result]),
      loans: Object.fromEntries(
        getLoanViews()
          .filter((l) => l.applicantSlug === a.slug)
          .map((l) => [
            l.mode,
            {
              fundedOn: l.funding.fundedOn,
              status: statusOn({ statusTimeline: l.statusTimeline } as Parameters<typeof statusOn>[0], "2027-12-31"),
              chargedOffOn: l.chargedOffOn,
              attempts: l.attempts.map((x) => [x.sentOn, x.amountCents, x.outcome, x.code ?? null]),
            },
          ]),
      ),
    }
  }
  return out
}
