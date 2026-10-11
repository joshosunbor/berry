import { Consent, type Applicant, type ConsentEvent, type DataCategory, type ProductType } from "@/lib/schemas"

/*
 * Consent for reading an applicant's account data, built around the consent
 * principles of Canada's consumer-driven banking framework: what data, for
 * what purpose, for how long, and who receives it; only the data the
 * decision needs; free to give, renew or withdraw.
 *
 * The 12-month maximum comes from s. 86 of the Consumer-Driven Banking Act
 * (S.C. 2026, c. 3, s. 224; royal assent March 26, 2026), which is not yet
 * in force:
 * https://laws-lois.justice.gc.ca/eng/acts/C-36.78/page-5.html
 * Berry is simulated: no real institution is connected and nothing is
 * accredited.
 */

export const CONSENT_RULES = {
  maxMonths: 12,
  maxMonthsBasis: "Consumer-Driven Banking Act s. 86 (not yet in force)",
  source: "https://laws-lois.justice.gc.ca/eng/acts/C-36.78/page-5.html",
} as const

export const DATA_CATEGORY_LABELS: Record<DataCategory, string> = {
  account_details: "Account details (type, opening date)",
  balances: "Balances",
  transactions: "Transactions (12 months)",
  lending_accounts: "Credit cards and loans",
  registered_accounts: "Registered accounts (RRSP, TFSA and similar)",
  investments: "Investments",
  identity: "Identity information held by your bank",
}

/** Why each category is needed, in plain language. */
const WHY: Partial<Record<DataCategory, string>> = {
  account_details: "To know which accounts the cash flow comes from.",
  balances: "To see how many days of spending your balance covers.",
  transactions: "To measure income, spending and returned payments month by month.",
  lending_accounts: "To include existing card balances and loan payments.",
}

/**
 * The categories a credit decision needs. Lending accounts are requested
 * only when the applicant has card or loan accounts to share.
 */
export function categoriesNeeded(a: Pick<Applicant, "accounts">): DataCategory[] {
  const needed: DataCategory[] = ["account_details", "balances", "transactions"]
  if (a.accounts.some((x) => ["CREDIT_CARD", "LINE_OF_CREDIT", "LOAN"].includes(x.accountType))) needed.push("lending_accounts")
  return needed
}

const ALL: DataCategory[] = ["account_details", "balances", "transactions", "lending_accounts", "registered_accounts", "investments", "identity"]

export function whyNeeded(c: DataCategory): string | undefined {
  return WHY[c]
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString()
}

export interface ConsentRequest {
  applicant: Pick<Applicant, "id" | "slug" | "accounts">
  recipient: string
  product: ProductType
  grantedAt: string
  /** Defaults to the maximum; never more. */
  months?: number
}

export function buildConsent({ applicant, recipient, product, grantedAt, months = CONSENT_RULES.maxMonths }: ConsentRequest): Consent {
  if (months > CONSENT_RULES.maxMonths) throw new Error(`consent cannot exceed ${CONSENT_RULES.maxMonths} months`)
  const dataCategories = categoriesNeeded(applicant)
  // A month can be longer than 30 days; stay a day inside the 12-month limit.
  const expiresAt = new Date(Date.parse(addMonths(grantedAt, months)) - 86_400_000).toISOString()
  return Consent.parse({
    id: `cns_${applicant.slug}-${recipient.toLowerCase().split(" ")[0]}`,
    applicantId: applicant.id,
    dataCategories,
    notRequested: ALL.filter((c) => !dataCategories.includes(c)),
    purpose: `Assess your application for a ${product.replaceAll("_", " ")} and, if approved, set up repayment.`,
    recipient,
    accountIds: applicant.accounts.map((x) => x.accountId),
    grantedAt,
    expiresAt,
  })
}

export type ConsentState = "active" | "expired" | "revoked"

export function consentState(c: Consent, now: string): ConsentState {
  if (c.revokedAt && c.revokedAt <= now) return "revoked"
  if (c.expiresAt <= now) return "expired"
  return "active"
}

/** Revoking is free and immediate; the event is logged. */
export function revoke(c: Consent, at: string): { consent: Consent; event: ConsentEvent } {
  return { consent: { ...c, revokedAt: at }, event: { consentId: c.id, type: "revoked", at, detail: `Revoked by the customer: ${c.recipient}. Data sharing stops now.` } }
}
