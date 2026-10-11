import type { IncomeType } from "@/lib/engine/patterns"
import type { ProductType, Structure } from "@/lib/schemas"

/** Plain-language labels shared by every page. */

export const PRODUCT_LABELS: Record<ProductType, string> = {
  personal_loan: "Personal loan",
  line_of_credit: "Line of credit",
  credit_card: "Credit card",
  starter_credit: "Starter credit",
  business_term_loan: "Business term loan",
  business_line_of_credit: "Business line of credit",
  equipment_financing: "Equipment financing",
  seasonal_operating_line: "Seasonal operating line",
}

export const STRUCTURE_LABELS: Record<Structure, string> = {
  term: "Fixed monthly payments",
  revolving: "Revolving: borrow and repay as needed",
  seasonal_operating: "Seasonal: interest-only, repaid after peak season",
  secured_starter: "Starter limit with a path to graduate",
}

export const INCOME_LABELS: Record<IncomeType, string> = {
  salaried: "Salaried",
  pension: "Pension",
  gig: "Gig work",
  seasonal: "Seasonal",
  invoice: "Invoice-based",
  steady_business: "Steady business",
  irregular: "Irregular",
}

export const RECOMMENDATION_LABELS: Record<string, string> = {
  high_interest_savings: "High-interest savings",
  term_deposit: "Term deposit",
  line_of_credit: "Line of credit",
  business_line_of_credit: "Business line of credit",
  seasonal_operating_line: "Seasonal operating line",
  secured_card: "Secured card",
  credit_builder: "Credit builder",
}

export const pctFromBps = (bps: number) => `${(bps / 100).toFixed(2)}%`
