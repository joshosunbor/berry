import type { Features } from "@/lib/engine/features"
import type { PadPlan } from "@/lib/engine/repayment"
import { CONFIGS } from "@/lib/engine/config"
import { MODES, MODE_META, type Mode } from "@/lib/modes"
import type { Account, Decision } from "@/lib/schemas"
import { SERVICING, type ServicingConfig } from "./config"
import { fund, type AccountVerificationOutcome } from "./funding"
import { simulateBook, type BookResult, type LoanSetup, type Script } from "./simulate"

/*
 * The three lenders' loan books: every approved applicant-lender pair is a
 * loan in that lender's book (CLAUDE.md §5B). Funding rails follow each
 * lender's style; a handful of planted scenarios exercise every recovery
 * path, and other loans get a small, risk-based, seeded chance of an NSF.
 */

export const FUNDING_INITIATED_AT = "2026-10-06T10:00"
/** A close match on an instant rail waits for a person to confirm the payee (see the Payee confirmation queue). */
export const FUNDING_AFTER_PAYEE_CONFIRMATION = "2026-10-06T11:30"
/** Twelve months of servicing after funding. */
export const HORIZON = "2027-10-06"

const SHORT: Record<Mode, string> = { credit_union: "cu", fintech: "kite", bank: "aspen" }
export const loanIdFor = (slug: string, mode: Mode) => `loan_${slug}-${SHORT[mode]}`

/** Planted servicing scenarios, keyed by loan id. */
export const SCRIPTS: Record<string, Script> = {
  // One NSF, retried on payday, collected: cured.
  "loan_grace-cu": { returns: [{ n: 2, attempt: 1, code: "901" }] },
  // NSF, retry also NSF (outreach), then the account is closed: no more debits, charge-off at 120 days.
  "loan_corner-grind-cafe-cu": {
    returns: [
      { n: 1, attempt: 1, code: "901" },
      { n: 1, attempt: 2, code: "901" },
      { n: 2, attempt: 1, code: "905" },
    ],
  },
  // Three NSFs within 90 days: hardship deferral offered.
  "loan_petalwick-florals-cu": {
    returns: [
      { n: 2, attempt: 1, code: "901" },
      { n: 3, attempt: 1, code: "901" },
      { n: 4, attempt: 1, code: "901" },
    ],
  },
  // NSF on a credit union account: the borrower's fee is the illustrative provincial one.
  "loan_hollis-family-farm-kite": { returns: [{ n: 5, attempt: 1, code: "901" }] },
  // The account doesn't allow debits (returned before settlement); borrower signs a new agreement.
  "loan_amara-kite": { returns: [{ n: 2, attempt: 1, code: "907" }], resumeAfterDays: 14 },
  // The borrower stopped a payment; after a call, debits resume.
  "loan_quillfeather-plumbing-kite": { returns: [{ n: 4, attempt: 1, code: "903" }], resumeAfterDays: 10 },
}

export interface BookInput {
  slug: string
  name: string
  kind: "personal" | "business"
  accounts: Account[]
  features: Features
  decisions: Record<Mode, Decision>
  pad: Record<Mode, PadPlan | null>
  accountVerification: AccountVerificationOutcome
}

/** Base chance a regular debit is returned NSF, from the applicant's history (illustrative). */
function baseReturnRate(f: Features): number {
  return Math.min(0.12, 0.004 + 0.02 * Math.min(f.nsf12m, 3) + (f.daysCashOnHand < 20 ? 0.01 : 0))
}

function railFor(mode: Mode, amountCents: number, config: ServicingConfig) {
  if (mode !== "fintech") return "aft" as const
  return amountCents <= config.rails.etransfer.limitCents ? ("etransfer" as const) : ("rtr_simulated" as const)
}

export function loanSetups(inputs: BookInput[], mode: Mode, config: ServicingConfig = SERVICING): LoanSetup[] {
  const setups: LoanSetup[] = []
  for (const a of inputs) {
    const d = a.decisions[mode]
    const plan = a.pad[mode]
    if (!plan || (d.outcome !== "approve" && d.outcome !== "approve_with_conditions")) continue
    const id = loanIdFor(a.slug, mode)
    const rail = railFor(mode, d.limitCents, config)
    const funding = fund(
      {
        loanId: id,
        amountCents: d.limitCents,
        rail,
        initiatedAt: rail !== "aft" && a.accountVerification.canFund === "after_confirming" ? FUNDING_AFTER_PAYEE_CONFIRMATION : FUNDING_INITIATED_AT,
        verification: a.accountVerification,
        confirmedWithBorrower: true,
      },
      config,
    )
    const deposit = a.accounts.find((x) => x.accountType === "CHECKING" || x.accountType === "BUSINESS_CHECKING") ?? a.accounts[0]
    setups.push({
      id,
      mode,
      institutionId: MODE_META[mode].institutionId,
      applicantSlug: a.slug,
      applicantName: a.name,
      kind: a.kind,
      product: d.product,
      principalCents: d.limitCents,
      schedule: plan.debits,
      draws: plan.draws,
      operatingReserveCents: plan.draws ? Math.round(a.features.avgMonthlyOutflowCents * config.operatingReserveMonthsOfSpending) : undefined,
      funding,
      borrowerAccount: { institutionType: deposit.institutionType, kind: a.kind },
      payroll: a.kind === "personal" && a.features.income.payroll ? { lastPayDate: a.features.income.payroll.lastPayDate, cadenceDays: a.features.income.payroll.cadenceDays } : null,
      recovery: CONFIGS[mode].recovery,
      baseReturnRate: baseReturnRate(a.features),
      script: SCRIPTS[id],
    })
  }
  return setups
}

export function buildBooks(inputs: BookInput[], horizon = HORIZON, config: ServicingConfig = SERVICING): Record<Mode, BookResult> {
  return Object.fromEntries(MODES.map((m) => [m, simulateBook(MODE_META[m].institutionId, m, loanSetups(inputs, m, config), horizon, config)])) as Record<Mode, BookResult>
}
