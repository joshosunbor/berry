import type { Metadata } from "next"
import Link from "next/link"
import { CircleCheck, CircleDashed, FileClock, Rocket } from "lucide-react"
import { Illustrative } from "@/components/berry/illustrative"
import { CONFIGS } from "@/lib/engine/config"
import { PATTERN_RULES } from "@/lib/engine/patterns"
import { REVOLVING_ASSESSMENT_RATE } from "@/lib/engine/payment"
import { ForeignReportToggle } from "@/components/berry/foreign-report-toggle"
import { getCast, getForeignReportDemo } from "@/lib/data"
import { IGNORED } from "@/lib/feature-display"
import { MODES, MODE_META } from "@/lib/modes"
import { formatCents } from "@/lib/money"
import { REGULATORY_STATUS, type RegulatoryRow } from "@/lib/regulatory/status"
import { thresholdLabel } from "@/lib/threshold-labels"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Methodology · Berry",
  description: "How Berry reads cash flow, how each lender decides, what it ignores, the Canadian rules it uses and their status, and its limits.",
}

const STATUS_STYLE: Record<RegulatoryRow["status"], { icon: typeof CircleCheck; className: string }> = {
  Live: { icon: CircleCheck, className: "bg-approve-soft text-approve" },
  "In draft": { icon: FileClock, className: "bg-conditions-soft text-conditions" },
  Launching: { icon: Rocket, className: "bg-bank-soft text-bank-fg" },
  Illustrative: { icon: CircleDashed, className: "bg-muted text-muted-ink" },
}

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })

function StatusBadge({ status }: { status: RegulatoryRow["status"] }) {
  const { icon: Icon, className } = STATUS_STYLE[status]
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      <Icon aria-hidden className="size-3.5" />
      {status}
    </span>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t border-rule pt-10">
      <h2 id={`${id}-h`} className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-4 space-y-4 leading-7">{children}</div>
    </section>
  )
}

const STYLES = {
  credit_union:
    "Weighs membership (tenure, products held and deposits). Reads seasonal income over a whole year and sizes a seasonal line so peak-season surplus repays it. Gives thin-file members with steady pay a starter limit. Strong members can be approved slightly below the standard coverage minimum; that approval moves up one authority tier. Every approval names who signs off.",
  fintech:
    "Cash flow only: no relationship factors. Sizes limits on the median month, so a few big months can't inflate them. Hard cut-offs on recent bounced payments and on months where more goes out than comes in. Doesn't structure around seasons, so a seasonal request gets a standard line instead.",
  bank:
    "Fixed thresholds checked in order, and a decline lists every one that failed. Approvals come with a documentation checklist and standard conditions. Gig and invoice-based income is referred for two years of tax returns.",
} as const

export default function MethodologyPage() {
  const cast = getCast()
  const auto = cast.filter((c) => c.verification.summary.automated).length
  const manual = cast.length - auto
  const status = REGULATORY_STATUS
  const foreign = getForeignReportDemo()

  return (
    <main className="mx-auto max-w-[960px] px-4 py-12 sm:px-8">
      <p className="text-sm font-medium text-muted-ink">Methodology</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">How Berry decides</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-muted-ink">
        Every decision is made by deterministic rules that are unit tested. The same file always gets the same answer, and every answer is explained in
        plain language. AI never sets a limit, a price or an approval.
      </p>
      <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {[
          ["reading", "Reading cash flow"],
          ["lenders", "How each lender decides"],
          ["fairness", "What it ignores"],
          ["verification", "Verification"],
          ["money", "Money movement"],
          ["foreign-reports", "Foreign credit reports"],
          ["regulatory-status", "Regulatory status"],
          ["limits", "Limitations"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="text-muted-ink underline underline-offset-2 hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-10 space-y-12">
        <Section id="reading" title="Reading cash flow">
          <p>
            Berry reads twelve months of synthetic transactions in an FDX-inspired format. Transfers between the applicant&apos;s own accounts are set aside,
            and a bounced payment cancels against its reversal so it isn&apos;t counted twice; the bank&apos;s fee stays as a real cost. From that it
            measures:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>average and median monthly income, spending and cash left over;</li>
            <li>how much income varies month to month (coefficient of variation) and its recent trend;</li>
            <li>days of spending the balance covers, bounced payments in 90 days and 12 months, and existing loan payments;</li>
            <li>debt service coverage: cash available for all debt payments divided by those payments, including the new one.</li>
          </ul>
          <p>
            Income is classed as salaried, pension, gig, seasonal (the best three consecutive months bring at least {PATTERN_RULES.seasonalPeakShare * 100}%
            of a year&apos;s income), invoice-based (mostly direct client payments, a few a month), steady business, or irregular. Revolving credit is
            assessed at {REVOLVING_ASSESSMENT_RATE * 100}% of the limit per month <Illustrative />.
          </p>
        </Section>

        <Section id="lenders" title="How each lender decides">
          <p>
            Each lender is a thin rule layer over the same measurements. Its limits, rates and thresholds live in configuration, shown here exactly as the
            engine uses them. Every value is <Illustrative className="align-middle" />: chosen to make three lending styles visible, not taken from any
            real institution.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {MODES.map((m) => {
              const config = CONFIGS[m]
              const meta = MODE_META[m]
              return (
                <article key={m} className={cn("rounded-lg border-t-4 bg-surface p-5 shadow-soft", meta.classes.border)}>
                  <h3 className={cn("font-semibold", meta.classes.fg)}>{meta.institution}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-ink">{STYLES[m]}</p>
                  <dl className="mt-4 divide-y divide-rule text-sm">
                    {Object.entries(config.thresholds).map(([k, v]) => {
                      const t = thresholdLabel(k, v)
                      return (
                        <div key={k} className="flex justify-between gap-3 py-1.5">
                          <dt className="text-muted-ink">{t.label}</dt>
                          <dd className="num shrink-0 font-medium">{t.value}</dd>
                        </div>
                      )
                    })}
                  </dl>
                  {config.authorityTiers && (
                    <>
                      <h4 className="mt-4 text-sm font-semibold">Who signs off</h4>
                      <ul className="mt-1 space-y-0.5 text-sm text-muted-ink">
                        {config.authorityTiers.map((t) => (
                          <li key={t.id}>
                            {t.title}: {t.maxExposureCents === null ? "above that" : `up to ${formatCents(t.maxExposureCents, { whole: true })}`}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p className="mt-4 text-xs text-muted-ink">Policy version {config.version}, effective {config.effectiveFrom}</p>
                </article>
              )
            })}
          </div>
          <p>
            Results on 36 planted test cases are published on the <Link href="/accuracy" className="underline underline-offset-2">accuracy page</Link>.
          </p>
        </Section>

        <Section id="fairness" title="What it deliberately ignores">
          <p>No decision uses any of these. They are kept out of the engine&apos;s input entirely:</p>
          <ul className="list-disc pl-6">
            {IGNORED.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p>
            A test hands the engine every applicant with these fields shuffled and checks that no decision changes; it was checked by planting a bias and
            watching the test fail. A large cash deposit is flagged for FINTRAC review but is never a credit factor, and a test proves the decision is the
            same with or without the flag.
          </p>
        </Section>

        <Section id="verification" title="Verification and the friction trade-off">
          <p>
            Identity and business checks are simulated on synthetic data, against a fictional watch list and registry. Of {cast.length} applicants,{" "}
            {auto} clear automatically in seconds and {manual} go to a person: one for a near-match on the watch list and one for an overdue annual
            filing. A manual review takes hours, which is why the goal is to send people only the cases that need judgment.
          </p>
        </Section>

        <Section id="money" title="Money movement">
          <p>
            Every approved loan is serviced in a simulation that runs twelve months forward. Money is kept in a double-entry ledger in whole cents: every
            entry&apos;s debits equal its credits, entries are never edited, and corrections are reversing entries. Funding goes by AFT (next business
            day), Interac e-Transfer, or the Real-Time Rail, which is <span className="font-medium">simulated — RTR launching</span>; instant rails need a
            simulated account check first.
          </p>
          <p>
            Repayments are pre-authorized debits. When one is returned unpaid, Berry follows a playbook based on the Payments Canada return reason
            (Standard 007): an NSF return is retried once, on the borrower&apos;s next payday where possible, and never inside the 2-business-day window
            in which their bank could charge another NSF fee; an account problem means asking for new banking details instead. Repeated returns bring a
            hardship offer, and a loan still unpaid 120 days after a missed payment is charged off (configurable) <Illustrative />.
          </p>
          <p>
            Berry&apos;s lenders charge no fee of their own for a returned payment; the simulation shows what the borrower&apos;s bank charges. The NSF fee
            rules in force since March 12, 2026 (a $10 cap, one fee per 2 business days, none when overdrawn by less than $10) apply to personal accounts at
            federally regulated banks, so Berry applies them only there. Provincially regulated credit unions set their own fees: for borrowers who bank at
            one, Berry uses an illustrative fee, labelled &ldquo;provincially regulated — fee illustrative&rdquo;.
          </p>
        </Section>

        <Section id="foreign-reports" title="Foreign credit reports and the credit-building path">
          <p>
            Some newcomers can bring credit history with them: foreign credit report programs import history from a limited set of countries (for
            example, India was first in Equifax Canada&apos;s program). This planted applicant has a thin Canadian file but history from a covered
            country. Switch the report off to see how much each lender&apos;s answer depends on it.
          </p>
          <p className="text-sm text-muted-ink">
            {foreign.story} Asking for a credit card of {formatCents(foreign.request.amountCents, { whole: true })}, with {foreign.creditHistoryMonths} months of
            Canadian credit history.
          </p>
          <ForeignReportToggle withReport={foreign.withReport} withoutReport={foreign.withoutReport} />
          <p>
            Many newcomers come from countries no program covers yet. For them, Berry&apos;s credit-building path fills the gap foreign credit reports
            don&apos;t cover: a starter limit sized on steady cash flow, and milestones (six on-time payments for a limit review; twelve months for an
            unsecured line) shown on the applicant&apos;s file. <Link href="/workbench/daniel" className="underline underline-offset-2">Daniel&apos;s file</Link>{" "}
            shows it.
          </p>
        </Section>

        <Section id="regulatory-status" title="Regulatory status">
          <p>
            Status as of <span className="font-medium">{longDate(status.asOf)}</span>. Each row links to its official source and shows when it was last
            checked. <span className="font-medium">Live</span> means in force; <span className="font-medium">In draft</span> means proposed or passed but
            not in force; <span className="font-medium">Launching</span> means announced and rolling out; <span className="font-medium">Illustrative</span>{" "}
            means Berry could not confirm it from an official source.
          </p>
          <ul className="space-y-3">
            {status.rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-rule bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold">{r.name}</h3>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1.5 text-sm leading-6">{r.summary}</p>
                {r.effective && <p className="mt-1 text-sm text-muted-ink">{r.effective}</p>}
                <p className="mt-2 text-sm leading-6">
                  <span className="font-medium">In Berry ({r.berryUse.toLowerCase()}):</span> <span className="text-muted-ink">{r.inBerry}</span>
                </p>
                {r.note && <p className="mt-1 text-sm text-muted-ink">Note: {r.note}</p>}
                <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-ink">
                  <a href={r.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                    Source: {r.source.name}
                  </a>
                  <span>Checked {longDate(r.asOf)}</span>
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="limits" title="Known limitations, and what would change in production">
          <ul className="list-disc space-y-2 pl-6">
            <li>All applicants, institutions, accounts, watch lists and registries are synthetic or fictional. No real bank, bureau or identity service is connected.</li>
            <li>Rates, limits, thresholds and authority tiers are illustrative. A real lender would calibrate them on its own loss history and risk appetite.</li>
            <li>The accuracy score shows the engine applies its stated policies; expectations and engine share an author, so it says nothing about real credit performance.</li>
            <li>The AFT file is ASCII, not EBCDIC, and isn&apos;t for submission; payment type codes from Standard 007 were not checked.</li>
            <li>Business days are weekdays; statutory holidays are not modelled.</li>
            <li>Servicing is simulated: settlement and return timing, retry policy by return reason, interest accrual and the credit union NSF fee are illustrative.</li>
            <li>Three provinces&apos; credit union deposit insurance limits could not be read from the official sites and are shown as Illustrative.</li>
            <li>In production: real consented data under an accredited framework, bureau data alongside cash flow, model monitoring, adverse-action notices reviewed by compliance, and human review of referrals and exceptions.</li>
          </ul>
        </Section>
      </div>
    </main>
  )
}
