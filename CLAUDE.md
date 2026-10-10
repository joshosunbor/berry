# Berry — Build Brief

> **Product name: Berry.** Use it on its own; never "Berry Finance" or "Berry Bank", because Berry is the decision and operations platform, not a lender. Before going public, check the name against the CIPO trademark database, the .ca/.com domains and LinkedIn, and pick a repo/domain such as `berry-lending` if plain "berry" is taken.

Drop this file into the root of a new repo as `CLAUDE.md`. It is written for Claude Code to build from.

---

## 1. What this is

**The whole life of a loan — onboarding, decision, money movement and the operation that runs it — across three ways of lending.**

Berry takes an applicant from onboarding and identity verification, through a cash-flow credit decision, to funding, repayment, failed-payment recovery and reconciliation, all run from an operations console with work queues, service levels and a live operations dashboard. Every step works under three institution modes:

| Mode | Fictional institution | Decision style |
|---|---|---|
| Credit union | **Northgate Credit Union** | Relationship-based. Member tenure, deposits and products held count. Delegated authority routes each file to the right approver. Structures the product around how the member actually earns. |
| Fintech | **Kite** | Instant and automated. Cash-flow only. Decision in under a second with plain-language reasons. |
| Bank | **Aspen Bank** | Policy-driven. Fixed thresholds, documentation checklist, standardized conditions. |

Any applicant can be run through all three modes side by side. That is the core experience: **the same applicant gets three different answers, and the product shows exactly why.**

It covers everyday Canadian lending, not one niche:
- **Personal:** personal loan, line of credit, credit card limit, newcomer/thin-file starter credit
- **Small business:** term loan, business line of credit, equipment financing, seasonal operating line

### Portfolio framing
It demonstrates, to Canadian credit unions, banks and fintechs, that the author understands:
- where Canadian banking is heading in 2026–2027: consumer-driven (open) banking, the Real-Time Rail and new consumer protections
- onboarding, KYC and business verification that is compliant without being slow
- cash-flow underwriting and explainable credit decisions
- moving money correctly after approval: disbursement, collections, failed-payment recovery, reconciliation
- running the operation: work queues, service levels, capacity, controls, audit trails and operating metrics
- how the three types of lender differ in practice (relationship lending, delegated authority and credit committee vs automated vs policy-driven)
- Canadian payment rails and compliance (open banking data, pre-authorized debits, AFT files, FINTRAC reporting, deposit protection)
- responsible AI in a regulated workflow (AI drafts, humans decide)

### Non-negotiables
1. **All data is synthetic.** No real people, no real bank connections.
2. **No real institution names, logos or branding** anywhere — product, screenshots, README, LinkedIn post. Only Northgate, Kite and Aspen (fictional), with a visible "fictional institutions, synthetic data" note in the footer and README.
3. **No real towns, addresses or personal details of the author.** Applicants use fictional names and, at most, a province. The author's location appears nowhere.
4. **Money decisions are deterministic code with unit tests.** AI never sets a limit, price or approval.
5. **Every decision is explainable** in plain language a member or business owner would understand.
6. **Regulatory details are sourced.** Before implementing a Canadian rule, read the official source (§9) and cite it in code comments and the README. Anything uncertain is labelled "illustrative" in the UI.

### The lifecycle (what the product covers end to end)
```
Apply → Verify (KYC/KYB) → Decide → Approve (authority) → Fund (AFT)
      → Collect (PAD) → Recover failed payments → Reconcile → Report
                 ↑ all run from the Operations Console ↑
```

---

## 2. Stack

- **Next.js (App Router) + TypeScript**, deployed on **Vercel**
- **Tailwind CSS** + **shadcn/ui**, **lucide-react** icons
- **Framer Motion** for restrained motion on the landing page only
- **Recharts** for cash-flow charts
- **Vitest** for engine unit tests; **Playwright** for one end-to-end smoke test
- **Zod** for schema validation of transactions and engine outputs
- No database for v1: synthetic applicants are versioned JSON seed files in `/data`. Optional later: SQLite/Turso for saved scenarios.
- **Claude API (optional)** for credit memo drafting, behind a server route; the app works fully without an API key (template fallback).

### Repo layout
```
/app
  /(marketing)/page.tsx          # landing page
  /workbench/page.tsx            # applicant list
  /workbench/[id]/page.tsx       # applicant file
  /compare/[id]/page.tsx         # three-mode side-by-side
  /methodology/page.tsx          # how decisions are made, sources, limits
  /accuracy/page.tsx             # published test results
  /ops/page.tsx                  # operations console (queues)
  /ops/dashboard/page.tsx        # operations metrics dashboard
  /ops/loans/[id]/page.tsx       # loan servicing view (ledger, payments, history)
  /api/memo/route.ts             # optional AI memo drafting
/lib/engine
  features.ts                    # transactions -> features
  patterns.ts                    # income regularity, seasonality, gig patterns
  modes/creditUnion.ts
  modes/fintech.ts
  modes/bank.ts
  authority.ts                   # delegated authority routing
  products.ts                    # product matching and structure
  repayment.ts                   # PAD schedule
  aft.ts                         # CPA 005-style file export (illustrative)
  fintrac.ts                     # large cash transaction flag
  explain.ts                     # reason codes -> plain language
  memo.ts                        # template credit memo
/lib/onboarding
  kyc.ts                         # synthetic identity + business verification checks
/lib/servicing
  ledger.ts                      # loan ledger (principal, interest, fees, balance)
  collections.ts                 # PAD collection runs
  returns.ts                     # payment returns + reason codes
  recovery.ts                    # retry, notify, hardship, escalate
  reconcile.ts                   # match collections to ledger
/lib/ops
  queues.ts                      # work queues, assignment, SLAs
  audit.ts                       # append-only audit trail, maker-checker
  metrics.ts                     # operating KPIs
  simulate.ts                    # time simulator (fast-forward months)
/lib/schemas                     # zod schemas (FDX-inspired transactions)
/data/applicants/*.json          # synthetic applicants
/data/institutions/*.json        # mode configs (limits, thresholds, rates)
/scripts/generate.ts             # seeded synthetic data generator
/tests                           # vitest + planted-case evaluation
```

---

## 3. Synthetic applicants (the cast)

Generate with a **seeded** generator so results are reproducible. Each applicant has a one-line story in the UI. Fictional names only; location shown as a province at most. Minimum cast of 14; these 10 are required, balanced across personal and business lending:

| Applicant | Type | Story | What it tests |
|---|---|---|---|
| **Priya**, salaried nurse | Personal loan | Stable payroll, modest savings, one car loan | Clean approval in all modes; baseline |
| **Hollis Family Farm**, grain farmer | Seasonal operating line | Most income arrives at harvest, steady input costs in spring, quiet months in between | Seasonality and the hero example: bank declines on irregular income, fintech approves a small line, CU structures an operating line repaid after harvest |
| **Amara**, gig worker (rideshare + delivery) | Credit card limit | Many small daily deposits | Gig income patterns; fintech strongest here |
| **Daniel**, newcomer, 7 months of history | Starter credit | Steady payroll, thin Canadian credit file, arrived from a country not covered by foreign credit report programs | Thin file; CU relationship path, bank declines on history, fintech small starter limit, plus a credit-building path |
| **Sofia**, overextended | Personal loan | Three bounced payments, rising card balances | Decline with clear reasons and what would change the answer |
| **Northline Auto Repair** | Business term loan | Steady weekly card deposits, growing revenue | Clean small-business approval |
| **Bright Smile Dental** | Equipment financing | High stable revenue, large equipment need | Large limit; CU routes to credit committee as it exceeds branch authority |
| **Corner Grind Café** | Business line of credit | Thin margins, recent NSFs | Decline or small limit with conditions |
| **Lakeside Lodge** | Seasonal operating line | Summer-heavy revenue, quiet winters | Seasonality: bank reads "irregular", CU structures repayment around peak months |
| **Main Street Hardware** | Business line of credit | Cash-heavy, one day of cash deposits over $10,000 | FINTRAC large cash flag (a compliance flag, not a credit penalty) |

**Planted cases:** also generate 30+ applicants with a known "correct" outcome per mode (obvious approves, obvious declines, edge cases). Expected outcomes live in `/tests/expected.json`, never visible to the engine.

### Transaction shape
Model transactions loosely on the **FDX** (Financial Data Exchange) structure: account, transaction id, posted date, amount, credit/debit, description, category, merchant. Validate with Zod. The README says "FDX-inspired". Do **not** claim FDX is Canada's official standard: the June 2026 draft consumer-driven banking regulations say the Minister of Finance will designate a technical standards body, without naming one.

---

## 4. The engine

### 4.1 Features (`features.ts`, `patterns.ts`)
Computed from transactions, each with a human-readable label:
- average monthly inflow, outflow, net cash flow
- income regularity: salaried, invoice-based, gig, seasonal (`patterns.ts`)
- volatility (coefficient of variation) and trend (last 3 vs prior 3 months)
- days of cash on hand (average balance / average daily outflow)
- NSF / returned payment count (90 days, 12 months)
- existing debt payments detected (recurring loan and card payments)
- debt service coverage at the proposed payment
- relationship depth (credit union mode): tenure, products held, average deposits

### 4.2 Modes
Each mode is a thin rule layer over the same features, configured in `/data/institutions/*.json` (limits, rates, thresholds are config, not code).

**Credit union (Northgate)**
- weighs relationship depth (tenure, deposit history, products held)
- evaluates annual rather than monthly cash flow when income is irregular or seasonal
- recommends **structure** (term loan vs line of credit vs seasonal repayment), not only yes/no
- **delegated authority** (`authority.ts`): config tiers, e.g. *Member Service Rep up to $X → Lender up to $Y → Branch Manager up to $Z → Credit Committee above*. UI shows who can approve and why. Clearly labelled illustrative; real tiers vary by credit union.

**Fintech (Kite)**
- cash-flow only, no relationship factors
- conservative automated limits, instant decision, short reason list
- "what would change this decision" guidance

**Bank (Aspen)**
- fixed thresholds (minimum months of history, maximum volatility, minimum coverage)
- documentation checklist and standardized conditions

### 4.3 Outputs (every mode)
```ts
Decision {
  outcome: "approve" | "approve_with_conditions" | "refer" | "decline"
  product, limit, rate (illustrative), term, structure
  reasons: ReasonCode[]          // ranked, max 4 shown
  counterfactuals: string[]      // "Approval likely if NSF count stays under 2 for 90 days"
  approver?: AuthorityTier       // credit union mode
  conditions?: string[]
  recommendations?: Product[]    // advice-based suggestions, e.g. savings for idle cash
  flags: ComplianceFlag[]        // e.g. FINTRAC LCTR candidate
}
```

### 4.4 Explanations (`explain.ts`)
Reason codes map to plain language in two registers: **customer-facing** ("Your income varies a lot month to month, so a fixed monthly payment would be hard to keep up") and **lender-facing** ("Income CV 0.62; coverage 1.1x at proposed payment").

### 4.5 Advice-based recommendations (`products.ts`)
Beyond the credit decision, suggest the product that fits: high idle balance → high-interest savings or term deposit; irregular income → line of credit rather than term loan; thin file → secured starter card. Each suggestion states why, in one sentence, with no hard sell.

### 4.6 Fairness
A "What this decision used" panel lists every input. A "What it deliberately ignores" panel: name, age, gender, nationality/immigration status, postal code. A test asserts these fields cannot influence outcomes (shuffle them; outcomes unchanged).

---

## 5. Canadian rails and compliance modules

All labelled illustrative unless verified against the source (§9).

- **PAD repayment schedule (`repayment.ts`)** — a pre-authorized debit schedule matched to the structure (monthly, bi-weekly to match payroll, or seasonal), with the agreement and pre-notification elements required under **Payments Canada Rule H1** shown as a checklist.
- **AFT disbursement file (`aft.ts`)** — exports a sample disbursement file in a **CPA Standard 005**-style fixed-width layout, with a "view raw file" toggle and a field-by-field explainer. Downloadable.
- **FINTRAC flag (`fintrac.ts`)** — flags cash deposits that could require a **Large Cash Transaction Report** (CAD $10,000+ in cash in a single transaction or within 24 hours under the 24-hour rule). Routed to a review queue, explicitly **not** a credit factor.
- **Deposit protection context** — show the difference: bank deposits covered by **CDIC**; credit union deposits covered by the **provincial deposit insurer**. A small, accurate detail that signals sector knowledge.

---

## 4A. Headline features (built into the flow)

These three features are the project's differentiators. They are **built into the product flow**, not presented as a separate "future" section: the consent screen sits in onboarding, the rail choice is a step at funding, and the credit-building path lives on the applicant file. Users discover them by using the product. Each must be worded exactly as below, because the underlying policy is still changing (status verified October 2026; see §9 and the Regulatory status panel on `/methodology`).

### 1. Consent-first, open-banking ready
- **Context (Oct 2026):** Canada's consumer-driven banking framework is in draft. Regulations were published June 27, 2026 (comments closed August 26, 2026) and will come into force in stages: accreditation first, then data sharing starting with deposit and payment accounts, then lending and investment accounts. Payment initiation ("write access") is only being considered for a later phase. The screen-scraping prohibition will not apply in the initial implementation.
- **Build:** a consent screen before any data is read showing *what* data, *for what purpose*, *for how long*, and *who* receives it; a consent dashboard with active consents, expiry dates and one-click revoke; data minimization (the engine requests only the categories the decision needs, and the UI shows what was not requested); a consent audit log.
- **Copy rule:** say "built around the draft framework's consent principles". Never say "compliant" or "certified".

### 2. Rail-aware funding (simulation)
- **Context (Oct 2026):** Payments Canada plans the Real-Time Rail (RTR) initial launch in Q4 2026, with Interac e-Transfer migration targeted for 2027 and full capacity targeted for Q3 2027. Reporting in October 2026 indicates the Big Six banks are not expected in the first phase, so real-time funding at scale is not yet realistic.
- **Build:** on funding, the lender chooses a rail: **AFT** (batch, next-day), **Interac e-Transfer**, or **RTR** (instant, *simulated*). Each shows typical timing, cost (illustrative), reversibility and fraud considerations. The ops dashboard compares time-to-funding by rail. A pre-funding **account verification** step (simulated name-and-account match with a scam warning) runs before instant rails.
- **Copy rule:** label RTR "simulated: launching in phases from Q4 2026". Don't claim lenders can fund on RTR today.

### 3. Thin-file credit-building path
- **Context (Oct 2026):** foreign credit history now transfers only from a limited set of countries (e.g. Equifax Canada's Global Consumer Credit File, starting with India; Nova Credit partnerships with TransUnion and Scotiabank). Many newcomers still arrive with a thin Canadian file.
- **Build:** a cash-flow-based starter limit for thin-file applicants plus a visible **graduation path**: milestones such as "6 on-time payments → limit review to $3,000", "12 months → unsecured line eligibility", with progress shown on the applicant file. A "foreign credit report available?" toggle shows how the decision changes when imported history exists.
- **Copy rule:** say "fills the gap foreign credit reports don't cover", not "newcomers have no way to bring credit history".

### Supporting trust features (not headline claims)
- **Plain-language decline explanations** and "what would change this decision" plus a "request a review" action. Framed as trust and transparency, not as fixing a proven regulatory gap.
- **Payee/account verification** before funding. Framed as a simulated fraud control; don't claim Canada has no such check.

---

## 5A. Onboarding and verification (`/lib/onboarding`)

- Application flow (personal or business) with progress, save-and-resume and plain-language help text.
- **Synthetic KYC/KYB checks:** identity document check, name/date-of-birth match, sanctions and politically-exposed-person screening against a fictional list, business registration check. Outcomes: pass, needs review, fail — with reasons.
- "Needs review" cases land in the **Verification queue** in the Ops Console.
- Show the friction trade-off: time-to-verify per applicant, and how many were cleared automatically vs manually.
- Labelled clearly: simulated checks on synthetic data; no real identity services.

## 5B. Money movement after approval (`/lib/servicing`)

- **Loan ledger:** principal, interest accrual (illustrative), fees, payments, running balance; every entry immutable.
- **Disbursement:** AFT credit file generated on funding (see §5); loan status → Funded; time-to-funding recorded.
- **Collections:** scheduled PAD debits per the repayment plan.
- **Returns:** a seeded share of collections come back returned with realistic reasons (insufficient funds, account closed, payment stopped, no debit allowed). Map to illustrative return codes, verified against Payments Canada materials where possible.
- **New NSF rules (in force March 12, 2026):** NSF fees capped at $10, no more than one NSF fee per deposit account within two business days, and no NSF fee when the overdraft is under $10. The simulator models these for the borrower's bank account, and the recovery playbook avoids retries that would trigger a second NSF within the two-business-day window. Frame recovery around **reducing losses and protecting borrowers** (late fees, credit damage), not around NSF fees piling up.
- **Recovery playbook (`recovery.ts`):** config-driven rules — e.g. NSF → one smart retry aligned to next payroll/deposit date, notify borrower; second failure → outreach task in Collections queue; account closed → request new banking details; repeated hardship signals → hardship options (payment deferral, re-amortization) for lender approval. Track cure rate.
- **Reconciliation (`reconcile.ts`):** match every collection and return to the ledger; unmatched or amount mismatches go to the **Reconciliation queue**. (Reuses the approach from the author's settlement reconciliation engine.)
- **Time simulator:** a control on the Ops pages to fast-forward 1, 3 or 12 months so collections, returns and recoveries play out live in the demo.

## 5C. Operations Console (`/ops`)

The screen an operations team, branch or back office works from every day.

- **Work queues:** Verification review · Credit referrals (by authority tier) · FINTRAC review · Failed payments / Collections · Reconciliation exceptions · Hardship requests.
- Each item: priority, age, **SLA timer** (green / amber / breached), owner, next action, link to the file.
- **Assignment and capacity:** a small fictional team (e.g. 4 analysts, 1 lead) with assignable work; capacity bar showing workload vs capacity per person; "auto-assign by skill" toggle.
- **Playbooks:** every queue item shows the standard operating procedure for that case type (step checklist), so work is consistent and new staff can follow it.
- **Controls:** **maker-checker** — limit overrides and hardship approvals need a second approver; **audit trail** (`audit.ts`) — append-only log of every decision, override, policy change and action, filterable and exportable.
- **Policy changes:** editing institution config (limits, thresholds, retry rules) creates a versioned, logged change with who/when/why, and shows the impact preview ("this change would have approved 3 more of the last 40 applications").
- **Member communications:** templated, plain-language messages for decision, missed payment, recovery and hardship, previewed before sending (simulated).

## 5D. Operations dashboard (`/ops/dashboard`)

KPIs per mode, with trend lines:
- **Front end:** applications, auto-verification rate, time-to-decision, approval / referral / decline rates
- **Funding:** time-to-funding
- **Servicing:** on-time payment rate, return rate by reason, cure rate after recovery, 30/60/90-day delinquency, illustrative loss rate
- **Operations:** queue backlog and ageing, SLA attainment, items per analyst, reconciliation match rate, **cost per loan** (illustrative cost model: minutes per manual touch × loaded hourly cost)

A short "What I'd improve next" panel highlights the biggest bottleneck automatically (e.g. "Verification reviews are 40% of manual work").

---

## 6. AI credit memo (optional, the responsible-AI showcase)

- `memo.ts` builds a **template memo** from structured engine output (always works, no API key).
- If `ANTHROPIC_API_KEY` is set, `/api/memo` sends **only structured engine output** (no raw transactions, no PII) to Claude for a polished one-page memo: applicant summary, cash flow, strengths, risks, structure, conditions, recommendation.
- Guardrails: the prompt forbids changing numbers or the decision; the server **validates** every figure in the AI memo against engine output and falls back to the template if anything differs.
- UI: the memo appears as a **draft** with "Reviewed" and "Approve memo" actions. Copy: *AI drafts the memo. The engine and a human make the decision.*

---

## 7. Product and design

### 7.1 Design direction
- Modern, calm, trustworthy. Off-white background, deep ink text, one accent per mode so they're instantly recognizable: **teal** for credit union, **violet** for fintech, **slate blue** for bank. Light and dark mode.
- Typography: Inter or Geist, tabular numerals for every amount.
- Generous whitespace, 8-pt grid, no stock photos; abstract ledger-line and grid motifs.
- Accessibility: WCAG AA contrast, full keyboard navigation, visible focus states, labelled charts, reduced-motion support.
- Responsive down to 375 px.

### 7.2 Landing page (`/`)
Principle: **show, then explain, then prove.** The landing page leads with the experience; Canadian depth comes through the product itself, and caveats live on `/methodology`, not here. **No status badges ("In draft", "Launching", "Simulated") on the landing page.**

1. **Hero + three-lender comparison:** *"One applicant. Three lenders. Three different answers."* Sub: *"Berry shows how credit unions, banks and fintechs read the same cash flow differently, and explains every decision."* CTAs: **Try the workbench**, **See how it decides**. Directly beneath, the animated three-column card for Hollis Family Farm: Aspen declines on irregular income, Kite approves an $8,000 line, Northgate offers a $60,000 seasonal operating line repaid after harvest. Reasons fade in under each.
2. **The whole loan, end to end:** an animated lifecycle strip that names the real Canadian steps as it plays: **Consent → Verify → Decide → Fund (AFT or instant) → Collect (PAD) → Recover → Reconcile**. Each step expands on hover/tap to one plain sentence. This is where visitors absorb the Canadian specifics without reading a feature list.
3. **Run it like an operation:** a glimpse of the Ops Console (queues with SLA timers) and the dashboard (time-to-funding, cure rate, cost per loan).
4. **Built for Canada:** one short row of six tiles, one line each, linking to `/methodology`: **Consent-first data sharing · PAD repayment · AFT and instant funding · FINTRAC checks · March 2026 NSF rules · Newcomer credit path.** Below the tiles, a small link: "Regulatory status, as of [month year] →".
5. **Responsible by design + accuracy:** deterministic decisions, fairness checks, AI drafts / humans decide, and the headline accuracy number from `/accuracy`.
6. **Footer:** "Fictional institutions. Synthetic data. A portfolio project by Joshua Osunbor." + LinkedIn + GitHub. No location.

The "for every kind of borrower" idea is carried by the workbench applicant cards and the lifecycle strip rather than a separate landing section, to keep the page tight.

**Where the honesty lives instead:**
- **In-product labels, small and factual,** only where needed, e.g. "Real-Time Rail (simulated)" on the funding step, "Simulated check" on verification.
- **The dated Regulatory status panel** on `/methodology` (Live / In draft / Launching / Simulated in Berry, with sources).
- **README "Status and limitations"** section mirroring the panel.

### 7.3 Workbench (`/workbench`)
- Applicant cards: name, one-line story, personal/business tag, product requested, outcome chips per mode.
- Filters: personal / business, income type. Persistent mode switcher (segmented control).

### 7.4 Applicant file (`/workbench/[id]`)
Left: story and key features. Centre: 12-month cash-flow chart (inflow/outflow, irregular or seasonal periods shaded). Right: decision panel (outcome, product, limit, structure, reasons, counterfactuals, approver tier, flags).
Tabs: **Verification · Decision · Recommendations · Repayment (PAD) · Disbursement (AFT) · Servicing · Credit memo · Inputs used**. Button: **Compare all three lenders** → `/compare/[id]`.

### 7.5 Compare (`/compare/[id]`)
Three columns, mode colours, differences highlighted. The screenshot for LinkedIn.

### 7.6 Methodology and Accuracy
- `/methodology`: features, each mode's rules, sources cited, known limitations, what would change in production.
- **Regulatory status panel** (on `/methodology`, linked from the landing page): a dated table, "Status as of [month year]", listing each rule or system the product touches with a status badge: **Live** (e.g. NSF fee cap, Rule H1, CPA 005, FINTRAC LCTR), **In draft** (consumer-driven banking regulations), **Launching** (Real-Time Rail), **Simulated in Berry**. Each row links to its source. Keep it as a JSON file (`/data/regulatory-status.json`) so it's easy to update.
- `/accuracy`: planted cases, expected vs actual per mode, match rate, every miss explained.

---

## 8. Quality bar

- Unit tests for every feature and rule; planted-case evaluation in CI writes `/public/accuracy.json`, rendered by `/accuracy`.
- Fairness test in CI.
- Servicing tests: ledger always balances; every collection and return reconciles or lands in the exception queue; maker-checker cannot be bypassed; audit log is append-only.
- Lighthouse ≥ 95 for performance and accessibility on the landing page.
- No console errors; Playwright smoke test: landing → workbench → applicant → compare.
- README: what it is, live link, screenshots/GIF, architecture diagram, how decisions work, sources, limitations, "fictional institutions, synthetic data" notice.

---

## 9. Sources to verify before implementing (Claude Code: fetch and read these first)

- Payments Canada — **Rule H1** (Pre-Authorized Debits) and **Standard 005** (AFT file format)
- FINTRAC — **Large Cash Transaction Reports** guidance, including the 24-hour rule
- Department of Finance Canada — **consumer-driven banking framework** and its reference to the **FDX** standard
- **CDIC** coverage basics, and how provincial deposit insurers cover credit union deposits
- Department of Finance Canada — draft **Consumer-Driven Banking Regulations** (published June 27, 2026) and later updates
- Payments Canada — **Real-Time Rail** launch plan and phases
- Department of Finance Canada — **NSF fee cap** announcement (in force March 12, 2026)
- Equifax Canada (Global Consumer Credit File) and Nova Credit (TransUnion / Scotiabank partnerships) — current country coverage

Re-check every item in this list at the start of the build and again before launch; update `/data/regulatory-status.json` and the "as of" date.

If a source can't be reached or confirmed, implement the feature as **illustrative**, label it in the UI and list it under Limitations.

---

## 10. Build phases (7-day plan)

Work one phase at a time: plan → approve → build → run tests → click through in the browser → commit. Where marked **parallel**, run a second Claude Code session in its own git worktree.

- **Day 0 (evening):** create the repo, add this file as `CLAUDE.md`, run the §12 prompt, approve the source check, design tokens and folder structure.
- **Day 1: Foundations + Engine.** Scaffold, schemas, seeded generator, the 10 applicants; features, income patterns, three modes, authority routing, explanations, recommendations, unit tests. **Parallel:** landing page hero and three-lender comparison, using mock data.
- **Day 2: Evaluation + Workbench, ship v1.** Planted cases, accuracy runner, fairness test, CI; applicant list, applicant file, charts, decision panel, compare view. Deploy to Vercel with the hero on the front. **First LinkedIn post tonight.**
- **Day 3: Onboarding + Canadian modules.** Application flow, consent screen and dashboard, synthetic KYC/KYB; PAD schedule, AFT export, FINTRAC flag, NSF rules, deposit protection, methodology page, Regulatory status panel.
- **Day 4: Money movement.** Ledger, rail-aware funding (AFT / e-Transfer / RTR simulated) with account verification, collections, returns, recovery playbook, reconciliation, time simulator, credit-building path.
- **Day 5: Operations.** Ops Console queues, SLAs, assignment and capacity, playbooks, maker-checker, audit trail, policy versioning, communications, ops dashboard. **Parallel:** AI memo (template, optional Claude route with validation, draft/review UX).
- **Day 6: Landing page complete + polish.** Lifecycle strip, ops glimpse, six Built for Canada tiles, responsible-by-design and accuracy, motion. No status badges on the landing page. Lighthouse and accessibility pass.
- **Day 7: Verify and ship.** Fresh Claude Code session (no build history) reviews the engine, money logic and Regulatory status panel against §9 sources and the tests; fix findings; README, screenshots, demo GIF, custom domain (optional). **Second LinkedIn post (the operations story).**

**Speed rules:** never skip the accuracy runner or the money-movement tests to save time; cut scope (fairness test, communications, time simulator) before cutting verification.

---

## 11. LinkedIn launch (after shipping)

**Assets:** the compare screenshot (Hollis Family Farm, three answers), an Ops Console screenshot, a 30-second screen recording (decision → funding → a failed payment recovered → dashboard), live link.

**Post draft:**
> One applicant. Three lenders. Three different answers.
>
> A grain farmer earns most of the year's income in a few months after harvest. A bank's policy reads that as irregular income and declines. A fintech approves a small, safe line. A credit union that knows farming offers a seasonal operating line, repaid after harvest.
>
> None of them is wrong. They just read the same cash flow differently. I built Berry to make those differences visible and to explain every decision in plain language, for farmers, salaried workers, gig workers, newcomers and small businesses.
>
> And it doesn't stop at "approved". It follows the whole loan: verification, funding by AFT file, pre-authorized debit collections, failed-payment recovery and reconciliation, all run from an operations console with work queues, service levels and a live dashboard for time-to-funding, cure rates and cost per loan.
>
> It's built for where Canadian banking is going: consent-first open banking (the framework is in draft), funding rails including a simulation of the Real-Time Rail now launching, and a credit-building path for newcomers with thin files.
>
> Under the hood: cash-flow underwriting, delegated lending authority and FINTRAC flags. Decisions are deterministic and tested against planted cases, with results published. AI drafts the credit memo; the engine and a human make the decision.
>
> Fictional institutions, synthetic data. Built with Claude Code.
>
> [link]

---

## 12. Opening prompt for Claude Code

> Read `CLAUDE.md` in full. Before writing any code, fetch and summarize the sources in §9 and tell me which Canadian rules you could confirm and which must be labelled illustrative. Then propose the design tokens (mode colours, type scale, spacing) and folder structure, and wait for my approval. After approval, start Phase 1: scaffold the Next.js app, set up Tailwind and shadcn/ui, write the Zod schemas, and build the seeded synthetic data generator with the 10 required applicants. Keep the lifecycle in §1 in mind when designing schemas so onboarding, servicing and operations data fit later without rework. Commit after each phase and show me what changed.
