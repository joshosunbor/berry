import { describe, expect, it } from "vitest"
import { loadApplicants } from "@/lib/evaluation/load"
import { buildConsent, categoriesNeeded, consentState, CONSENT_RULES, revoke } from "@/lib/onboarding/consent"
import { summarize, verifyApplicant } from "@/lib/onboarding/kyc"
import { levenshtein, nameSimilarity, normalizeName } from "@/lib/onboarding/names"
import { Consent, VerificationCheck } from "@/lib/schemas"
import watchlist from "@/data/watchlist.json"
import path from "node:path"

const cast = loadApplicants(path.resolve(__dirname, "../data/applicants"))
const bySlug = (s: string) => cast.find((a) => a.slug === s)!

describe("name matching", () => {
  it("normalises accents, titles and punctuation", () => {
    expect(normalizeName("Dr. Grace Lavallée-Ng")).toEqual(["grace", "lavallee", "ng"])
  })
  it("measures edit distance", () => {
    expect(levenshtein("thibodeau", "thibodeaux")).toBe(1)
    expect(levenshtein("kitten", "sitting")).toBe(3)
  })
  it("scores identical names 1 and unrelated names 0", () => {
    expect(nameSimilarity("Sofia Marchetti", "Sofia Marchetti")).toBe(1)
    expect(nameSimilarity("Sofia Marchetti", "Corvin Aldenmarsh")).toBe(0)
  })
})

describe("simulated identity and business checks", () => {
  it("produces valid, simulated checks for every applicant, deterministically", () => {
    for (const a of cast) {
      const checks = verifyApplicant(a)
      for (const c of checks) expect(VerificationCheck.safeParse(c).success, `${a.slug} ${c.kind}`).toBe(true)
      expect(checks.every((c) => c.simulated)).toBe(true)
      expect(verifyApplicant(a)).toEqual(checks)
    }
  })

  it("sends exactly the two planted cases to review", () => {
    const review = cast.filter((a) => summarize(verifyApplicant(a)).outcome === "needs_review").map((a) => a.slug).sort()
    expect(review).toEqual(["larchmere-lodge", "quillbean-cafe"])
  })

  it("flags a watch-list near-match for a person to clear, not an automatic fail", () => {
    const sanctions = verifyApplicant(bySlug("quillbean-cafe")).find((c) => c.kind === "sanctions_screening")!
    expect(sanctions.result).toBe("needs_review")
    expect(sanctions.reasons.join(" ")).toMatch(/fictional sanctions list/)
    expect(sanctions.automated).toBe(false)
  })

  it("never puts a protected attribute (name, date of birth) in a reason shown to users", () => {
    for (const a of cast) {
      const text = JSON.stringify(verifyApplicant(a).map((c) => c.reasons))
      expect(text).not.toContain(a.protected.fullName)
      expect(text).not.toContain(a.protected.dateOfBirth)
    }
  })

  it("flags an overdue annual filing", () => {
    const reg = verifyApplicant(bySlug("larchmere-lodge")).find((c) => c.kind === "business_registration")!
    expect(reg.result).toBe("needs_review")
    expect(reg.reasons[0]).toMatch(/17 months ago/)
  })

  it("runs business checks only for businesses, and ownership checks only for non-sole-proprietors", () => {
    expect(verifyApplicant(bySlug("priya")).some((c) => c.kind === "business_registration")).toBe(false)
    expect(verifyApplicant(bySlug("quillfeather-plumbing")).some((c) => c.kind === "beneficial_ownership")).toBe(false)
    expect(verifyApplicant(bySlug("corvane-auto-repair")).some((c) => c.kind === "beneficial_ownership")).toBe(true)
  })

  it("clears automated cases in seconds and manual reviews take hours", () => {
    const auto = summarize(verifyApplicant(bySlug("priya")))
    expect(auto.automated).toBe(true)
    expect(auto.timeToVerifyMs).toBeLessThan(5_000)
    expect(summarize(verifyApplicant(bySlug("larchmere-lodge"))).timeToVerifyMs).toBeGreaterThan(3_600_000)
  })

  it("uses a watch list that is explicitly fictional", () => {
    expect(watchlist._about).toMatch(/FICTIONAL/)
    expect(watchlist.entries.every((e) => e.id.startsWith("WL-FIC-"))).toBe(true)
  })
})

describe("consent", () => {
  const priya = bySlug("priya")
  const sofia = bySlug("sofia")
  const grantedAt = "2026-10-05T15:00:00.000Z"

  it("requests only what the decision needs", () => {
    expect(categoriesNeeded(priya)).toEqual(["account_details", "balances", "transactions"])
    expect(categoriesNeeded(sofia)).toContain("lending_accounts")
    const c = buildConsent({ applicant: priya, recipient: "Northgate Credit Union", product: "personal_loan", grantedAt })
    expect(c.notRequested).toEqual(expect.arrayContaining(["registered_accounts", "investments", "identity", "lending_accounts"]))
  })

  it("expires within 12 months (Act s. 86) and refuses longer", () => {
    const c = buildConsent({ applicant: priya, recipient: "Kite", product: "personal_loan", grantedAt })
    expect(Consent.safeParse(c).success).toBe(true)
    expect(c.expiresAt < "2027-10-05").toBe(true)
    expect(CONSENT_RULES.maxMonthsBasis).toMatch(/s\. 86 \(not yet in force\)/)
    expect(() => buildConsent({ applicant: priya, recipient: "Kite", product: "personal_loan", grantedAt, months: 13 })).toThrow()
  })

  it("tracks active, expired and revoked states, and logs revocation", () => {
    const c = buildConsent({ applicant: priya, recipient: "Aspen Bank", product: "personal_loan", grantedAt })
    expect(consentState(c, "2026-11-01T00:00:00Z")).toBe("active")
    expect(consentState(c, "2027-10-06T00:00:00Z")).toBe("expired")
    const { consent, event } = revoke(c, "2026-11-01T00:00:00Z")
    expect(consentState(consent, "2026-11-02T00:00:00Z")).toBe("revoked")
    expect(event.type).toBe("revoked")
  })
})
