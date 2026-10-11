import Link from "next/link"
import { ArrowRight, Banknote, CalendarClock, Fingerprint, ScrollText, ShieldCheck, Sprout, Scale, Sparkles, Shuffle, ListChecks } from "lucide-react"
import { HeroComparison, type HeroColumn } from "@/components/berry/hero-comparison"
import { LifecycleStrip } from "@/components/berry/lifecycle-strip"
import { getApplicant, getMetricSources } from "@/lib/data"
import type { AccuracyReport } from "@/lib/evaluation/accuracy"
import { OPS } from "@/lib/ops/config"
import { computeKpis } from "@/lib/ops/metrics"
import { OPS_MOMENTS } from "@/lib/ops/moments"
import { slaState, type SlaState } from "@/lib/ops/queues"
import statusFile from "@/data/regulatory-status.json"
import report from "@/public/accuracy.json"
import { PRODUCT_LABELS, STRUCTURE_LABELS } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODES } from "@/lib/modes"

/*
 * Landing page (CLAUDE.md §7.2): show, then explain, then prove. Every
 * number comes from the engine, the simulator or the published accuracy
 * report. No status badges here: caveats live on /methodology.
 */

const CANADA = [
  { title: "Consent-first data sharing", text: "Asks what, why, how long and who before any data is read; revoke in one click.", href: "/methodology#status-cdb-act", Icon: Fingerprint },
  { title: "PAD repayment", text: "Pre-authorized debits timed to how the borrower is paid, with the agreement spelled out.", href: "/methodology#status-rule-h1", Icon: CalendarClock },
  { title: "AFT and instant funding", text: "Next-day AFT files or an instant send, with a name-and-account check first.", href: "/methodology#money", Icon: Banknote },
  { title: "FINTRAC checks", text: "Large cash deposits go to a review queue, never into the credit decision.", href: "/methodology#status-fintrac-lctr", Icon: ScrollText },
  { title: "March 2026 NSF rules", text: "Retries never land where the borrower's bank could charge a second NSF fee.", href: "/methodology#status-nsf-fees", Icon: ShieldCheck },
  { title: "Newcomer credit path", text: "A cash-flow starter limit and clear milestones, filling the gap foreign credit reports don't cover.", href: "/methodology#foreign-reports", Icon: Sprout },
]

const RESPONSIBLE = [
  { title: "Deterministic decisions", text: "Limits, prices and approvals come from tested code and versioned policy. AI never sets them.", Icon: Scale },
  { title: "Fairness, tested", text: "Name, age, gender, nationality, immigration status and postal code are never read. A test shuffles them and checks no outcome moves.", Icon: Shuffle },
  { title: "AI drafts, humans decide", text: "AI can draft the credit memo from the engine's output only; a person reviews and approves it.", Icon: Sparkles },
  { title: "Every action on the record", text: "Maker-checker approvals, delegated authority and a hash-chained audit trail.", Icon: ListChecks },
]

const SLA_TEXT: Record<SlaState, { label: string; className: string }> = {
  on_time: { label: "On time", className: "bg-approve-soft text-approve" },
  at_risk: { label: "At risk", className: "bg-conditions-soft text-conditions" },
  breached: { label: "Breached", className: "bg-decline-soft text-decline" },
  met: { label: "Met", className: "bg-approve-soft text-approve" },
  missed: { label: "Missed", className: "bg-decline-soft text-decline" },
}

const monthYear = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" })

export default function Home() {
  const hollis = getApplicant("hollis-family-farm")!
  const columns: HeroColumn[] = MODES.map((m) => {
    const d = hollis.decisions[m]
    const ok = d.outcome === "approve" || d.outcome === "approve_with_conditions"
    return {
      mode: m,
      outcome: d.outcome,
      amount: ok ? formatCents(d.limitCents, { whole: true }) : null,
      product: ok ? (d.structure === "seasonal_operating" ? `${PRODUCT_LABELS[d.product]}, ${STRUCTURE_LABELS.seasonal_operating.split(": ")[1]}` : PRODUCT_LABELS[d.product]) : null,
      reason: d.reasons[0].customerText,
    }
  })

  // Operations glimpse: the console at Oct 5, 9:00, and three KPIs twelve months on.
  const src = getMetricSources()
  const glimpseAt = OPS_MOMENTS[1].at
  const openItems = src.items
    .filter((i) => i.createdAt <= glimpseAt && (!i.completedAt || i.completedAt > glimpseAt))
    .map((i) => ({ i, sla: slaState(i, glimpseAt) }))
    .slice(0, 4)
  const end = OPS_MOMENTS.at(-1)!
  const kpis = computeKpis(src, "all", end.at)
  const pick = (id: string) => kpis.find((k) => k.id === id)!
  const instant = pick("time_to_funding").breakdown!.find((b) => b.label.startsWith("Interac"))
  const glimpseKpis = [
    { label: "Time to funding", value: pick("time_to_funding").value, note: instant ? `median; ${instant.value} by e-Transfer` : "median" },
    { label: "Cure rate", value: pick("cure_rate").value, note: "missed payments brought up to date" },
    { label: "Cost per loan", value: pick("cost_per_loan").value, note: "manual work plus funding fees" },
  ]
  const acc = (report as AccuracyReport).totals

  return (
    <main>
      <section className="bg-ledger relative overflow-hidden">
        <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-display">One applicant. Three lenders. Three different answers.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-ink">
            Berry shows how credit unions, banks and fintechs read the same cash flow differently, and explains every decision.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/workbench" className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-background hover:bg-ink/90">
              Try the workbench
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="/methodology" className="inline-flex items-center gap-2 rounded-md border border-rule bg-surface px-5 py-2.5 text-sm font-medium hover:border-ink/30">
              See how it decides
            </Link>
          </div>
          <div className="mt-12">
            <HeroComparison name={hollis.applicant.displayName} story={hollis.applicant.story} columns={columns} />
          </div>
        </div>
      </section>

      <section aria-labelledby="lifecycle" className="border-t border-rule">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-20">
          <h2 id="lifecycle" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            The whole loan, end to end
          </h2>
          <p className="mt-3 max-w-2xl text-muted-ink">It doesn&apos;t stop at &ldquo;approved&rdquo;. Berry follows the money from the first consent to the last reconciled payment.</p>
          <div className="mt-8">
            <LifecycleStrip />
          </div>
        </div>
      </section>

      <section aria-labelledby="operation" className="border-t border-rule bg-surface/60">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-20">
          <h2 id="operation" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Run it like an operation
          </h2>
          <p className="mt-3 max-w-2xl text-muted-ink">
            Work queues with service levels, maker-checker approvals and a dashboard computed from the ledger. A small fictional team works every item.
          </p>
          <div className="mt-8 grid gap-6 lg:grid-cols-5">
            <div className="min-w-0 rounded-lg border border-rule bg-surface p-5 lg:col-span-3">
              <p className="text-sm font-medium">Operations console</p>
              <p className="text-xs text-muted-ink">{OPS_MOMENTS[1].label}: open items</p>
              <ul className="mt-4 space-y-2">
                {openItems.map(({ i, sla }) => (
                  <li key={i.id} className="flex items-start justify-between gap-3 rounded-md border border-rule p-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{i.title}</span>
                      <span className="block text-xs text-muted-ink">{OPS.queues[i.queue].label}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SLA_TEXT[sla].className}`}>{SLA_TEXT[sla].label}</span>
                  </li>
                ))}
              </ul>
              <Link href="/ops" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
                Open the console <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
            <div className="min-w-0 rounded-lg border border-rule bg-surface p-5 lg:col-span-2">
              <p className="text-sm font-medium">Dashboard</p>
              <p className="text-xs text-muted-ink">All lenders, {end.label}</p>
              <dl className="mt-4 space-y-4">
                {glimpseKpis.map((k) => (
                  <div key={k.label}>
                    <dt className="text-sm text-muted-ink">{k.label}</dt>
                    <dd>
                      <span className="num text-2xl font-semibold tracking-tight">{k.value}</span>
                      <span className="ml-2 text-xs text-muted-ink">{k.note}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <Link href="/ops/dashboard" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
                See how each is computed <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="canada" className="border-t border-rule">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-20">
          <h2 id="canada" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Built for Canada
          </h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CANADA.map(({ title, text, href, Icon }) => (
              <li key={title}>
                <Link href={href} className="flex h-full gap-3 rounded-lg border border-rule bg-surface p-4 transition-colors hover:border-ink/40">
                  <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-ink" />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="mt-1 block text-sm text-muted-ink">{text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/methodology#regulatory-status" className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-ink underline-offset-4 hover:text-ink hover:underline">
            Regulatory status, as of {monthYear(statusFile.asOf)} <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="responsible" className="border-t border-rule bg-surface/60">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-20">
          <h2 id="responsible" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Responsible by design
          </h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
              {RESPONSIBLE.map(({ title, text, Icon }) => (
                <li key={title} className="flex gap-3 rounded-lg border border-rule bg-surface p-4">
                  <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-ink" />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="mt-1 block text-sm text-muted-ink">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="rounded-lg border border-rule bg-surface p-5">
              <p className="text-sm font-medium">Accuracy on planted cases</p>
              <p className="num mt-2 text-4xl font-semibold tracking-tight">
                {acc.matched} of {acc.decisions}
              </p>
              <p className="mt-2 text-sm text-muted-ink">
                decisions across {acc.cases} test applicants and three lenders match the outcome their rules were designed for. Every case and the two
                debatable ones are published.
              </p>
              <Link href="/accuracy" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
                See the results <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
