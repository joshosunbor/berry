/*
 * Deposit protection context. Northgate is a fictional, provincially
 * regulated credit union and is deliberately not placed in any province:
 * its coverage would depend on its province. Aspen is a fictional bank
 * (a CDIC member if it were real). Kite is a lender and takes no deposits.
 *
 * Provincial limits are shown only where confirmed on the insurer's
 * official site (checked 2026-10-11); others are Illustrative.
 */

export const DEPOSIT_PROTECTION_AS_OF = "2026-10-11"

export const CDIC = {
  insurer: "Canada Deposit Insurance Corporation (CDIC)",
  limit: "$100,000 per eligible category, per member institution",
  members: "Banks and federally regulated credit unions. Provincially regulated credit unions are not CDIC members.",
  source: "https://www.cdic.ca/your-coverage/whats-covered/",
  membersSource: "https://www.cdic.ca/depositors/list-of-members/",
} as const

export interface ProvincialInsurer {
  province: string
  insurer: string
  limit: string
  registered?: string
  confirmed: boolean
  source: string
  note?: string
}

export const PROVINCIAL_INSURERS: ProvincialInsurer[] = [
  { province: "Alberta", insurer: "Credit Union Deposit Guarantee Corporation", limit: "Unlimited (100% of deposits, including accrued interest)", confirmed: true, source: "https://cudgc.ab.ca/faq/" },
  { province: "British Columbia", insurer: "Credit Union Deposit Insurance Corporation of British Columbia", limit: "Reported as unlimited", confirmed: false, source: "https://www.bcfsa.ca/public-resources/credit-union-deposit-insurance/about-cudic", note: "The official site could not be read; figure from search results only." },
  { province: "Manitoba", insurer: "Deposit Guarantee Corporation of Manitoba", limit: "Unlimited", registered: "Registered deposits included", confirmed: true, source: "https://dgcm.ca/" },
  { province: "New Brunswick", insurer: "New Brunswick Credit Union Deposit Insurance Corporation", limit: "$250,000 per category", registered: "Each registered plan type insured separately to $250,000", confirmed: true, source: "https://nbcudic.ca/deposit-protection" },
  { province: "Newfoundland and Labrador", insurer: "Credit Union Deposit Guarantee Corporation", limit: "$250,000 per type of deposit", registered: "Registered plans form one $250,000 category", confirmed: true, source: "https://www.cudgcnl.com/?p=57" },
  { province: "Nova Scotia", insurer: "Nova Scotia Credit Union Deposit Insurance Corporation", limit: "$250,000 per category", registered: "Each registered contract insured separately to $250,000", confirmed: true, source: "https://www.nscudic.org/coverage/faq/" },
  { province: "Ontario", insurer: "Financial Services Regulatory Authority of Ontario (Deposit Insurance Reserve Fund)", limit: "Reported as $250,000; registered plans unlimited", confirmed: false, source: "https://www.fsrao.ca/consumers/deposit-insurance-and-credit-unions", note: "The official site could not be read; figure from search results only." },
  { province: "Prince Edward Island", insurer: "Credit Union Deposit Insurance Corporation", limit: "$250,000 per member", registered: "Registered plans 100%", confirmed: true, source: "https://www.peicudic.com/coverage.php" },
  { province: "Quebec", insurer: "Autorité des marchés financiers", limit: "Reported as $100,000 per deposit category", confirmed: false, source: "https://lautorite.qc.ca/en/general-public/deposit-insurance", note: "The official site could not be read; figure from search results and a credit union's own page only." },
  { province: "Saskatchewan", insurer: "Credit Union Deposit Guarantee Corporation", limit: "Unlimited", confirmed: true, source: "https://cudgc.sk.ca/the-guarantee/" },
  { province: "Territories", insurer: "No territorial credit union insurer found", limit: "Not applicable", confirmed: false, source: "https://www.canada.ca/en/financial-consumer-agency/services/banking/deposit-insurance.html", note: "Based on dated secondary sources only." },
]

export const LENDER_PROTECTION = {
  credit_union: "Northgate is a provincially regulated credit union; coverage depends on its province. Each province's credit union deposit insurer sets its own limit (see the table).",
  fintech: "Kite is a lender and does not take deposits, so deposit insurance does not apply to it.",
  bank: "Aspen is a bank. If it were real, eligible deposits would be insured by CDIC up to $100,000 per eligible category.",
} as const
