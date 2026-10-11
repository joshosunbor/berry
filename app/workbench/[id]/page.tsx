import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { CashFlowChart } from "@/components/berry/cash-flow-chart"
import { DecisionPanel } from "@/components/berry/decision-panel"
import { DecisionTabs } from "@/components/berry/decision-tabs"
import { ModeSwitcher } from "@/components/berry/mode-context"
import { getApplicant, getCast, getLoanSummaries } from "@/lib/data"
import { keyFacts } from "@/lib/feature-display"
import { PRODUCT_LABELS } from "@/lib/labels"
import { formatCents } from "@/lib/money"

export function generateStaticParams() {
  return getCast().map((c) => ({ id: c.applicant.slug }))
}

export async function generateMetadata({ params }: PageProps<"/workbench/[id]">): Promise<Metadata> {
  const { id } = await params
  const view = getApplicant(id)
  return view ? { title: `${view.applicant.displayName} · Berry`, description: view.applicant.story } : {}
}

export default async function ApplicantPage({ params }: PageProps<"/workbench/[id]">) {
  const { id } = await params
  const view = getApplicant(id)
  if (!view) notFound()
  const { applicant: a, features: f, decisions, verification, pad, aft, largeCash, accountVerification } = view

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8 sm:py-10">
      <Link href="/workbench" className="inline-flex items-center gap-1 text-sm text-muted-ink hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        All applicants
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-ink">
            {a.kind === "business" ? "Business" : "Personal"} · {a.province} · synthetic applicant
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{a.displayName}</h1>
          <p className="mt-1 text-muted-ink">
            Asking for a <span className="text-ink">{PRODUCT_LABELS[a.request.product].toLowerCase()}</span> of{" "}
            <span className="num text-ink">{formatCents(a.request.amountCents, { whole: true })}</span>
            {a.request.termMonths ? ` over ${a.request.termMonths} months` : ""}: {a.request.purpose.toLowerCase()}.
          </p>
        </div>
        <ModeSwitcher />
      </div>

      {/* Desktop: chart and tabs in a wide main column, decision and key facts beside it. Phones: decision first. */}
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 min-w-0 space-y-6 lg:order-1">
          <div className="rounded-lg border border-rule bg-surface p-5">
            <CashFlowChart months={f.monthly} peakMonths={f.income.peakMonths} seasonal={f.income.type === "seasonal"} />
          </div>
          <DecisionTabs decisions={decisions} features={f} data={{ verification, pad, aft, largeCash, accountVerification, loans: getLoanSummaries().filter((l) => l.applicantSlug === a.slug) }} />
        </div>

        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          <DecisionPanel decisions={decisions} slug={a.slug} requestedCents={a.request.amountCents} />
          <aside aria-label="Applicant summary" className="space-y-4">
            <p className="leading-7">{a.story}</p>
            {a.business && (
              <p className="text-sm text-muted-ink">
                {a.business.industry} · {a.business.yearsOperating} years · {a.business.employees} employees
              </p>
            )}
            <dl className="divide-y divide-rule rounded-lg border border-rule bg-surface text-sm">
              {keyFacts(f).map((k) => (
                <div key={k.label} className="flex justify-between gap-3 px-4 py-2.5">
                  <dt className="text-muted-ink">{k.label}</dt>
                  <dd className="num text-right font-medium">{k.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </div>
    </main>
  )
}
