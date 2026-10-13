import { dollars } from "@/lib/money"
import { Rng, hashSeed } from "@/lib/rng"
import type { Applicant, CreditRequest, ProtectedAttributes, Province, Relationship } from "@/lib/schemas"
import { biweekly, biweeklyPayroll, cardSettlements, cashDeposits, gigPayouts, monthly, weekly, type Window } from "./archetypes"
import type { TxnBuilder } from "./builder"
import { buildApplicant, WINDOW, type ApplicantSpec } from "./cast"
import { addDays, dayInMonth, eachMonth, monthOf, nextWeekday } from "./dates"

/*
 * Planted cases for the accuracy evaluation (CLAUDE.md §3). Each case is a
 * small, deliberate variation: obvious approvals, obvious declines and edge
 * cases near each lender's thresholds. The "correct" outcome per lender
 * lives only in tests/expected.json, which the engine never reads.
 */

const NAMES = ["Alex Morin", "Sam Delorme", "Jordan Pike", "Robin Achebe", "Taylor Brandt", "Casey Lund", "Morgan Iyer", "Jamie Okoro", "Riley Strand", "Avery Quist"]
const PROVINCES: Province[] = ["ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB"]

function fictionalPerson(seed: string, province: Province): ProtectedAttributes {
  const rng = new Rng(hashSeed(`person:${seed}`))
  const fsa: Record<string, string> = { ON: "K", BC: "V", AB: "T", QC: "H", MB: "R", SK: "S", NS: "B", NB: "E" }
  return {
    fullName: rng.pick(NAMES),
    dateOfBirth: `${rng.int(1950, 2002)}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
    gender: rng.pick(["female", "male", "non_binary", "undisclosed"] as const),
    nationality: "Canada",
    immigrationStatus: rng.pick(["citizen", "permanent_resident"] as const),
    // Z is never the first letter of a real Canadian postal code.
    postalCode: `Z0${fsa[province]} ${rng.int(1, 9)}Z${rng.int(1, 9)}`,
  }
}

const member = (since: string, products: Relationship["productsHeld"] = ["chequing", "savings"]): Relationship => ({ institutionId: "northgate", memberSince: since, productsHeld: products })

/** Recent dates for planted NSF events, relative to the window end (2026-09-30). */
export const NSF_RECENT = ["2026-08-17", "2026-09-14", "2026-07-20"]
export const NSF_OLD = ["2025-12-15", "2026-02-16"]

// ---------------------------------------------------------------------------
// Personal template
// ---------------------------------------------------------------------------

interface PersonalCase {
  id: string
  story: string
  income: { kind: "payroll" | "gig" | "pension"; monthly: number }
  /** Monthly living costs excluding loan payments. */
  spend: number
  loan?: number
  nsf?: string[]
  months?: number
  credit: { history: number; band: Applicant["creditFile"]["bureauBand"]; foreign?: boolean }
  member?: Relationship
  card?: { limit: number; owed: number; monthlyChange: number }
  request: CreditRequest
}

function personal(c: PersonalCase, i: number): ApplicantSpec {
  const province = PROVINCES[i % PROVINCES.length]
  const start = c.months ? `${addDays(WINDOW.end, -c.months * 30.5).slice(0, 7)}-01` : WINDOW.start
  const w: Window = { start, end: WINDOW.end }
  return {
    slug: `planted-${c.id}`,
    kind: "personal",
    displayName: `Planted case ${c.id.toUpperCase()}`,
    story: c.story,
    province,
    window: w,
    request: c.request,
    creditFile: { historyMonths: c.credit.history, bureauBand: c.credit.band, foreignReport: { available: !!c.credit.foreign, band: c.credit.foreign ? "good" : undefined } },
    relationship: c.member ?? null,
    business: null,
    protected: fictionalPerson(c.id, province),
    balanceFloor: c.nsf?.length ? -300 : 300,
    accounts: [
      { key: "chq", accountType: "CHECKING", provider: c.member ? "northgate" : "other", nickname: "Chequing", openedDate: "2015-01-05", opening: 1_000 },
      ...(c.card ? [{ key: "card", accountType: "CREDIT_CARD" as const, provider: "other" as const, nickname: "Card", openedDate: "2016-01-05", opening: c.card.owed, creditLimitCents: dollars(c.card.limit) }] : []),
    ],
    build(b, acc) {
      if (c.income.kind === "payroll") {
        biweeklyPayroll(b, acc.chq, w, { firstPayday: firstFriday(w.start), net: (c.income.monthly * 12) / 26, sd: 25, employer: "Fictional Employer Ltd." })
      } else if (c.income.kind === "pension") {
        monthly(b, acc.chq, w, { day: 25, amount: c.income.monthly, category: "PENSION", description: "Employer pension plan payment", channel: "EFT", memo: "CREDIT" })
      } else {
        gigPayouts(b, acc.chq, w, { activeDayChance: 0.86, platforms: [{ name: "Rideline", chance: 0.9, avg: c.income.monthly / 23, sd: c.income.monthly / 80 }] })
      }
      monthly(b, acc.chq, w, { day: 1, amount: c.spend * 0.45, category: "RENT_MORTGAGE", description: "Rent", channel: "PAD", merchant: "Fictional Landlord" })
      // Fixed weekly spending, so each case's monthly surplus lands where its design puts it.
      weekly(b, acc.chq, w, { weekday: 6, amount: (c.spend * 0.55 * 12) / 52, sd: 5, category: "GROCERIES", description: "Groceries", channel: "CARD", merchant: "Greenstall Market" })
      if (c.loan) {
        const bouncedMonths = (c.nsf ?? []).map(monthOf)
        monthly(b, acc.chq, w, { day: 15, amount: c.loan, category: "LOAN_PAYMENT", description: "Loan payment", channel: "PAD", merchant: "Carriway Auto Finance", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => !bouncedMonths.includes(m)) })
      }
      // NSF fees: Northgate members bank at a provincially regulated credit union
      // (illustrative fee); everyone else at a bank, capped at $10 from 2026-03-12.
      for (const d of c.nsf ?? []) {
        const amount = dollars(c.loan ?? 250)
        b.returnedDebit(acc.chq, d, amount, "LOAN_PAYMENT", "Loan payment", { reasonCode: "901", nsfFeeCents: dollars(c.member ? 45 : d >= "2026-03-12" ? 10 : 48), merchant: "Carriway Auto Finance" })
        b.debit(acc.chq, addDays(d, 7), amount, "LOAN_PAYMENT", "Loan payment (re-presented)", "PAD", { merchant: "Carriway Auto Finance" })
      }
      if (c.card) {
        const payment = 300
        const purchases = payment + c.card.monthlyChange
        if (purchases > 0) monthly(b, acc.card, w, { day: 10, amount: purchases, category: "SHOPPING", description: "Purchases", channel: "CARD", merchant: "Marlowe & Finch Department Store" })
        monthly(b, acc.card, w, { day: 26, amount: payment, category: "CARD_PAYMENT", description: "Payment received", channel: "EFT", memo: "CREDIT" })
        monthly(b, acc.chq, w, { day: 26, amount: payment, category: "CARD_PAYMENT", description: "Credit card payment", channel: "EFT" })
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Business template
// ---------------------------------------------------------------------------

interface BusinessCase {
  id: string
  story: string
  revenue:
    | { kind: "steady"; monthly: number; growth?: number }
    | { kind: "seasonal"; annual: number; peak: number[]; peakShare: number; variableCost: number; fixedCost: number }
    | { kind: "invoice"; monthly: number; spread: [number, number] }
  /** Operating costs as a share of revenue (steady and invoice businesses). */
  costRatio?: number
  loan?: number
  nsf?: string[]
  months?: number
  member?: Relationship
  cash?: { daily: number; events?: { at: string; amount: number }[] }
  request: CreditRequest
}

function business(c: BusinessCase, i: number): ApplicantSpec {
  const province = PROVINCES[(i + 3) % PROVINCES.length]
  const start = c.months ? `${addDays(WINDOW.end, -c.months * 30.5).slice(0, 7)}-01` : WINDOW.start
  const w: Window = { start, end: WINDOW.end }
  return {
    slug: `planted-${c.id}`,
    kind: "business",
    displayName: `Planted case ${c.id.toUpperCase()}`,
    story: c.story,
    province,
    window: w,
    request: c.request,
    creditFile: { historyMonths: 120, bureauBand: "good", foreignReport: { available: false } },
    relationship: c.member ?? null,
    business: { legalName: `Planted Business ${c.id.toUpperCase()} Ltd.`, registrationNo: `TEST-${c.id.toUpperCase()}`, structure: "corporation", industry: "Test case", yearsOperating: c.months ? 1 : 6, employees: 4 },
    protected: fictionalPerson(c.id, province),
    balanceFloor: c.nsf?.length ? -500 : 1_000,
    accounts: [{ key: "op", accountType: "BUSINESS_CHECKING", provider: c.member ? "northgate" : "other", nickname: "Operating", openedDate: "2018-01-02", opening: 5_000 }],
    build(b, acc) {
      const r = c.revenue
      if (r.kind === "steady") {
        cardSettlements(b, acc.op, w, { cadence: "daily", openDays: [1, 2, 3, 4, 5, 6], perPeriod: r.monthly / 26, sd: r.monthly / 26 / 8, processor: "Tallybrook Merchant Services", monthlyGrowth: r.growth })
        costs(b, acc.op, w, r.monthly * (c.costRatio ?? 0.85))
      } else if (r.kind === "invoice") {
        for (const m of eachMonth(w.start, w.end)) {
          const busy = b.rng.float(r.spread[0], r.spread[1])
          for (let k = 0; k < 5; k++) {
            b.credit(acc.op, nextWeekday(dayInMonth(m, b.rng.int(1, 28))), dollars((r.monthly * busy) / 5), "BUSINESS_REVENUE", "Client invoice payment", "EFT", { merchant: "Client payment" })
          }
        }
        costs(b, acc.op, w, r.monthly * (c.costRatio ?? 0.8))
      } else {
        const off = (1 - r.peakShare) / (12 - r.peak.length)
        for (const m of eachMonth(w.start, w.end)) {
          const share = r.peak.includes(monthOf(m)) ? r.peakShare / r.peak.length : off
          const revenue = r.annual * share
          for (let k = 0; k < 4; k++) {
            b.credit(acc.op, nextWeekday(dayInMonth(m, 3 + k * 7)), dollars(revenue / 4), "CARD_SETTLEMENT", "Card settlement Tallybrook Merchant Services", "EFT", { merchant: "Tallybrook Merchant Services" })
          }
          monthly(b, acc.op, { start: m, end: w.end }, { day: 12, amount: revenue * r.variableCost, category: "SUPPLIES_INVENTORY", description: "Supplies", channel: "EFT", months: [monthOf(m)] })
        }
        monthly(b, acc.op, w, { day: 1, amount: (r.annual * r.fixedCost) / 12, category: "RENT_COMMERCIAL", description: "Lease and fixed costs", channel: "PAD" })
      }
      if (c.loan) {
        const bouncedMonths = (c.nsf ?? []).map(monthOf)
        monthly(b, acc.op, w, { day: 8, amount: c.loan, category: "LOAN_PAYMENT", description: "Equipment loan", channel: "PAD", merchant: "Fieldline Equipment Credit", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => !bouncedMonths.includes(m)) })
      }
      for (const d of c.nsf ?? []) {
        b.returnedDebit(acc.op, d, dollars(c.loan ?? 1_500), "LOAN_PAYMENT", "Equipment loan", { reasonCode: "901", nsfFeeCents: dollars(45), merchant: "Fieldline Equipment Credit" })
        b.debit(acc.op, addDays(d, 7), dollars(c.loan ?? 1_500), "LOAN_PAYMENT", "Equipment loan (re-presented)", "PAD", { merchant: "Fieldline Equipment Credit" })
      }
      if (c.cash) {
        cashDeposits(b, acc.op, w, { avg: c.cash.daily, sd: c.cash.daily * 0.1, openDays: [1, 2, 3, 4, 5, 6], skip: c.cash.events?.map((e) => e.at.slice(0, 10)), max: c.cash.daily * 1.4 })
        for (const e of c.cash.events ?? []) b.credit(acc.op, e.at.slice(0, 10), dollars(e.amount), "CASH_DEPOSIT", "Branch cash deposit", "CASH", { time: e.at.slice(11, 16) })
      }
    },
  }
}

/** The first Friday on or after `date`. */
function firstFriday(date: string): string {
  let d = date
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 5) d = addDays(d, 1)
  return d
}

/** Operating costs totalling `monthlyTotal` a month: supplier, payroll and lease. */
function costs(b: TxnBuilder, accountId: string, w: Window, monthlyTotal: number) {
  weekly(b, accountId, w, { weekday: 3, amount: (monthlyTotal * 0.45 * 12) / 52, sd: 50, category: "SUPPLIES_INVENTORY", description: "Supplier", channel: "PAD", merchant: "Gearloft Parts Distribution" })
  biweekly(b, accountId, w, { first: "2025-10-03", amount: (monthlyTotal * 0.4 * 12) / 26, sd: 40, category: "PAYROLL_EXPENSE", description: "Payroll run", channel: "EFT" })
  monthly(b, accountId, w, { day: 1, amount: monthlyTotal * 0.15, category: "RENT_COMMERCIAL", description: "Lease", channel: "PAD" })
}

// ---------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------

const PL = (amount: number, termMonths = 36): CreditRequest => ({ product: "personal_loan", amountCents: dollars(amount), termMonths, purpose: "Planted case" })
const req = (product: CreditRequest["product"], amount: number, termMonths?: number): CreditRequest => ({ product, amountCents: dollars(amount), termMonths, purpose: "Planted case" })

export const PERSONAL_CASES: PersonalCase[] = [
  { id: "p01", story: "Clean salaried member with plenty left over each month.", income: { kind: "payroll", monthly: 5_500 }, spend: 3_300, credit: { history: 120, band: "good" }, member: member("2017-03-01", ["chequing", "savings", "tfsa"]), request: PL(10_000) },
  { id: "p02", story: "Clean salaried non-member, small loan.", income: { kind: "payroll", monthly: 4_800 }, spend: 3_200, credit: { history: 90, band: "good" }, request: PL(5_000) },
  { id: "p03", story: "Three bounced payments in the last 90 days.", income: { kind: "payroll", monthly: 4_200 }, spend: 3_300, loan: 300, nsf: NSF_RECENT, credit: { history: 80, band: "fair" }, request: PL(6_000) },
  { id: "p04", story: "One bounced payment in the last 90 days, otherwise clean.", income: { kind: "payroll", monthly: 5_000 }, spend: 3_200, loan: 300, nsf: ["2026-08-17"], credit: { history: 80, band: "good" }, member: member("2019-06-01"), request: PL(6_000) },
  { id: "p05", story: "Two bounced payments in the last 90 days.", income: { kind: "payroll", monthly: 5_000 }, spend: 3_200, loan: 300, nsf: ["2026-08-17", "2026-09-14"], credit: { history: 80, band: "good" }, member: member("2019-06-01"), request: PL(6_000) },
  { id: "p06", story: "Two bounced payments seven to nine months ago, none since.", income: { kind: "payroll", monthly: 5_000 }, spend: 3_200, loan: 300, nsf: NSF_OLD, credit: { history: 80, band: "fair" }, request: PL(6_000) },
  { id: "p07", story: "Thin credit file (5 months), steady pay, Northgate member.", income: { kind: "payroll", monthly: 4_200 }, spend: 2_600, credit: { history: 5, band: "thin" }, member: member("2026-01-10"), request: req("starter_credit", 2_000) },
  { id: "p08", story: "Thin credit file (5 months), steady pay, not a member.", income: { kind: "payroll", monthly: 4_200 }, spend: 2_600, credit: { history: 5, band: "thin" }, request: req("starter_credit", 2_000) },
  { id: "p09", story: "Thin Canadian file, but an imported foreign credit report is available.", income: { kind: "payroll", monthly: 5_200 }, spend: 3_000, months: 14, credit: { history: 8, band: "thin", foreign: true }, request: req("credit_card", 3_000) },
  { id: "p10", story: "Only seven months of account history, long credit file.", income: { kind: "payroll", monthly: 5_000 }, spend: 3_000, months: 7, credit: { history: 60, band: "good" }, request: PL(5_000) },
  { id: "p11", story: "Steady gig income from daily payouts.", income: { kind: "gig", monthly: 3_900 }, spend: 2_900, credit: { history: 50, band: "fair" }, request: req("credit_card", 3_000) },
  { id: "p12", story: "Gig income with two bounced payments in the last 90 days.", income: { kind: "gig", monthly: 3_900 }, spend: 2_800, loan: 250, nsf: ["2026-08-17", "2026-09-14"], credit: { history: 50, band: "fair" }, member: member("2021-02-01"), request: req("credit_card", 3_000) },
  { id: "p13", story: "Retiree on a workplace pension, long-time member.", income: { kind: "pension", monthly: 3_800 }, spend: 2_300, credit: { history: 400, band: "excellent" }, member: member("2001-05-01", ["chequing", "savings", "term_deposit"]), request: req("line_of_credit", 10_000) },
  { id: "p14", story: "Credit cards at 95% of their limits and climbing.", income: { kind: "payroll", monthly: 4_500 }, spend: 3_400, credit: { history: 90, band: "fair" }, card: { limit: 10_000, owed: 8_300, monthlyChange: 100 }, request: PL(8_000) },
  { id: "p15", story: "Credit cards at about 85% of their limits, stable.", income: { kind: "payroll", monthly: 5_200 }, spend: 3_000, credit: { history: 90, band: "good" }, card: { limit: 10_000, owed: 8_500, monthlyChange: 0 }, request: PL(5_000) },
  { id: "p16", story: "Stable pay, but only about $250 a month left over.", income: { kind: "payroll", monthly: 4_200 }, spend: 3_950, credit: { history: 90, band: "good" }, request: PL(15_000) },
  { id: "p17", story: "Spends more than they earn every month.", income: { kind: "payroll", monthly: 4_000 }, spend: 4_350, credit: { history: 90, band: "fair" }, request: PL(10_000) },
  { id: "p18", story: "Existing loan payments take almost everything left over.", income: { kind: "payroll", monthly: 5_000 }, spend: 3_700, loan: 1_220, credit: { history: 90, band: "fair" }, request: PL(10_000) },
  { id: "p19", story: "Long-time member whose coverage sits just under the standard minimum.", income: { kind: "payroll", monthly: 4_500 }, spend: 4_135, credit: { history: 150, band: "good" }, member: member("2010-01-01", ["chequing", "savings", "tfsa", "rrsp"]), request: PL(10_000) },
  { id: "p21", story: "Newcomer with credit history from a country covered by foreign credit report programs, and a thin Canadian file.", income: { kind: "payroll", monthly: 4_800 }, spend: 3_000, months: 14, credit: { history: 4, band: "thin", foreign: true }, request: req("credit_card", 3_000) },
  { id: "p20", story: "High earner asking for more than any lender's personal loan maximum.", income: { kind: "payroll", monthly: 14_000 }, spend: 6_000, credit: { history: 200, band: "excellent" }, request: PL(60_000, 60) },
]

export const BUSINESS_CASES: BusinessCase[] = [
  { id: "b01", story: "Steady business, clean, asking for exactly the Lending officer tier limit.", revenue: { kind: "steady", monthly: 60_000 }, costRatio: 0.85, member: member("2016-01-01", ["business_account", "savings"]), request: req("business_term_loan", 50_000, 60) },
  { id: "b02", story: "Steady business, clean, just above the Lending officer tier limit.", revenue: { kind: "steady", monthly: 60_000 }, costRatio: 0.85, member: member("2016-01-01", ["business_account", "savings"]), request: req("business_term_loan", 55_000, 60) },
  { id: "b03", story: "Seasonal business; the off-season still breaks even.", revenue: { kind: "seasonal", annual: 480_000, peak: [6, 7, 8], peakShare: 0.55, variableCost: 0.45, fixedCost: 0.2 }, member: member("2012-01-01", ["business_account", "savings", "term_deposit"]), request: req("seasonal_operating_line", 40_000) },
  { id: "b04", story: "Strongly seasonal; most months lose money outside the peak.", revenue: { kind: "seasonal", annual: 480_000, peak: [9, 10, 11], peakShare: 0.75, variableCost: 0.5, fixedCost: 0.35 }, member: member("2008-01-01", ["business_account", "savings", "term_deposit"]), request: req("seasonal_operating_line", 40_000) },
  { id: "b05", story: "Seasonal business asking for a line larger than its peak season can repay.", revenue: { kind: "seasonal", annual: 300_000, peak: [6, 7, 8], peakShare: 0.55, variableCost: 0.45, fixedCost: 0.2 }, member: member("2014-01-01", ["business_account"]), request: req("seasonal_operating_line", 150_000) },
  { id: "b06", story: "Invoice-based business with very uneven months.", revenue: { kind: "invoice", monthly: 20_000, spread: [0.25, 2.1] }, costRatio: 0.75, member: member("2019-01-01", ["business_account"]), request: req("business_line_of_credit", 15_000) },
  { id: "b07", story: "Invoice-based business with fairly even months.", revenue: { kind: "invoice", monthly: 20_000, spread: [0.85, 1.15] }, costRatio: 0.75, member: member("2019-01-01", ["business_account"]), request: req("business_line_of_credit", 15_000) },
  { id: "b08", story: "Steady business with two bounced payments in the last 90 days.", revenue: { kind: "steady", monthly: 40_000 }, costRatio: 0.85, loan: 1_500, nsf: ["2026-08-17", "2026-09-14"], request: req("business_line_of_credit", 20_000) },
  { id: "b09", story: "Steady business with three bounced payments in the last 90 days.", revenue: { kind: "steady", monthly: 40_000 }, costRatio: 0.85, loan: 1_500, nsf: NSF_RECENT, request: req("business_line_of_credit", 20_000) },
  { id: "b10", story: "Business spending more than it brings in.", revenue: { kind: "steady", monthly: 40_000 }, costRatio: 1.06, request: req("business_term_loan", 30_000, 36) },
  { id: "b11", story: "Large, strong practice financing $400,000 of equipment.", revenue: { kind: "steady", monthly: 180_000 }, costRatio: 0.82, member: member("2011-01-01", ["business_account", "savings", "term_deposit"]), request: req("equipment_financing", 400_000, 84) },
  { id: "b12", story: "Cash business with one single cash deposit of $12,000.", revenue: { kind: "steady", monthly: 30_000 }, costRatio: 0.8, cash: { daily: 600, events: [{ at: "2026-05-08T11:20", amount: 12_000 }] }, member: member("2015-01-01", ["business_account"]), request: req("business_line_of_credit", 20_000) },
  { id: "b13", story: "Cash business with two deposits totalling $10,500 within 24 hours, across midnight.", revenue: { kind: "steady", monthly: 30_000 }, costRatio: 0.8, cash: { daily: 600, events: [{ at: "2026-04-16T16:30", amount: 6_000 }, { at: "2026-04-17T10:15", amount: 4_500 }] }, member: member("2015-01-01", ["business_account"]), request: req("business_line_of_credit", 20_000) },
  { id: "b14", story: "Cash business whose largest day is a $9,900 deposit: just under the reporting threshold.", revenue: { kind: "steady", monthly: 30_000 }, costRatio: 0.8, cash: { daily: 600, events: [{ at: "2026-06-11T12:00", amount: 9_900 }] }, member: member("2015-01-01", ["business_account"]), request: req("business_line_of_credit", 20_000) },
  { id: "b15", story: "New business with nine months of history, otherwise healthy.", revenue: { kind: "steady", monthly: 35_000 }, costRatio: 0.8, months: 9, request: req("business_term_loan", 25_000, 36) },
  { id: "b16", story: "Growing business whose existing debt leaves little room for a new loan.", revenue: { kind: "steady", monthly: 50_000, growth: 0.01 }, costRatio: 0.86, loan: 6_500, request: req("business_term_loan", 100_000, 60) },
]

export function generatePlanted(): Applicant[] {
  return [...PERSONAL_CASES.map(personal), ...BUSINESS_CASES.map(business)].map(buildApplicant)
}
