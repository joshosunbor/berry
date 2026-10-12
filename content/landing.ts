import type { Mode } from "@/lib/modes"

/*
 * Landing page copy (design/design_handoff_berry_landing, v5). Taken
 * verbatim from the design except where the "hybrid concept" brief changes
 * it: Berry is a working portfolio project, not a vendor, so there is no
 * demo booking, pricing, contact form, certification or company name, and
 * the pilot and integration sections say what Berry would do.
 *
 * Copy only. Every figure (decisions, limits, reasons, months, tenure, the
 * chart, the ledger, the queue, funding times) comes from the engine, the
 * seed data and the simulator via lib/landing/data.ts, never from here.
 */

export const LIVE_DEMO = { label: "Try the live demo", href: "/workbench" } as const

export const NAV = [
  { label: "Product", href: "#product" },
  { label: "How a pilot works", href: "#pilot" },
  { label: "Methodology", href: "/methodology" },
  { label: "Live demo", href: "/workbench" },
] as const

export const HERO = {
  eyebrow: "Built for Canadian credit unions and lenders",
  title: "Approve the borrowers ",
  titleAccent: "a credit score misses.",
  lead: "Farmers, gig workers, newcomers and seasonal businesses look risky on a credit score. Berry reads their cash flow, explains every decision in plain language, and runs the loan through funding, collections and reconciliation.",
  note: "The live demo needs no sign-up and runs on sample data.",
} as const

export const COMPARISON = {
  eyebrow: "ONE APPLICANT · THREE RULEBOOKS",
  sparkCaption: "Deposits, last 12 months",
  helper: "Each reason is written twice: once for the borrower, once for the lending team.",
  toggleLabel: "Explanation style",
  views: ["Borrower view", "Lender view"] as const,
  footnote: "Northgate, Kite and Aspen are sample rulebooks. Each lender's policy runs as settings, not code.",
  /** "{n}" is the number of other applicants in the cast. */
  moreLink: "Try {n} more applicants in the demo →",
} as const

/** Display order and per-lender labels for the comparison card (Aspen, Kite, Northgate). */
export const LENDER_ORDER: { mode: Mode; kind: string }[] = [
  { mode: "bank", kind: "Policy-driven" },
  { mode: "fintech", kind: "Automated" },
  { mode: "credit_union", kind: "Relationship" },
]

export const TOOLS = {
  title: "Four tools. One loan record.",
  lead: "Use them together, or start with the one that fixes the biggest bottleneck.",
  cards: [
    { name: "Decide", icon: "Scale", tint: "green", href: "#tour", copy: "Cash-flow underwriting on the lender's policy, with reasons a borrower can read and an approver can sign.", link: "See a decision →" },
    { name: "Fund", icon: "Banknote", tint: "cyan", href: "#loan", copy: "Pay out by AFT file or Interac e-Transfer, after a name-and-account check.", link: "How funding works →" },
    { name: "Collect", icon: "CalendarCheck", tint: "green", href: "#loan", copy: "Pre-authorized debits timed to when money lands, with safe retries when a payment fails.", link: "See a loan ledger →" },
    { name: "Operate", icon: "ListChecks", tint: "cyan", href: "#ops", copy: "Work queues with deadlines, second-person sign-off and an audit trail nobody can edit.", link: "See the console →" },
  ],
} as const

export const LIFECYCLE = {
  title: "One system from application to ledger.",
  lead: "Replace the hand-offs between an origination tool, a payments file and a spreadsheet. Berry takes the loan from consent to the last reconciled payment.",
  defaultStep: 2,
  steps: [
    { name: "Consent", rail: "Open banking", title: "The applicant decides what Berry can see.", body: "Before any data is read, the screen spells out what is shared, why, for how long and who receives it. Consent can be revoked later in one click.", href: "/apply" },
    { name: "Verify", rail: "KYC / KYB", title: "Identity and business checks, with reasons.", body: "ID, name and date of birth, sanctions screening and business registration. Clear cases pass on their own. The rest go to a reviewer with a note on why.", href: "/workbench/hollis-family-farm" },
    { name: "Decide", rail: "Three rulebooks", title: "Three lenders read the same cash flow.", body: "Each lender applies its own rules and explains the result in words a borrower can follow, along with what would change the answer.", href: "/compare/hollis-family-farm" },
    { name: "Fund", rail: "AFT or instant", title: "Money out on the right rail.", body: "Pay out by AFT batch file or Interac e-Transfer, with Real-Time Rail support as it rolls out from Q4 2026. Instant payouts run a name-and-account check first.", href: "/workbench/hollis-family-farm" },
    { name: "Collect", rail: "PAD", title: "Payments that land after the money does.", body: "Pre-authorized debits scheduled around payday, or around harvest, with the Rule H1 agreement items checked off.", href: "/ops/loans" },
    { name: "Recover", rail: "Returns", title: "A missed payment is a conversation.", body: "One retry timed to the next deposit, a plain note to the borrower, then an outreach task. Hardship options go to a lender for approval.", href: "/ops" },
    { name: "Reconcile", rail: "Ledger", title: "Every cent accounted for.", body: "Each collection and return is matched to a double-entry loan ledger. Anything that doesn’t match lands in the reconciliation queue.", href: "/ops/dashboard" },
  ],
  stepOf: "Step {n} of 07",
  seeIt: "See it in Berry →",
  next: "Next: {name}",
  restart: "Back to the start",
} as const

export const TOUR = {
  title: "What a lending team would work in every day.",
  tabs: [
    { label: "Applicant file", path: "berry / workbench / hollis-family-farm", cap: "Cash flow, the decision, its reasons and who needs to sign off, on one screen." },
    { label: "Compare", path: "berry / compare / hollis-family-farm", cap: "Run the same file under three rulebooks and see exactly where they part ways." },
    { label: "Servicing", path: "berry / ops / loans / loan_hollis-family-farm-cu", cap: "Every draw, interest charge and payment on an immutable ledger that always balances." },
  ],
  chartTitle: "Cash flow, last 12 months",
  harvest: "HARVEST",
  legendIn: "In",
  legendOut: "Out",
  compareButton: "Compare all three lenders",
  compareNote: "Shaded rows are where the lenders disagree. The data going in is identical.",
} as const

export const OPS = {
  title: "Nothing waits in an inbox.",
  lead: "Reviews, referrals, missed payments and reconciliation breaks each become a task with an owner and a deadline. The back office sees what's late before a member does.",
  queueTitle: "Work queues",
  makerChecker: { strong: "You prepared this override, so you can't approve it.", rest: " A second person has to sign off. Your attempt is in the audit trail." },
  fundingTitle: "Time to funding, by rail",
  /** "{n}" is the number of funded loans the medians cover. */
  fundingCaption: "Simulated medians across {n} funded loans",
  fundingNote: "The dashboard also tracks cure rate, delinquency, SLA attainment and cost per loan.",
  rules: [
    { strong: "Maker-checker.", rest: " Overrides and hardship approvals always need a second person." },
    // The quoted preview is filled in from a real policy impact run (lib/landing/data.ts).
    { strong: "Policy changes with a preview.", rest: null },
    { strong: "An audit trail you can't edit.", rest: " Every decision, override and action, logged and exportable." },
  ],
  button: { label: "See the console in the demo", href: "/ops" },
} as const

export const PLUG_IN = {
  title: "How it would plug in",
  label: "Designed for",
  lead: "Berry would sit between a lender's core banking system and its payments provider. It wouldn't replace either one, and the lender's team would keep the final say on every decision.",
  rows: [
    { t: "Core banking", d: "Would take member and account data in and send booked loans out, by API or nightly file." },
    { t: "Applications", d: "Could use Berry’s application flow, or take files from the origination tool a lender already has." },
    { t: "Bank data", d: "Would start with uploaded statements, then use consent-based data feeds as the open banking framework goes live." },
    { t: "Payments", d: "Would produce CPA 005 files for a lender’s clearing provider, plus Interac e-Transfer." },
    { t: "Sign-in", d: "Could use single sign-on with a lender’s identity provider, with roles that match its approval authority." },
  ],
} as const

export const CANADA = {
  title: "Built for Canadian rules and rails.",
  lead: "Designed to cut custom work for compliance and payments teams. Each item links to the rule it follows and its current status.",
  /** "{asOf}" is the regulatory status file's month and year. */
  statusLink: "Regulatory status, as of {asOf} →",
  tiles: [
    { t: "Consent-first data sharing", d: "Built around the draft consumer-driven banking framework’s consent principles.", href: "/methodology#status-cdb-act" },
    { t: "PAD repayment", d: "Debit schedules and agreements modelled on Payments Canada Rule H1.", href: "/methodology#status-rule-h1" },
    { t: "AFT and instant funding", d: "CPA 005 batch files and Interac e-Transfer today. Real-Time Rail as Payments Canada rolls it out.", href: "/methodology#money" },
    { t: "FINTRAC checks", d: "Cash of $10,000 or more within 24 hours goes to review. It never touches the credit decision.", href: "/methodology#status-fintrac-lctr" },
    { t: "March 2026 NSF rules", d: "Retries are timed so a borrower is never charged a second NSF fee inside two business days.", href: "/methodology#status-nsf-fees" },
    { t: "Newcomer credit path", d: "A starter limit and clear milestones that fill the gap foreign credit reports don’t cover.", href: "/methodology#foreign-reports" },
  ],
} as const

export const CHECKS = {
  title: "Decisions you can check.",
  points: [
    { strong: "Rules, not guesses.", rest: " Limits, prices and approvals come from tested code. The same file gets the same answer every time." },
    { strong: "Blind to who you are.", rest: " Name, age, gender, nationality and postal code are never used. A test shuffles them on every build to prove it." },
    { strong: "AI drafts the memo. The engine and a human make the decision.", rest: " Every figure in the draft is checked against the engine before anyone sees it." },
    { strong: "Tested in public.", rest: " Every release runs against a set of applicants with known right answers. ", link: { label: "See the results, including the misses →", href: "/accuracy" } },
  ],
} as const

/** Only things that are true of Berry today. */
export const BUILT = {
  title: "How it's built",
  items: [
    "Synthetic data only",
    "No personal data sent to AI",
    "Append-only, hash-chained audit trail",
    "Maker-checker on every approval",
    "Deterministic, tested decisions",
    "Rate-limited AI route",
  ],
  yes: "Yes",
  link: { label: "How decisions are made →", href: "/methodology" },
} as const

export const PILOT = {
  title: "How a pilot would work",
  label: "Concept",
  disclaimer: "Berry is a portfolio project. This is how I'd run a pilot with a lender.",
  lead: "A pilot would start with one product, such as a seasonal line or newcomer credit, before a wider rollout.",
  steps: [
    { when: "Week 1", t: "Load the policy", d: "I'd set the lender’s limits, thresholds and approval authority in Berry." },
    { when: "Weeks 2–3", t: "Back-test", d: "Past applications would run through Berry, and its answers would be compared with what the lender’s team decided." },
    { when: "Weeks 4–8", t: "Go live on one product", d: "Real applications could follow, with the lender’s staff signing off every decision." },
    { when: "Week 9", t: "Review the results", d: "Approvals, decision time and early repayment would be measured against the lender’s baseline." },
  ],
} as const

export const FAQ = {
  title: "Common questions",
  items: [
    { q: "Who makes the final decision?", a: "The lender's team. Berry recommends a decision with its reasons, and the lender's approval authority decides who signs off. Overrides are allowed, logged and checked by a second person." },
    { q: "Can a lender use its own lending policy?", a: "Yes. Limits, thresholds, rates and approval tiers are settings, not code. Every change is versioned, and its effect on past applications can be previewed before it goes live." },
    { q: "How long does setup take?", a: "A pilot on one product would take about eight weeks, from loading the policy to reviewing results. A wider rollout would depend on the lender’s core banking system." },
    { q: "What does a declined borrower see?", a: "A plain-language reason, what would change the answer, and a way to ask for a review. The lender's team sees the same decision in lender terms." },
    { q: "Is Berry a real product?", a: "Berry is a working portfolio project by Joshua Osunbor. The rules, ledger and operations console are real and tested; the lenders and borrowers are fictional, and all data is synthetic." },
    { q: "Does AI make credit decisions?", a: "No. Limits, prices and approvals come from tested rules. AI only drafts the credit memo, and every figure in it is checked against the engine." },
  ],
} as const

export const CONTACT = {
  title: "Talk to me about Berry",
  lead: "Questions about how it works, or how it would run with a real lender? I'm happy to talk it through.",
  links: [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/joshuaosunbor" },
    { label: "GitHub", href: "https://github.com/joshosunbor/berry" },
  ],
} as const

export const FOOTER = {
  text: "Fictional institutions. Synthetic data. A portfolio project by Joshua Osunbor.",
  links: [
    { label: "Methodology", href: "/methodology" },
    { label: "Accuracy", href: "/accuracy" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/joshuaosunbor" },
    { label: "GitHub", href: "https://github.com/joshosunbor/berry" },
  ],
} as const
