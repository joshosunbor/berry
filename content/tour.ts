/*
 * The guided tour: one applicant, Hollis Family Farm, from application to the
 * back office in six steps. Each step opens a real page, points at one area
 * (an element with data-tour="<target>") and says in one sentence what to
 * notice. Figures in the text are checked against the engine and simulator
 * in tests/tour.test.ts.
 */

export interface TourStep {
  title: string
  href: string
  /** data-tour value of the area to highlight. */
  target: string
  text: string
  /** Simulated date the loan pages should show (servicing clock). */
  clock?: string
  /** Simulated moment the operations pages should show. */
  opsMoment?: string
}

export const TOUR_APPLICANT = "hollis-family-farm"

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Application and consent",
    href: "/borrower/apply?as=hollis-family-farm",
    target: "apply",
    text: "Hollis Family Farm, a grain farm, applies for a seasonal operating line. Before any banking data is read, the consent screen says what is shared, why, for how long and who receives it.",
  },
  {
    title: "Verify",
    href: "/applications/hollis-family-farm?tab=verification",
    target: "tab-verification",
    text: "Identity, sanctions and business-registration checks run on synthetic data. Hollis clears every one automatically, so no reviewer is needed.",
  },
  {
    title: "Three lenders decide",
    href: "/applications/hollis-family-farm?tab=compare",
    target: "tab-compare",
    text: "The same cash flow gets three answers: Aspen declines on irregular income, Kite offers an $8,000 line, and Northgate structures a $60,000 seasonal line repaid after harvest.",
  },
  {
    title: "Fund",
    href: "/loans/loan_hollis-family-farm-cu",
    target: "funding",
    clock: "2026-10-06",
    text: "Northgate opens the line only after its Branch Manager signs off. Nothing is drawn on day one; each draw goes out by AFT file as the season needs it.",
  },
  {
    title: "Collect, and recover a failed payment",
    href: "/loans/loan_hollis-family-farm-kite",
    target: "timeline",
    clock: "2027-10-06",
    text: "This is Hollis's line at Kite, because its Northgate line never misses a payment. In March 2027 a debit comes back NSF; Berry retries after the two-business-day fee window, and the payment is collected.",
  },
  {
    title: "Operations",
    href: "/operations?queue=credit_referral",
    target: "queues",
    opsMoment: "2026-10-01T10:00",
    text: "Back on October 1, Hollis's $60,000 line waits in the sign-off queue with a service-level timer. The Dashboard section shows time to funding, cure rate and cost per loan across the book.",
  },
]
