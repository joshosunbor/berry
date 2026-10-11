import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { Applicant, InstitutionConfig, type Transaction } from "@/lib/schemas"
import { addDays, monthOf } from "@/scripts/generators/dates"
import { CAST, MAIN_STREET_CASH_DAY, generateCast } from "@/scripts/generators/cast"
import { INSTITUTIONS, NORTHGATE } from "@/scripts/generators/institutions"

const cast = generateCast()
const bySlug = (slug: string) => {
  const a = cast.find((x) => x.slug === slug)
  if (!a) throw new Error(`missing ${slug}`)
  return a
}

const credits = (txns: Transaction[]) => txns.filter((t) => t.debitCreditMemo === "CREDIT")
const sum = (txns: Transaction[]) => txns.reduce((s, t) => s + t.amountCents, 0)
const revenue = (txns: Transaction[]) => credits(txns).filter((t) => t.category === "BUSINESS_REVENUE" || t.category === "CARD_SETTLEMENT")
const returnsSince = (a: Applicant, days: number) =>
  a.transactions.filter((t) => t.returnOf && t.postedDate > addDays(a.generated.windowEnd, -days))

describe("generator", () => {
  it("is deterministic", () => {
    expect(generateCast()).toEqual(cast)
  })

  it("matches the committed data files", () => {
    const dir = path.resolve(__dirname, "../data/applicants")
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    expect(files).toEqual(cast.map((a) => `${a.slug}.json`).sort())
    for (const a of cast) {
      const onDisk = JSON.parse(readFileSync(path.join(dir, `${a.slug}.json`), "utf8"))
      expect(onDisk, `${a.slug}.json is stale; run npm run generate`).toEqual(Applicant.parse(a))
    }
  })

  it("writes the loan index that proxy.ts uses for 404s", async () => {
    const { getLoanViews } = await import("@/lib/data")
    const index = JSON.parse(readFileSync(path.resolve(__dirname, "../data/loan-index.json"), "utf8"))
    expect(index).toEqual(getLoanViews().map((l) => l.id).sort())
  })

  it("writes the applicant index that proxy.ts uses for 404s", () => {
    const index = JSON.parse(readFileSync(path.resolve(__dirname, "../data/cast-index.json"), "utf8"))
    expect(index).toEqual(cast.map((a) => a.slug))
  })

  it("produces a cast of 14: the 10 required applicants plus four more", () => {
    expect(cast).toHaveLength(14)
    const required = ["priya", "hollis-family-farm", "amara", "daniel", "sofia", "northline-auto-repair", "bright-smile-dental", "corner-grind-cafe", "lakeside-lodge", "main-street-hardware"]
    expect(CAST.slice(0, 10).map((s) => s.slug)).toEqual(required)
    expect(cast.filter((a) => a.kind === "personal")).toHaveLength(6)
    expect(cast.filter((a) => a.kind === "business")).toHaveLength(8)
  })

  it.each(cast.map((a) => [a.slug, a] as const))("%s passes schema validation", (_slug, a) => {
    const result = Applicant.safeParse(a)
    expect(result.success, JSON.stringify(!result.success && result.error.issues.slice(0, 3))).toBe(true)
  })

  it("assigns unique, ordered transaction ids within the window", () => {
    for (const a of cast) {
      const ids = a.transactions.map((t) => t.transactionId)
      expect(new Set(ids).size).toBe(ids.length)
      const stamps = a.transactions.map((t) => t.postedDate)
      expect([...stamps].sort()).toEqual(stamps)
      expect(stamps[0] >= a.generated.windowStart && stamps.at(-1)! <= a.generated.windowEnd).toBe(true)
    }
  })

  it("places Hollis Family Farm in Saskatchewan or Alberta, never Manitoba", () => {
    expect(["SK", "AB"]).toContain(bySlug("hollis-family-farm").province)
  })

  it("spreads the cast so no province has more than 3 applicants", () => {
    const counts = new Map<string, number>()
    for (const a of cast) counts.set(a.province, (counts.get(a.province) ?? 0) + 1)
    for (const [province, n] of counts) expect(n, province).toBeLessThanOrEqual(3)
  })

  it("never puts a location below province level outside the protected attributes", () => {
    for (const a of cast) {
      const visible = JSON.stringify({ ...a, protected: undefined })
      expect(visible).not.toContain(a.protected.postalCode)
      expect(visible).not.toContain(a.protected.fullName)
    }
  })

  it("writes valid institution configs", () => {
    for (const c of INSTITUTIONS) expect(InstitutionConfig.safeParse(c).success).toBe(true)
  })
})

describe("story targets", () => {
  it("Priya: regular bi-weekly payroll and no returned payments", () => {
    const a = bySlug("priya")
    const pay = a.transactions.filter((t) => t.category === "PAYROLL")
    expect(pay.length).toBeGreaterThanOrEqual(25)
    for (let i = 1; i < pay.length; i++) {
      expect(addDays(pay[i - 1].postedDate, 14)).toBe(pay[i].postedDate)
    }
    expect(returnsSince(a, 365)).toHaveLength(0)
  })

  it("Hollis Family Farm: at least 60% of sales arrive at harvest (Sep–Nov)", () => {
    const sales = revenue(bySlug("hollis-family-farm").transactions)
    const harvest = sales.filter((t) => [9, 10, 11].includes(monthOf(t.postedDate)))
    expect(sum(harvest) / sum(sales)).toBeGreaterThanOrEqual(0.6)
  })

  it("Lakeside Lodge: at least 60% of revenue arrives Jun–Aug", () => {
    const sales = revenue(bySlug("lakeside-lodge").transactions)
    const summer = sales.filter((t) => [6, 7, 8].includes(monthOf(t.postedDate)))
    expect(sum(summer) / sum(sales)).toBeGreaterThanOrEqual(0.6)
  })

  it("Amara: many small gig deposits", () => {
    const gig = bySlug("amara").transactions.filter((t) => t.category === "GIG_INCOME")
    expect(gig.length / 12).toBeGreaterThanOrEqual(30)
    expect(sum(gig) / gig.length).toBeLessThan(20_000)
  })

  it("Daniel: seven months of history, thin file, no foreign report", () => {
    const a = bySlug("daniel")
    expect(a.generated.windowStart).toBe("2026-03-01")
    expect(a.transactions[0].postedDate >= "2026-03-01").toBe(true)
    expect(a.creditFile.historyMonths).toBeLessThanOrEqual(7)
    expect(a.creditFile.bureauBand).toBe("thin")
    expect(a.creditFile.foreignReport.available).toBe(false)
    expect(a.transactions.filter((t) => t.category === "PAYROLL").length).toBeGreaterThanOrEqual(14)
  })

  it("Sofia: three NSF returns in the last 90 days and a rising card balance", () => {
    const a = bySlug("sofia")
    const recent = returnsSince(a, 90)
    expect(recent).toHaveLength(3)
    expect(recent.every((t) => t.returnOf?.reasonCode === "901")).toBe(true)
    // NSF fees after 2026-03-12 respect the $10 cap.
    const fees = a.transactions.filter((t) => t.category === "NSF_FEE" && t.postedDate >= "2026-03-12")
    expect(fees.every((t) => t.amountCents <= 1_000)).toBe(true)
    const card = a.accounts.find((x) => x.accountType === "CREDIT_CARD")!
    const cardTxns = a.transactions.filter((t) => t.accountId === card.accountId)
    const owedAtEnd = card.openingBalanceCents + sum(cardTxns.filter((t) => t.debitCreditMemo === "DEBIT")) - sum(credits(cardTxns))
    expect(owedAtEnd - card.openingBalanceCents).toBeGreaterThan(100_000)
    // Near the limit, but not over it.
    expect(owedAtEnd).toBeLessThanOrEqual(card.creditLimitCents!)
  })

  it("Northline Auto Repair: revenue growing, last 3 months above the prior 3", () => {
    const sales = revenue(bySlug("northline-auto-repair").transactions)
    const last3 = sum(sales.filter((t) => t.postedDate >= "2026-07-01"))
    const prior3 = sum(sales.filter((t) => t.postedDate >= "2026-04-01" && t.postedDate < "2026-07-01"))
    expect(last3).toBeGreaterThan(prior3)
  })

  it("Bright Smile Dental: request exceeds Branch Manager authority, so it goes to credit committee", () => {
    const branch = NORTHGATE.authorityTiers!.find((t) => t.id === "branch_manager")!
    expect(bySlug("bright-smile-dental").request.amountCents).toBeGreaterThan(branch.maxExposureCents!)
  })

  it("Corner Grind Café: thin margin and two NSF returns in the last 90 days", () => {
    const a = bySlug("corner-grind-cafe")
    expect(returnsSince(a, 90)).toHaveLength(2)
    const inflow = sum(credits(a.transactions))
    const outflow = sum(a.transactions.filter((t) => t.debitCreditMemo === "DEBIT"))
    const margin = (inflow - outflow) / inflow
    expect(margin).toBeGreaterThan(0)
    expect(margin).toBeLessThan(0.07)
  })

  it("Ellen: pension and government benefits, every month", () => {
    const a = bySlug("ellen")
    expect(a.transactions.filter((t) => t.category === "PENSION" && t.debitCreditMemo === "CREDIT")).toHaveLength(12)
    expect(a.transactions.filter((t) => t.category === "GOVERNMENT_BENEFIT" && t.debitCreditMemo === "CREDIT")).toHaveLength(24)
  })

  it("Grace: two NSFs last winter, none in the last 90 days, card balance falling", () => {
    const a = bySlug("grace")
    expect(returnsSince(a, 365)).toHaveLength(2)
    expect(returnsSince(a, 90)).toHaveLength(0)
    const card = a.accounts.find((x) => x.accountType === "CREDIT_CARD")!
    const cardTxns = a.transactions.filter((t) => t.accountId === card.accountId)
    const owedAtEnd = card.openingBalanceCents + sum(cardTxns.filter((t) => t.debitCreditMemo === "DEBIT")) - sum(credits(cardTxns))
    expect(owedAtEnd).toBeLessThan(card.openingBalanceCents - 200_000)
  })

  it("Quillfeather Plumbing: a handful of invoice payments a month, uneven but not seasonal", () => {
    const sales = revenue(bySlug("quillfeather-plumbing").transactions)
    expect(sales.length / 12).toBeLessThanOrEqual(8)
    const byMonth = new Map<string, number>()
    for (const t of sales) byMonth.set(t.postedDate.slice(0, 7), (byMonth.get(t.postedDate.slice(0, 7)) ?? 0) + t.amountCents)
    const totals = [...byMonth.values()]
    expect(Math.max(...totals) / Math.min(...totals)).toBeGreaterThan(2)
  })

  it("Petalwick Florals: existing loan payments of at least $4,000 a month", () => {
    const debt = bySlug("petalwick-florals").transactions.filter((t) => t.category === "LOAN_PAYMENT")
    expect(sum(debt) / 12).toBeGreaterThan(400_000)
  })

  it("Main Street Hardware: exactly one day of cash deposits over $10,000, made of two deposits", () => {
    const cash = bySlug("main-street-hardware").transactions.filter((t) => t.channel === "CASH" && t.debitCreditMemo === "CREDIT")
    const byDay = new Map<string, Transaction[]>()
    for (const t of cash) byDay.set(t.postedDate, [...(byDay.get(t.postedDate) ?? []), t])
    const bigDays = [...byDay].filter(([, txns]) => sum(txns) >= 1_000_000)
    expect(bigDays.map(([d]) => d)).toEqual([MAIN_STREET_CASH_DAY])
    expect(bigDays[0][1]).toHaveLength(2)
    expect(cash.every((t) => t.amountCents < 1_000_000)).toBe(true)
  })
})
