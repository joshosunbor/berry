import { dollars } from "@/lib/money"
import { Rng, hashSeed } from "@/lib/rng"
import type { Account, Applicant, BusinessProfile, CreditFile, CreditRequest, ProtectedAttributes, Province, Relationship } from "@/lib/schemas"
import {
  biweekly,
  biweeklyPayroll,
  cardSettlements,
  cashDeposits,
  everyday,
  gigPayouts,
  monthly,
  seasonalRevenue,
  weekly,
  type Window,
} from "./archetypes"
import { TxnBuilder, settleOpeningBalance } from "./builder"
import { addDays, dayInMonth, eachDay, eachMonth, isWeekend, monthOf, nextWeekday } from "./dates"

/*
 * The required cast (CLAUDE.md §3). All people, businesses, employers,
 * platforms and suppliers are fictional. Location is a province at most.
 */

export const GENERATOR_VERSION = "1.0.0"

/** Twelve months of history ending on a fixed date, so output never depends on today. */
export const WINDOW: Window = { start: "2025-10-01", end: "2026-09-30" }

/** Fixed standard-time offsets by province. DST is ignored for synthetic data. */
const UTC_OFFSET: Record<Province, string> = {
  BC: "-08:00",
  AB: "-07:00",
  NT: "-07:00",
  YT: "-07:00",
  SK: "-06:00",
  MB: "-06:00",
  NU: "-05:00",
  ON: "-05:00",
  QC: "-05:00",
  NB: "-04:00",
  NS: "-04:00",
  PE: "-04:00",
  NL: "-03:30",
}

type AccountSpec = Omit<Account, "accountId" | "currency" | "openingBalanceCents" | "institutionType"> & { key: string; opening: number }

/** Northgate is a provincially regulated credit union; every other provider in the data is a bank. */
export const institutionTypeOf = (provider: Account["provider"]): Account["institutionType"] => (provider === "northgate" ? "credit_union" : "bank")

export interface ApplicantSpec {
  slug: string
  kind: Applicant["kind"]
  displayName: string
  story: string
  province: Province
  request: CreditRequest
  creditFile: CreditFile
  relationship: Relationship | null
  business: BusinessProfile | null
  protected: ProtectedAttributes
  window?: Window
  accounts: AccountSpec[]
  /** Lowest running balance, in dollars, deposit accounts may reach. Negative means an overdraft. */
  balanceFloor?: number
  build: (b: TxnBuilder, acc: Record<string, string>, w: Window) => void
}

export function buildApplicant(spec: ApplicantSpec): Applicant {
  const w = spec.window ?? WINDOW
  const seed = hashSeed(`berry:${spec.slug}`)
  const b = new TxnBuilder(spec.slug, new Rng(seed), UTC_OFFSET[spec.province])
  const acc = Object.fromEntries(spec.accounts.map((a) => [a.key, `acc_${spec.slug}-${a.key}`]))
  spec.build(b, acc, w)
  const transactions = b.build(w.start, w.end)
  const floor = dollars(spec.balanceFloor ?? 500)
  const accounts: Account[] = spec.accounts.map(({ key, opening, ...rest }) =>
    settleOpeningBalance({ accountId: acc[key], currency: "CAD", openingBalanceCents: dollars(opening), institutionType: institutionTypeOf(rest.provider), ...rest }, transactions, floor),
  )
  return {
    id: `apl_${spec.slug}`,
    slug: spec.slug,
    kind: spec.kind,
    displayName: spec.displayName,
    story: spec.story,
    province: spec.province,
    request: spec.request,
    creditFile: spec.creditFile,
    relationship: spec.relationship,
    business: spec.business,
    protected: spec.protected,
    accounts,
    transactions,
    generated: { seed, windowStart: w.start, windowEnd: w.end, generatorVersion: GENERATOR_VERSION },
  }
}

const GROCERS = ["Greenstall Market", "Corner Fare Grocery", "Harvest Lane Foods"] as const
const DINING = ["Little Fern Café", "Noodle Yard", "Saffron Lantern", "Pizza Atelier"] as const
const SHOPS = ["Marlowe & Finch Department Store", "Pinecone Home", "Wrenfield Pharmacy", "Cedar Books"] as const
const FUEL = ["Trailhead Fuel", "Wheatline Gas Bar"] as const

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------

const priya: ApplicantSpec = {
  slug: "priya",
  kind: "personal",
  displayName: "Priya",
  story: "Salaried nurse with stable payroll, modest savings and one car loan.",
  province: "ON",
  request: { product: "personal_loan", amountCents: dollars(15_000), termMonths: 36, purpose: "Kitchen renovation" },
  creditFile: { historyMonths: 112, bureauBand: "good", foreignReport: { available: false } },
  relationship: { institutionId: "northgate", memberSince: "2019-05-14", productsHeld: ["chequing", "savings", "tfsa"] },
  business: null,
  protected: {
    fullName: "Priya Raman-Clarke",
    dateOfBirth: "1991-08-23",
    gender: "female",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "N0X 9Z1",
  },
  accounts: [
    { key: "chq", accountType: "CHECKING", provider: "northgate", nickname: "Everyday chequing", openedDate: "2019-05-14", opening: 2_400 },
    { key: "sav", accountType: "SAVINGS", provider: "northgate", nickname: "Savings", openedDate: "2019-05-14", opening: 6_800 },
  ],
  build(b, acc, w) {
    biweeklyPayroll(b, acc.chq, w, { firstPayday: "2025-10-03", net: 2_480, sd: 70, employer: "Halcyon General Hospital" })
    monthly(b, acc.chq, w, { day: 1, amount: 1_650, category: "RENT_MORTGAGE", description: "Rent", channel: "PAD", merchant: "Bramblegate Property Management" })
    monthly(b, acc.chq, w, { day: 15, amount: 412.37, category: "LOAN_PAYMENT", description: "Car loan payment", channel: "PAD", merchant: "Carriway Auto Finance" })
    monthly(b, acc.chq, w, { day: 8, amount: 85, category: "UTILITIES", description: "Mobile phone", channel: "PAD", merchant: "Ringwave Mobile" })
    monthly(b, acc.chq, w, { day: 12, amount: 72, category: "UTILITIES", description: "Home internet", channel: "PAD", merchant: "Ringwave Home" })
    monthly(b, acc.chq, w, { day: 20, amount: 95, sd: 18, category: "UTILITIES", description: "Hydro", channel: "PAD", merchant: "Local Hydro Utility" })
    monthly(b, acc.chq, w, { day: 3, amount: 27.99, category: "SUBSCRIPTIONS", description: "Streaming bundle", channel: "CARD", merchant: "Streamhouse" })
    monthly(b, acc.chq, w, { day: 24, amount: 360, sd: 70, category: "CARD_PAYMENT", description: "Credit card payment, paid in full", channel: "EFT", merchant: "Card account (other)" })
    monthly(b, acc.chq, w, { day: 22, amount: 138, category: "INSURANCE", description: "Auto insurance", channel: "PAD", merchant: "Hearthguard Insurance" })
    everyday(b, acc.chq, w, { perWeek: 2, avg: 78, sd: 22, category: "GROCERIES", merchants: GROCERS })
    everyday(b, acc.chq, w, { perWeek: 1, avg: 58, sd: 10, category: "FUEL", merchants: FUEL })
    everyday(b, acc.chq, w, { perWeek: 1, avg: 34, sd: 12, category: "DINING", merchants: DINING })
    everyday(b, acc.chq, w, { perWeek: 0.7, avg: 62, sd: 30, category: "SHOPPING", merchants: SHOPS })
    for (const m of ["2025-10-27", "2025-11-27", "2025-12-29", "2026-01-27", "2026-02-27", "2026-03-27", "2026-04-27", "2026-05-27", "2026-06-29", "2026-07-27", "2026-08-27", "2026-09-28"]) {
      b.transfer(acc.chq, acc.sav, m, dollars(300), "Transfer to savings")
    }
  },
}

const amara: ApplicantSpec = {
  slug: "amara",
  kind: "personal",
  displayName: "Amara",
  story: "Drives rideshare and delivers food. Many small deposits, almost every day.",
  province: "AB",
  request: { product: "credit_card", amountCents: dollars(3_000), purpose: "Fuel and vehicle costs between payouts" },
  creditFile: { historyMonths: 46, bureauBand: "fair", foreignReport: { available: false } },
  relationship: null,
  business: null,
  protected: {
    fullName: "Amara Okafor-Lind",
    dateOfBirth: "1996-02-11",
    gender: "female",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "T0X 4Q2",
  },
  accounts: [{ key: "chq", accountType: "CHECKING", provider: "other", nickname: "Chequing", openedDate: "2017-09-01", opening: 900 }],
  build(b, acc, w) {
    gigPayouts(b, acc.chq, w, {
      activeDayChance: 0.86,
      platforms: [
        { name: "Rideline", chance: 0.72, avg: 112, sd: 38 },
        { name: "SwiftEats", chance: 0.8, avg: 74, sd: 26 },
      ],
      seasonality: { 1: 0.82, 2: 0.86, 12: 1.15, 7: 1.08, 8: 1.08 },
    })
    monthly(b, acc.chq, w, { day: 1, amount: 1_250, category: "RENT_MORTGAGE", description: "Rent", channel: "ETRANSFER", merchant: "Landlord" })
    monthly(b, acc.chq, w, { day: 10, amount: 214, category: "INSURANCE", description: "Auto insurance (commercial use)", channel: "PAD", merchant: "Hearthguard Insurance" })
    monthly(b, acc.chq, w, { day: 6, amount: 75, category: "UTILITIES", description: "Mobile phone", channel: "PAD", merchant: "Ringwave Mobile" })
    monthly(b, acc.chq, w, { day: 18, amount: 120, sd: 35, category: "UTILITIES", description: "Utilities", channel: "PAD", merchant: "Local Utility" })
    monthly(b, acc.chq, w, { day: 25, amount: 160, sd: 40, category: "CARD_PAYMENT", description: "Store card payment", channel: "EFT", merchant: "Store card (other)" })
    everyday(b, acc.chq, w, { perWeek: 2.2, avg: 52, sd: 14, category: "FUEL", merchants: FUEL })
    everyday(b, acc.chq, w, { perWeek: 2, avg: 58, sd: 18, category: "GROCERIES", merchants: GROCERS })
    everyday(b, acc.chq, w, { perWeek: 1.5, avg: 16, sd: 6, category: "DINING", merchants: DINING })
    everyday(b, acc.chq, w, { perWeek: 0.5, avg: 55, sd: 25, category: "SHOPPING", merchants: SHOPS })
    for (const d of ["2025-12-04", "2026-03-11", "2026-06-17", "2026-09-09"]) {
      b.debit(acc.chq, d, dollars(b.rng.normal(260, 60)), "TRANSPORT", "Vehicle maintenance", "CARD", { merchant: "Gearwell Auto Service" })
    }
  },
}

const daniel: ApplicantSpec = {
  slug: "daniel",
  kind: "personal",
  displayName: "Daniel",
  story: "Arrived in Canada seven months ago. Steady payroll, but a thin Canadian credit file.",
  province: "MB",
  window: { start: "2026-03-01", end: WINDOW.end },
  request: { product: "starter_credit", amountCents: dollars(2_000), purpose: "Build Canadian credit history" },
  // Arrived from a country outside current foreign credit report programs.
  creditFile: { historyMonths: 6, bureauBand: "thin", foreignReport: { available: false } },
  relationship: { institutionId: "northgate", memberSince: "2026-02-20", productsHeld: ["chequing", "savings"] },
  business: null,
  protected: {
    fullName: "Daniel Restrepo Vargas",
    dateOfBirth: "1993-11-02",
    gender: "male",
    nationality: "Colombia",
    immigrationStatus: "permanent_resident",
    postalCode: "R0X 2L7",
  },
  accounts: [
    { key: "chq", accountType: "CHECKING", provider: "northgate", nickname: "Newcomer chequing", openedDate: "2026-02-20", opening: 3_400 },
    { key: "sav", accountType: "SAVINGS", provider: "northgate", nickname: "Savings", openedDate: "2026-02-20", opening: 1_000 },
  ],
  build(b, acc, w) {
    biweeklyPayroll(b, acc.chq, w, { firstPayday: "2026-03-13", net: 1_960, sd: 45, employer: "Brindlewood Freight Services" })
    monthly(b, acc.chq, w, { day: 1, amount: 1_100, category: "RENT_MORTGAGE", description: "Rent", channel: "ETRANSFER", merchant: "Landlord" })
    monthly(b, acc.chq, w, { day: 2, amount: 105, category: "TRANSPORT", description: "Monthly transit pass", channel: "CARD", merchant: "City Transit" })
    monthly(b, acc.chq, w, { day: 9, amount: 55, category: "UTILITIES", description: "Mobile phone", channel: "PAD", merchant: "Ringwave Mobile" })
    monthly(b, acc.chq, w, { day: 16, amount: 48, category: "UTILITIES", description: "Home internet", channel: "PAD", merchant: "Ringwave Home" })
    everyday(b, acc.chq, w, { perWeek: 2, avg: 48, sd: 14, category: "GROCERIES", merchants: GROCERS })
    everyday(b, acc.chq, w, { perWeek: 0.6, avg: 22, sd: 8, category: "DINING", merchants: DINING })
    everyday(b, acc.chq, w, { perWeek: 1, avg: 70, sd: 35, category: "SHOPPING", merchants: SHOPS })
    monthly(b, acc.chq, w, { day: 11, amount: 24, category: "INSURANCE", description: "Tenant insurance", channel: "PAD", merchant: "Hearthguard Insurance" })
    monthly(b, acc.chq, w, { day: 14, amount: 80, sd: 20, category: "UTILITIES", description: "Hydro", channel: "PAD", merchant: "Local Hydro Utility" })
    // Setting up a first apartment.
    for (const [d, amount] of [["2026-03-04", 640], ["2026-03-07", 410], ["2026-03-21", 285], ["2026-04-11", 360]] as const) {
      b.debit(acc.chq, d, dollars(amount), "SHOPPING", "Furniture and household setup", "CARD", { merchant: "Pinecone Home" })
    }
    for (const d of ["2026-03-30", "2026-04-27", "2026-05-25", "2026-06-29", "2026-07-27", "2026-08-31", "2026-09-28"]) {
      b.transfer(acc.chq, acc.sav, d, dollars(250), "Transfer to savings")
    }
  },
}

const sofia: ApplicantSpec = {
  slug: "sofia",
  kind: "personal",
  displayName: "Sofia",
  story: "Three bounced payments in the last 90 days and card balances that keep climbing.",
  province: "BC",
  request: { product: "personal_loan", amountCents: dollars(12_000), termMonths: 48, purpose: "Consolidate credit card debt" },
  creditFile: { historyMonths: 88, bureauBand: "fair", foreignReport: { available: false } },
  relationship: null,
  business: null,
  protected: {
    fullName: "Sofia Marchetti",
    dateOfBirth: "1988-04-30",
    gender: "female",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "V0X 3H8",
  },
  balanceFloor: -400,
  accounts: [
    { key: "chq", accountType: "CHECKING", provider: "other", nickname: "Chequing", openedDate: "2012-06-01", opening: 350 },
    { key: "visa", accountType: "CREDIT_CARD", provider: "other", nickname: "Rewards card", openedDate: "2015-03-01", opening: 5_200, creditLimitCents: dollars(8_000) },
    { key: "store", accountType: "CREDIT_CARD", provider: "other", nickname: "Store card", openedDate: "2019-10-01", opening: 1_800, creditLimitCents: dollars(3_000) },
  ],
  build(b, acc, w) {
    biweeklyPayroll(b, acc.chq, w, { firstPayday: "2025-10-10", net: 1_850, sd: 40, employer: "Harbourline Retail Group" })
    monthly(b, acc.chq, w, { day: 1, amount: 1_700, category: "RENT_MORTGAGE", description: "Rent", channel: "PAD", merchant: "Seawall Rentals" })
    monthly(b, acc.chq, w, { day: 7, amount: 90, category: "UTILITIES", description: "Mobile phone", channel: "PAD", merchant: "Ringwave Mobile" })
    monthly(b, acc.chq, w, { day: 19, amount: 85, sd: 15, category: "UTILITIES", description: "Utilities", channel: "PAD", merchant: "Local Utility" })
    everyday(b, acc.chq, w, { perWeek: 1.5, avg: 46, sd: 15, category: "GROCERIES", merchants: GROCERS })
    everyday(b, acc.chq, w, { perWeek: 1, avg: 40, sd: 10, category: "TRANSPORT", merchants: ["City Transit", "Rideline"] })

    // Car loan (15th) and an existing personal loan (22nd), from other lenders.
    // Four payments bounce NSF: one in Feb 2026, before the $10 NSF fee cap
    // took effect on 2026-03-12 (FCAC), and three in the last 90 days at the
    // capped $10 fee. Each is re-presented and paid a week later.
    const loans = [
      { day: 15, amount: 380.15, label: "Car loan payment", merchant: "Carriway Auto Finance", bounced: { "2026-02-16": 48, "2026-07-15": 10, "2026-09-15": 10 } },
      { day: 22, amount: 290.4, label: "Loan payment", merchant: "Steplight Lending", bounced: { "2026-08-24": 10 } },
    ]
    for (const loan of loans) {
      const bouncedMonths = Object.keys(loan.bounced).map(monthOf)
      monthly(b, acc.chq, w, {
        day: loan.day,
        amount: loan.amount,
        category: "LOAN_PAYMENT",
        description: loan.label,
        channel: "PAD",
        merchant: loan.merchant,
        months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => !bouncedMonths.includes(m)),
      })
      for (const [date, fee] of Object.entries(loan.bounced)) {
        b.returnedDebit(acc.chq, date, dollars(loan.amount), "LOAN_PAYMENT", loan.label, { reasonCode: "901", nsfFeeCents: dollars(fee), merchant: loan.merchant })
        b.debit(acc.chq, addDays(date, 7), dollars(loan.amount), "LOAN_PAYMENT", `${loan.label} (re-presented)`, "PAD", { merchant: loan.merchant })
      }
    }

    // Card balances climb: purchases outpace payments every month.
    everyday(b, acc.visa, w, { perWeek: 2, avg: 40, sd: 16, category: "SHOPPING", merchants: SHOPS })
    everyday(b, acc.visa, w, { perWeek: 1, avg: 30, sd: 10, category: "DINING", merchants: DINING })
    everyday(b, acc.store, w, { perWeek: 0.8, avg: 36, sd: 14, category: "SHOPPING", merchants: ["Marlowe & Finch Department Store"] })
    for (const [card, amount] of [["visa", 365], ["store", 60]] as const) {
      monthly(b, acc.chq, w, { day: 26, amount, sd: 15, category: "CARD_PAYMENT", description: `Credit card payment (${card === "visa" ? "rewards card" : "store card"})`, channel: "EFT" })
      monthly(b, acc[card], w, { day: 26, amount, category: "CARD_PAYMENT", description: "Payment received, thank you", channel: "EFT", memo: "CREDIT" })
    }
  },
}

// ---------------------------------------------------------------------------
// Business
// ---------------------------------------------------------------------------

const hollis: ApplicantSpec = {
  slug: "hollis-family-farm",
  kind: "business",
  displayName: "Hollis Family Farm",
  story: "Grain farm. Most income arrives at harvest, input costs land in spring, and the months between are quiet.",
  province: "SK",
  request: { product: "seasonal_operating_line", amountCents: dollars(60_000), purpose: "Spring seed, fertilizer and fuel, repaid after harvest" },
  creditFile: { historyMonths: 286, bureauBand: "good", foreignReport: { available: false } },
  relationship: { institutionId: "northgate", memberSince: "2004-03-01", productsHeld: ["business_account", "savings", "chequing", "term_deposit"] },
  business: { legalName: "Hollis Family Farm", registrationNo: "SK-PTN-104882", structure: "partnership", industry: "Grain and oilseed farming", yearsOperating: 31, employees: 2 },
  protected: {
    fullName: "Margaret Hollis",
    dateOfBirth: "1968-06-19",
    gender: "female",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "S0X 1P4",
  },
  balanceFloor: 2_000,
  accounts: [{ key: "op", accountType: "BUSINESS_CHECKING", provider: "northgate", nickname: "Farm operating account", openedDate: "2004-03-01", opening: 25_000 }],
  build(b, acc, w) {
    // Harvest (Sep–Nov) brings about 65% of the year's grain sales.
    seasonalRevenue(b, acc.op, w, {
      annual: 420_000,
      weights: { 9: 0.22, 10: 0.26, 11: 0.17, 12: 0.04, 1: 0.05, 2: 0.03, 3: 0.03, 4: 0.03, 5: 0.03, 6: 0.03, 7: 0.04, 8: 0.07 },
      depositsPerMonth: [2, 4],
      description: "Grain sale settlement",
      merchant: "Coulee Ridge Grain Terminal",
      channel: "EFT",
      jitter: 0.35,
    })
    // Spring inputs: seed, fertilizer, crop protection.
    const inputs: Record<number, number> = { 3: 40_000, 4: 60_000, 5: 45_000, 6: 17_000, 7: 8_000 }
    for (const [month, amount] of Object.entries(inputs)) {
      monthly(b, acc.op, w, { day: 10, amount: amount * 0.6, category: "SUPPLIES_INVENTORY", description: "Seed and fertilizer", channel: "EFT", merchant: "Plainsview Ag Supply", months: [Number(month)] })
      monthly(b, acc.op, w, { day: 24, amount: amount * 0.4, category: "SUPPLIES_INVENTORY", description: "Crop protection products", channel: "EFT", merchant: "Plainsview Ag Supply", months: [Number(month)] })
    }
    const fuel = (m: number) => ([4, 5].includes(m) ? 6_000 : [9, 10].includes(m) ? 7_000 : 2_000)
    for (let m = 1; m <= 12; m++) {
      monthly(b, acc.op, w, { day: 14, amount: fuel(m), sd: fuel(m) * 0.1, category: "FUEL", description: "Farm fuel delivery", channel: "PAD", merchant: "Wheatline Bulk Fuel", months: [m] })
    }
    monthly(b, acc.op, w, { day: 5, amount: 3_800, category: "LOAN_PAYMENT", description: "Equipment loan payment", channel: "PAD", merchant: "Fieldline Equipment Credit" })
    monthly(b, acc.op, w, { day: 15, amount: 28_000, category: "RENT_COMMERCIAL", description: "Annual land rent", channel: "EFT", merchant: "Land rent (landowner)", months: [11] })
    monthly(b, acc.op, w, { day: 20, amount: 9_000, category: "INSURANCE", description: "Crop insurance premium", channel: "PAD", merchant: "Grainshield Crop Insurance", months: [4] })
    monthly(b, acc.op, w, { day: 18, amount: 650, sd: 90, category: "UTILITIES", description: "Power and propane", channel: "PAD", merchant: "Rural Power Co-op" })
    monthly(b, acc.op, w, { day: 28, amount: 5_500, sd: 300, category: "PAYROLL_EXPENSE", description: "Seasonal farm wages", channel: "EFT", months: [8, 9, 10] })
    monthly(b, acc.op, w, { day: 1, amount: 4_000, category: "TRANSFER_OUT", description: "Owner draw to household", channel: "INTERNAL" })
    for (const d of ["2026-04-08", "2026-08-19", "2025-10-22"]) {
      b.debit(acc.op, d, dollars(b.rng.normal(1_800, 400)), "EQUIPMENT", "Equipment repairs and parts", "CARD", { merchant: "Fieldline Equipment Parts" })
    }
  },
}

const northline: ApplicantSpec = {
  slug: "northline-auto-repair",
  kind: "business",
  displayName: "Northline Auto Repair",
  story: "Independent garage. Steady weekly card deposits and revenue that has grown all year.",
  province: "ON",
  request: { product: "business_term_loan", amountCents: dollars(80_000), termMonths: 60, purpose: "Add a second service bay and hoist" },
  creditFile: { historyMonths: 164, bureauBand: "good", foreignReport: { available: false } },
  relationship: { institutionId: "northgate", memberSince: "2018-01-15", productsHeld: ["business_account", "chequing"] },
  business: { legalName: "Northline Auto Repair Ltd.", registrationNo: "ON-CORP-2219034", structure: "corporation", industry: "Automotive repair", yearsOperating: 9, employees: 4 },
  protected: {
    fullName: "Tomasz Kowal",
    dateOfBirth: "1979-12-03",
    gender: "male",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "L0X 6B3",
  },
  balanceFloor: 3_000,
  accounts: [{ key: "op", accountType: "BUSINESS_CHECKING", provider: "northgate", nickname: "Operating account", openedDate: "2018-01-15", opening: 18_000 }],
  build(b, acc, w) {
    cardSettlements(b, acc.op, w, { cadence: "weekly", weekday: 1, perPeriod: 11_000, sd: 900, processor: "Tallybrook Merchant Services", monthlyGrowth: 0.018 })
    monthly(b, acc.op, w, { day: 12, amount: 3_100, sd: 600, category: "BUSINESS_REVENUE", description: "Fleet customer invoice payment", channel: "EFT", merchant: "Fleet accounts" })
    weekly(b, acc.op, w, { weekday: 3, amount: 3_800, sd: 450, category: "SUPPLIES_INVENTORY", description: "Parts supplier", channel: "PAD", merchant: "Gearloft Parts Distribution" })
    biweekly(b, acc.op, w, { first: "2025-10-09", amount: 9_200, sd: 150, category: "PAYROLL_EXPENSE", description: "Payroll run", channel: "EFT" })
    monthly(b, acc.op, w, { day: 1, amount: 4_200, category: "RENT_COMMERCIAL", description: "Shop lease", channel: "PAD", merchant: "Foundry Row Properties" })
    monthly(b, acc.op, w, { day: 17, amount: 900, sd: 120, category: "UTILITIES", description: "Utilities", channel: "PAD", merchant: "Local Utility" })
    monthly(b, acc.op, w, { day: 21, amount: 650, category: "INSURANCE", description: "Garage liability insurance", channel: "PAD", merchant: "Hearthguard Insurance" })
    monthly(b, acc.op, w, { day: 8, amount: 850, category: "LOAN_PAYMENT", description: "Diagnostic equipment lease", channel: "PAD", merchant: "Fieldline Equipment Credit" })
    monthly(b, acc.op, w, { day: 3, amount: 185, category: "SUBSCRIPTIONS", description: "Shop management software", channel: "CARD", merchant: "Bayboard Software" })
    monthly(b, acc.op, w, { day: 28, amount: 6_500, sd: 600, category: "TAXES", description: "HST remittance", channel: "EFT", merchant: "Tax remittance", months: [1, 4, 7, 10] })
  },
}

const brightSmile: ApplicantSpec = {
  slug: "bright-smile-dental",
  kind: "business",
  displayName: "Bright Smile Dental",
  story: "Busy dental practice with high, stable revenue, financing a large equipment upgrade.",
  province: "AB",
  request: { product: "equipment_financing", amountCents: dollars(350_000), termMonths: 84, purpose: "3D imaging system and four operatory chairs" },
  creditFile: { historyMonths: 230, bureauBand: "excellent", foreignReport: { available: false } },
  relationship: { institutionId: "northgate", memberSince: "2014-09-02", productsHeld: ["business_account", "savings", "term_deposit", "chequing"] },
  business: { legalName: "Bright Smile Dental Professional Corporation", registrationNo: "AB-PC-5530718", structure: "corporation", industry: "Dental practice", yearsOperating: 12, employees: 9 },
  protected: {
    fullName: "Dr. Helena Achterberg",
    dateOfBirth: "1977-03-08",
    gender: "female",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "T0X 8M5",
  },
  balanceFloor: 20_000,
  accounts: [{ key: "op", accountType: "BUSINESS_CHECKING", provider: "northgate", nickname: "Practice operating account", openedDate: "2014-09-02", opening: 85_000 }],
  build(b, acc, w) {
    cardSettlements(b, acc.op, w, { cadence: "daily", openDays: [1, 2, 3, 4, 5], perPeriod: 5_500, sd: 900, processor: "Tallybrook Merchant Services", seasonality: { 12: 0.85, 7: 0.9, 8: 0.9 } })
    // Insurer claim payments arrive a few times a week.
    for (const d of eachDay(w.start, w.end).filter((d) => !isWeekend(d))) {
      if (b.rng.chance(0.48)) b.credit(acc.op, d, dollars(b.rng.normal(4_500, 900)), "BUSINESS_REVENUE", "Dental benefits claims payment", "EFT", { merchant: "Benefits claims clearing" })
    }
    biweekly(b, acc.op, w, { first: "2025-10-03", amount: 38_000, sd: 400, category: "PAYROLL_EXPENSE", description: "Payroll run", channel: "EFT" })
    monthly(b, acc.op, w, { day: 1, amount: 12_500, category: "RENT_COMMERCIAL", description: "Clinic lease", channel: "PAD", merchant: "Larkspur Medical Commons" })
    monthly(b, acc.op, w, { day: 10, amount: 14_000, sd: 1_500, category: "SUPPLIES_INVENTORY", description: "Dental lab fees", channel: "EFT", merchant: "Quillfield Dental Lab" })
    monthly(b, acc.op, w, { day: 18, amount: 9_000, sd: 1_200, category: "SUPPLIES_INVENTORY", description: "Clinical supplies", channel: "PAD", merchant: "Ashgrove Clinical Supply" })
    monthly(b, acc.op, w, { day: 6, amount: 4_200, category: "LOAN_PAYMENT", description: "Existing equipment loan", channel: "PAD", merchant: "Fieldline Equipment Credit" })
    monthly(b, acc.op, w, { day: 20, amount: 1_500, sd: 200, category: "UTILITIES", description: "Utilities", channel: "PAD", merchant: "Local Utility" })
    monthly(b, acc.op, w, { day: 22, amount: 1_800, category: "INSURANCE", description: "Professional liability insurance", channel: "PAD", merchant: "Hearthguard Insurance" })
    monthly(b, acc.op, w, { day: 4, amount: 920, category: "SUBSCRIPTIONS", description: "Practice management software", channel: "CARD", merchant: "Chairside Cloud" })
    monthly(b, acc.op, w, { day: 28, amount: 12_000, category: "TRANSFER_OUT", description: "Owner compensation", channel: "EFT" })
  },
}

const cornerGrind: ApplicantSpec = {
  slug: "corner-grind-cafe",
  kind: "business",
  displayName: "Corner Grind Café",
  story: "Neighbourhood café with thin margins and two recent bounced supplier payments.",
  province: "NS",
  request: { product: "business_line_of_credit", amountCents: dollars(25_000), purpose: "Cover slow months and espresso machine repairs" },
  creditFile: { historyMonths: 74, bureauBand: "fair", foreignReport: { available: false } },
  relationship: null,
  business: { legalName: "Corner Grind Café Inc.", registrationNo: "NS-INC-3307741", structure: "corporation", industry: "Café and bakery", yearsOperating: 3, employees: 6 },
  protected: {
    fullName: "Jules Thibodeau",
    dateOfBirth: "1990-09-14",
    gender: "non_binary",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "B0X 5K9",
  },
  balanceFloor: -1_500,
  accounts: [{ key: "op", accountType: "BUSINESS_CHECKING", provider: "other", nickname: "Business chequing", openedDate: "2023-04-03", opening: 2_200 }],
  build(b, acc, w) {
    cardSettlements(b, acc.op, w, {
      cadence: "daily",
      openDays: [0, 1, 2, 3, 4, 5, 6],
      perPeriod: 1_060,
      sd: 190,
      processor: "Tallybrook Merchant Services",
      seasonality: { 1: 0.85, 2: 0.88, 12: 1.12, 7: 1.05, 8: 1.05 },
    })
    cashDeposits(b, acc.op, w, { avg: 640, sd: 120, openDays: [1], max: 1_200 })
    const returnedSupplierDebits = ["2026-05-12", "2026-08-04", "2026-09-15"]
    weekly(b, acc.op, w, { weekday: 2, amount: 2_850, sd: 260, category: "SUPPLIES_INVENTORY", description: "Coffee and food supplier", channel: "PAD", merchant: "Saltmarsh Food Supply", skip: returnedSupplierDebits })
    biweekly(b, acc.op, w, { first: "2025-10-10", amount: 5_650, sd: 220, category: "PAYROLL_EXPENSE", description: "Payroll run", channel: "EFT" })
    monthly(b, acc.op, w, { day: 1, amount: 4_800, category: "RENT_COMMERCIAL", description: "Café lease", channel: "PAD", merchant: "Harbour Street Holdings" })
    monthly(b, acc.op, w, { day: 16, amount: 1_100, sd: 140, category: "UTILITIES", description: "Power and water", channel: "PAD", merchant: "Local Utility" })
    monthly(b, acc.op, w, { day: 9, amount: 620, category: "LOAN_PAYMENT", description: "Espresso equipment lease", channel: "PAD", merchant: "Brewline Equipment Leasing" })
    monthly(b, acc.op, w, { day: 3, amount: 249, category: "SUBSCRIPTIONS", description: "Point-of-sale software", channel: "CARD", merchant: "Tillpoint POS" })
    monthly(b, acc.op, w, { day: 21, amount: 320, category: "INSURANCE", description: "Business insurance", channel: "PAD", merchant: "Hearthguard Insurance" })
    monthly(b, acc.op, w, { day: 27, amount: 1_800, category: "TRANSFER_OUT", description: "Owner draw", channel: "EFT" })
    // Supplier debits returned NSF: one in May, two in the last 90 days.
    // Business account, so the personal-account NSF fee cap does not apply.
    for (const d of returnedSupplierDebits) {
      b.returnedDebit(acc.op, d, dollars(2_860), "SUPPLIES_INVENTORY", "Coffee and food supplier", { reasonCode: "901", nsfFeeCents: dollars(45), merchant: "Saltmarsh Food Supply" })
    }
  },
}

const lakeside: ApplicantSpec = {
  slug: "lakeside-lodge",
  kind: "business",
  displayName: "Lakeside Lodge",
  story: "Summer lodge. Revenue peaks June to August; winters are quiet.",
  province: "BC",
  request: { product: "seasonal_operating_line", amountCents: dollars(90_000), purpose: "Pre-season staffing, repairs and inventory" },
  creditFile: { historyMonths: 198, bureauBand: "good", foreignReport: { available: false } },
  relationship: { institutionId: "northgate", memberSince: "2011-05-01", productsHeld: ["business_account", "term_deposit", "savings"] },
  business: { legalName: "Lakeside Lodge Ltd.", registrationNo: "BC-BC-0937215", structure: "corporation", industry: "Seasonal accommodation", yearsOperating: 15, employees: 5 },
  protected: {
    fullName: "Owen Ferreira",
    dateOfBirth: "1972-01-27",
    gender: "male",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "V0X 2W6",
  },
  balanceFloor: 3_000,
  accounts: [{ key: "op", accountType: "BUSINESS_CHECKING", provider: "northgate", nickname: "Lodge operating account", openedDate: "2011-05-01", opening: 30_000 }],
  build(b, acc, w) {
    // Jun–Aug bring about 65% of annual revenue.
    const weights: Record<number, number> = { 6: 0.2, 7: 0.25, 8: 0.2, 9: 0.08, 5: 0.07, 10: 0.03, 11: 0.02, 12: 0.04, 1: 0.03, 2: 0.04, 3: 0.02, 4: 0.02 }
    const annual = 520_000
    // 65% through daily card settlements, 35% through weekly booking platform payouts.
    for (const m of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const cardMonthly = annual * weights[m] * 0.65
      cardSettlements(b, acc.op, monthWindow(w, m), { cadence: "daily", openDays: [0, 1, 2, 3, 4, 5, 6], perPeriod: cardMonthly / 30.4, sd: (cardMonthly / 30.4) * 0.25, processor: "Tallybrook Merchant Services" })
    }
    seasonalRevenue(b, acc.op, w, { annual: annual * 0.35, weights, depositsPerMonth: [4, 5], description: "Booking platform payout", merchant: "Roomlark Bookings", channel: "EFT", jitter: 0.25 })
    monthly(b, acc.op, w, { day: 1, amount: 6_500, category: "LOAN_PAYMENT", description: "Property mortgage", channel: "PAD", merchant: "Northgate Credit Union mortgage" })
    const wages = (date: string) => ([6, 7, 8].includes(monthOf(date)) ? 18_000 : [5, 9].includes(monthOf(date)) ? 8_000 : 3_000)
    biweekly(b, acc.op, w, { first: "2025-10-10", amount: wages, sd: 300, category: "PAYROLL_EXPENSE", description: "Payroll run", channel: "EFT" })
    monthly(b, acc.op, w, { day: 18, amount: 2_200, sd: 300, category: "UTILITIES", description: "Power and propane", channel: "PAD", merchant: "Local Utility", months: [4, 5, 6, 7, 8, 9, 10] })
    monthly(b, acc.op, w, { day: 18, amount: 3_000, sd: 300, category: "UTILITIES", description: "Power and propane", channel: "PAD", merchant: "Local Utility", months: [11, 12, 1, 2, 3] })
    for (let m = 1; m <= 12; m++) {
      const supplies = annual * weights[m] * 0.18
      monthly(b, acc.op, w, { day: 12, amount: supplies, sd: supplies * 0.08, category: "SUPPLIES_INVENTORY", description: "Food, beverage and housekeeping supplies", channel: "EFT", merchant: "Lodgecraft Hospitality Supply", months: [m] })
    }
    monthly(b, acc.op, w, { day: 2, amount: 14_000, category: "TAXES", description: "Property tax", channel: "EFT", merchant: "Regional district", months: [7] })
    monthly(b, acc.op, w, { day: 15, amount: 11_000, category: "INSURANCE", description: "Annual property insurance", channel: "PAD", merchant: "Hearthguard Insurance", months: [4] })
    monthly(b, acc.op, w, { day: 20, amount: 7_500, sd: 1_000, category: "EQUIPMENT", description: "Pre-season repairs and maintenance", channel: "EFT", merchant: "Spruce Hollow Contracting", months: [4, 5] })
    monthly(b, acc.op, w, { day: 27, amount: 4_000, category: "TRANSFER_OUT", description: "Owner draw", channel: "EFT" })
  },
}

/** The $10,000+ cash day: two deposits on the same afternoon. */
export const MAIN_STREET_CASH_DAY = "2026-06-12"

const mainStreet: ApplicantSpec = {
  slug: "main-street-hardware",
  kind: "business",
  displayName: "Main Street Hardware",
  story: "Long-running hardware store that takes a lot of cash. One day's cash deposits topped $10,000.",
  province: "NB",
  request: { product: "business_line_of_credit", amountCents: dollars(40_000), purpose: "Spring inventory build" },
  creditFile: { historyMonths: 310, bureauBand: "good", foreignReport: { available: false } },
  relationship: { institutionId: "northgate", memberSince: "2009-02-10", productsHeld: ["business_account", "savings"] },
  business: { legalName: "Main Street Hardware Ltd.", registrationNo: "NB-CORP-0612280", structure: "corporation", industry: "Hardware retail", yearsOperating: 22, employees: 7 },
  protected: {
    fullName: "Gordon MacAulay",
    dateOfBirth: "1961-07-05",
    gender: "male",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "E0X 7T1",
  },
  balanceFloor: 4_000,
  accounts: [{ key: "op", accountType: "BUSINESS_CHECKING", provider: "northgate", nickname: "Store operating account", openedDate: "2009-02-10", opening: 22_000 }],
  build(b, acc, w) {
    const spring = { 4: 1.25, 5: 1.35, 6: 1.2, 1: 0.8, 2: 0.8 }
    cashDeposits(b, acc.op, w, { avg: 1_000, sd: 220, openDays: [1, 2, 3, 4, 5, 6], skip: [MAIN_STREET_CASH_DAY], max: 1_600 })
    b.credit(acc.op, MAIN_STREET_CASH_DAY, dollars(6_200), "CASH_DEPOSIT", "Branch cash deposit", "CASH", { time: "10:05" })
    b.credit(acc.op, MAIN_STREET_CASH_DAY, dollars(4_300), "CASH_DEPOSIT", "Branch cash deposit", "CASH", { time: "16:40" })
    cardSettlements(b, acc.op, w, { cadence: "daily", openDays: [1, 2, 3, 4, 5, 6], perPeriod: 1_800, sd: 350, processor: "Tallybrook Merchant Services", seasonality: spring })
    weekly(b, acc.op, w, { weekday: 4, amount: (d) => 8_000 * ((spring as Record<number, number>)[monthOf(d)] ?? 1), sd: 900, category: "SUPPLIES_INVENTORY", description: "Hardware wholesaler", channel: "PAD", merchant: "Quayside Hardware Wholesale" })
    biweekly(b, acc.op, w, { first: "2025-10-03", amount: 11_000, sd: 200, category: "PAYROLL_EXPENSE", description: "Payroll run", channel: "EFT" })
    monthly(b, acc.op, w, { day: 1, amount: 5_500, category: "RENT_COMMERCIAL", description: "Store lease", channel: "PAD", merchant: "Main Block Properties" })
    monthly(b, acc.op, w, { day: 15, amount: 1_300, sd: 250, category: "UTILITIES", description: "Utilities", channel: "PAD", merchant: "Local Utility" })
    monthly(b, acc.op, w, { day: 21, amount: 540, category: "INSURANCE", description: "Business insurance", channel: "PAD", merchant: "Hearthguard Insurance" })
    monthly(b, acc.op, w, { day: 28, amount: 5_200, sd: 500, category: "TAXES", description: "HST remittance", channel: "EFT", merchant: "Tax remittance", months: [1, 4, 7, 10] })
    monthly(b, acc.op, w, { day: 27, amount: 3_500, category: "TRANSFER_OUT", description: "Owner draw", channel: "EFT" })
  },
}


// ---------------------------------------------------------------------------
// Additional cast (the brief asks for at least 14)
// ---------------------------------------------------------------------------

const ellen: ApplicantSpec = {
  slug: "ellen",
  kind: "personal",
  displayName: "Ellen",
  story: "Retired. Lives on a workplace pension and government benefits, with a paid-off home and healthy savings.",
  province: "PE",
  request: { product: "line_of_credit", amountCents: dollars(15_000), purpose: "Roof replacement" },
  creditFile: { historyMonths: 480, bureauBand: "excellent", foreignReport: { available: false } },
  relationship: { institutionId: "northgate", memberSince: "1998-04-06", productsHeld: ["chequing", "savings", "tfsa", "term_deposit"] },
  business: null,
  protected: {
    fullName: "Ellen Abernethy-Price",
    dateOfBirth: "1955-02-17",
    gender: "female",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "C0X 4E2",
  },
  accounts: [
    { key: "chq", accountType: "CHECKING", provider: "northgate", nickname: "Chequing", openedDate: "1998-04-06", opening: 4_500 },
    { key: "sav", accountType: "SAVINGS", provider: "northgate", nickname: "Savings", openedDate: "1998-04-06", opening: 42_000 },
  ],
  build(b, acc, w) {
    monthly(b, acc.chq, w, { day: 25, amount: 2_350, category: "PENSION", description: "Employer pension plan payment", channel: "EFT", merchant: "Employer pension plan", memo: "CREDIT" })
    monthly(b, acc.chq, w, { day: 27, amount: 910, category: "GOVERNMENT_BENEFIT", description: "Federal pension benefit", channel: "EFT", merchant: "Federal pension benefit", memo: "CREDIT" })
    monthly(b, acc.chq, w, { day: 27, amount: 735, category: "GOVERNMENT_BENEFIT", description: "Federal old age benefit", channel: "EFT", merchant: "Federal old age benefit", memo: "CREDIT" })
    monthly(b, acc.chq, w, { day: 1, amount: 310, category: "TAXES", description: "Property tax instalment", channel: "PAD", merchant: "Municipal property tax" })
    monthly(b, acc.chq, w, { day: 12, amount: 118, category: "INSURANCE", description: "Home insurance", channel: "PAD", merchant: "Hearthguard Insurance" })
    monthly(b, acc.chq, w, { day: 18, amount: 140, sd: 30, category: "UTILITIES", description: "Hydro", channel: "PAD", merchant: "Local Hydro Utility" })
    monthly(b, acc.chq, w, { day: 9, amount: 380, sd: 40, category: "UTILITIES", description: "Heating oil delivery", channel: "PAD", merchant: "Islandwarm Heating Oil", months: [11, 12, 1, 2, 3] })
    monthly(b, acc.chq, w, { day: 6, amount: 95, category: "UTILITIES", description: "Phone and internet", channel: "PAD", merchant: "Ringwave Home" })
    everyday(b, acc.chq, w, { perWeek: 2, avg: 64, sd: 18, category: "GROCERIES", merchants: GROCERS })
    everyday(b, acc.chq, w, { perWeek: 1, avg: 45, sd: 10, category: "FUEL", merchants: FUEL })
    everyday(b, acc.chq, w, { perWeek: 0.8, avg: 42, sd: 15, category: "SHOPPING", merchants: ["Wrenfield Pharmacy", "Cedar Books"] })
    everyday(b, acc.chq, w, { perWeek: 0.6, avg: 38, sd: 12, category: "DINING", merchants: DINING })
    monthly(b, acc.chq, w, { day: 10, amount: 450, category: "SHOPPING", description: "Holiday gifts", channel: "CARD", merchant: "Marlowe & Finch Department Store", months: [12] })
  },
}

const grace: ApplicantSpec = {
  slug: "grace",
  kind: "personal",
  displayName: "Grace",
  story: "Two payments bounced last winter. None since, and the card balance has come down every month.",
  province: "QC",
  request: { product: "personal_loan", amountCents: dollars(8_000), termMonths: 36, purpose: "Car repairs and moving costs" },
  creditFile: { historyMonths: 70, bureauBand: "fair", foreignReport: { available: false } },
  relationship: null,
  business: null,
  protected: {
    fullName: "Grace Lavallée-Ng",
    dateOfBirth: "1994-06-09",
    gender: "female",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "J0X 1R5",
  },
  balanceFloor: -300,
  accounts: [
    { key: "chq", accountType: "CHECKING", provider: "other", nickname: "Chequing", openedDate: "2014-08-20", opening: 600 },
    { key: "card", accountType: "CREDIT_CARD", provider: "other", nickname: "Rewards card", openedDate: "2017-02-01", opening: 4_200, creditLimitCents: dollars(5_000) },
  ],
  build(b, acc, w) {
    biweeklyPayroll(b, acc.chq, w, { firstPayday: "2025-10-09", net: 2_150, sd: 45, employer: "Lumencrest Logistics" })
    monthly(b, acc.chq, w, { day: 1, amount: 1_350, category: "RENT_MORTGAGE", description: "Rent", channel: "PAD", merchant: "Bramblegate Property Management" })
    monthly(b, acc.chq, w, { day: 7, amount: 70, category: "UTILITIES", description: "Mobile phone", channel: "PAD", merchant: "Ringwave Mobile" })
    monthly(b, acc.chq, w, { day: 19, amount: 75, sd: 15, category: "UTILITIES", description: "Hydro", channel: "PAD", merchant: "Local Hydro Utility" })
    everyday(b, acc.chq, w, { perWeek: 1.8, avg: 52, sd: 15, category: "GROCERIES", merchants: GROCERS })
    everyday(b, acc.chq, w, { perWeek: 1, avg: 42, sd: 10, category: "TRANSPORT", merchants: ["City Transit", "Rideline"] })
    // Car loan on the 15th. Two payments bounced last winter, both before the
    // $10 NSF fee cap took effect on 2026-03-12; none since.
    const bounced: Record<string, number> = { "2025-12-15": 48, "2026-01-15": 48 }
    monthly(b, acc.chq, w, { day: 15, amount: 295.6, category: "LOAN_PAYMENT", description: "Car loan payment", channel: "PAD", merchant: "Carriway Auto Finance", months: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] })
    for (const [date, fee] of Object.entries(bounced)) {
      b.returnedDebit(acc.chq, date, dollars(295.6), "LOAN_PAYMENT", "Car loan payment", { reasonCode: "901", nsfFeeCents: dollars(fee), merchant: "Carriway Auto Finance" })
      b.debit(acc.chq, addDays(date, 7), dollars(295.6), "LOAN_PAYMENT", "Car loan payment (re-presented)", "PAD", { merchant: "Carriway Auto Finance" })
    }
    // Paying the card down: payments well above new purchases.
    everyday(b, acc.card, w, { perWeek: 1, avg: 35, sd: 12, category: "SHOPPING", merchants: SHOPS })
    monthly(b, acc.chq, w, { day: 26, amount: 420, category: "CARD_PAYMENT", description: "Credit card payment", channel: "EFT" })
    monthly(b, acc.card, w, { day: 26, amount: 420, category: "CARD_PAYMENT", description: "Payment received, thank you", channel: "EFT", memo: "CREDIT" })
  },
}

const quillfeather: ApplicantSpec = {
  slug: "quillfeather-plumbing",
  kind: "business",
  displayName: "Quillfeather Plumbing & Heating",
  story: "One-van plumbing business paid by invoice. Some months bring in twice as much as others, with no regular season.",
  province: "NL",
  request: { product: "business_line_of_credit", amountCents: dollars(20_000), purpose: "Buy materials before clients pay" },
  creditFile: { historyMonths: 132, bureauBand: "good", foreignReport: { available: false } },
  relationship: { institutionId: "northgate", memberSince: "2020-03-02", productsHeld: ["business_account", "chequing"] },
  business: { legalName: "Quillfeather Plumbing & Heating", registrationNo: "NL-SP-7720143", structure: "sole_proprietorship", industry: "Plumbing and heating", yearsOperating: 6, employees: 1 },
  protected: {
    fullName: "Callum Pardy",
    dateOfBirth: "1986-10-21",
    gender: "male",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "A0X 3J6",
  },
  balanceFloor: 1_500,
  accounts: [{ key: "op", accountType: "BUSINESS_CHECKING", provider: "northgate", nickname: "Business chequing", openedDate: "2020-03-02", opening: 8_000 }],
  build(b, acc, w) {
    // Client invoices: a handful of payments a month, sizes and monthly totals vary widely.
    for (const m of eachMonth(w.start, w.end)) {
      const busy = b.rng.float(0.45, 1.65)
      const count = b.rng.int(3, 7)
      for (let i = 0; i < count; i++) {
        const d = nextWeekday(dayInMonth(m, b.rng.int(1, 28)))
        const amount = Math.max(350, b.rng.normal(3_100 * busy, 1_200))
        const channel = b.rng.pick(["ETRANSFER", "CHEQUE", "EFT"] as const)
        b.credit(acc.op, d, dollars(amount), "BUSINESS_REVENUE", "Client invoice payment", channel, { merchant: "Client payment" })
      }
    }
    everyday(b, acc.op, w, { perWeek: 1.1, avg: 950, sd: 380, category: "SUPPLIES_INVENTORY", merchants: ["Harbourmark Plumbing Supply"], channel: "CARD" })
    monthly(b, acc.op, w, { day: 11, amount: 640, category: "LOAN_PAYMENT", description: "Service van loan", channel: "PAD", merchant: "Carriway Auto Finance" })
    everyday(b, acc.op, w, { perWeek: 1, avg: 120, sd: 25, category: "FUEL", merchants: FUEL })
    monthly(b, acc.op, w, { day: 21, amount: 280, category: "INSURANCE", description: "Contractor liability insurance", channel: "PAD", merchant: "Hearthguard Insurance" })
    monthly(b, acc.op, w, { day: 6, amount: 90, category: "UTILITIES", description: "Business phone", channel: "PAD", merchant: "Ringwave Mobile" })
    monthly(b, acc.op, w, { day: 28, amount: 7_000, category: "TRANSFER_OUT", description: "Owner draw", channel: "EFT" })
    for (const d of ["2025-11-14", "2026-02-20", "2026-05-15", "2026-08-21"]) {
      b.debit(acc.op, d, dollars(b.rng.normal(1_500, 300)), "PAYROLL_EXPENSE", "Subcontractor payment", "ETRANSFER", { merchant: "Subcontractor" })
    }
    monthly(b, acc.op, w, { day: 28, amount: 2_100, sd: 300, category: "TAXES", description: "HST remittance", channel: "EFT", merchant: "Tax remittance", months: [1, 4, 7, 10] })
  },
}

const petalwick: ApplicantSpec = {
  slug: "petalwick-florals",
  kind: "business",
  displayName: "Petalwick Florals",
  story: "Growing flower shop already carrying an equipment loan, a van loan and a merchant cash advance.",
  province: "MB",
  request: { product: "business_term_loan", amountCents: dollars(60_000), termMonths: 48, purpose: "Fit out a second location" },
  creditFile: { historyMonths: 98, bureauBand: "fair", foreignReport: { available: false } },
  relationship: { institutionId: "northgate", memberSince: "2022-05-16", productsHeld: ["business_account"] },
  business: { legalName: "Petalwick Florals Inc.", registrationNo: "MB-CORP-4418826", structure: "corporation", industry: "Florist", yearsOperating: 4, employees: 3 },
  protected: {
    fullName: "Ines Okonkwo-Hart",
    dateOfBirth: "1984-03-29",
    gender: "female",
    nationality: "Canada",
    immigrationStatus: "citizen",
    postalCode: "R0X 8P3",
  },
  balanceFloor: 1_000,
  accounts: [{ key: "op", accountType: "BUSINESS_CHECKING", provider: "northgate", nickname: "Shop operating account", openedDate: "2022-05-16", opening: 9_000 }],
  build(b, acc, w) {
    cardSettlements(b, acc.op, w, {
      cadence: "daily",
      openDays: [1, 2, 3, 4, 5, 6],
      perPeriod: 1_330,
      sd: 260,
      processor: "Tallybrook Merchant Services",
      monthlyGrowth: 0.02,
      seasonality: { 2: 1.55, 5: 1.4, 12: 1.2, 1: 0.8, 7: 0.85 },
    })
    weekly(b, acc.op, w, { weekday: 1, amount: (d) => 2_650 * ({ 2: 1.5, 5: 1.35, 12: 1.2 } as Record<number, number>)[monthOf(d)] || 2_650, sd: 250, category: "SUPPLIES_INVENTORY", description: "Flower wholesaler", channel: "PAD", merchant: "Bloomgate Wholesale Flowers" })
    biweekly(b, acc.op, w, { first: "2025-10-03", amount: 6_400, sd: 150, category: "PAYROLL_EXPENSE", description: "Payroll run", channel: "EFT" })
    monthly(b, acc.op, w, { day: 1, amount: 3_400, category: "RENT_COMMERCIAL", description: "Shop lease", channel: "PAD", merchant: "Foundry Row Properties" })
    monthly(b, acc.op, w, { day: 16, amount: 650, sd: 90, category: "UTILITIES", description: "Utilities and cooler power", channel: "PAD", merchant: "Local Utility" })
    monthly(b, acc.op, w, { day: 21, amount: 210, category: "INSURANCE", description: "Business insurance", channel: "PAD", merchant: "Hearthguard Insurance" })
    monthly(b, acc.op, w, { day: 27, amount: 3_800, category: "TRANSFER_OUT", description: "Owner draw", channel: "EFT" })
    // Existing debt: walk-in cooler loan, delivery van and a merchant cash advance repaid daily.
    monthly(b, acc.op, w, { day: 5, amount: 1_900, category: "LOAN_PAYMENT", description: "Walk-in cooler loan", channel: "PAD", merchant: "Fieldline Equipment Credit" })
    monthly(b, acc.op, w, { day: 12, amount: 780, category: "LOAN_PAYMENT", description: "Delivery van loan", channel: "PAD", merchant: "Carriway Auto Finance" })
    for (const d of eachDay(w.start, w.end)) {
      if (!isWeekend(d)) b.debit(acc.op, d, dollars(95), "LOAN_PAYMENT", "Merchant cash advance repayment", "PAD", { merchant: "Ledgerleaf Capital" })
    }
  },
}

/** The cast, in display order: the ten required applicants, then four more. */
export const CAST: ApplicantSpec[] = [priya, hollis, amara, daniel, sofia, northline, brightSmile, cornerGrind, lakeside, mainStreet, ellen, grace, quillfeather, petalwick]


export function generateCast(): Applicant[] {
  return CAST.map(buildApplicant)
}

// helpers -------------------------------------------------------------------

/** The part of the window that falls in calendar month `m`. */
function monthWindow(w: Window, m: number): Window {
  const year = m >= Number(w.start.slice(5, 7)) && w.start.slice(0, 4) !== w.end.slice(0, 4) ? w.start.slice(0, 4) : w.end.slice(0, 4)
  const start = `${year}-${String(m).padStart(2, "0")}-01`
  const end = new Date(Date.UTC(Number(year), m, 0)).toISOString().slice(0, 10)
  return { start: start < w.start ? w.start : start, end: end > w.end ? w.end : end }
}
