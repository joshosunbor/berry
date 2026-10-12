import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CashFlowChart } from "@/components/berry/cash-flow-chart"
import { CreditBuildingCard } from "@/components/berry/credit-building"
import { DecisionPanel } from "@/components/berry/decision-panel"
import { DecisionTabs } from "@/components/berry/decision-tabs"
import { ModeSwitcher } from "@/components/berry/mode-context"
import { Card } from "@/components/ui/card"
import { PageContainer, PageHeader } from "@/components/ui/page-header"
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
  const loans = getLoanSummaries().filter((l) => l.applicantSlug === a.slug)

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={[{ label: "Workbench", href: "/workbench" }, { label: a.displayName }]}
        eyebrow={`${a.kind === "business" ? "Business" : "Personal"} · ${a.province} · synthetic applicant`}
        title={a.displayName}
        lead={
          <>
            Asking for a <span className="text-fg">{PRODUCT_LABELS[a.request.product].toLowerCase()}</span> of{" "}
            <span className="num text-fg">{formatCents(a.request.amountCents, { whole: true })}</span>
            {a.request.termMonths ? ` over ${a.request.termMonths} months` : ""}: {a.request.purpose.toLowerCase()}.
          </>
        }
        actions={<ModeSwitcher />}
      />

      {/* Desktop: chart and tabs in a wide main column, decision and key facts beside it. Phones: decision first. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 min-w-0 space-y-6 lg:order-1">
          <Card pad="lg">
            <CashFlowChart months={f.monthly} peakMonths={f.income.peakMonths} seasonal={f.income.type === "seasonal"} />
          </Card>
          <DecisionTabs decisions={decisions} features={f} data={{ verification, pad, aft, largeCash, accountVerification, loans, slug: a.slug }} />
        </div>

        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          <DecisionPanel decisions={decisions} slug={a.slug} requestedCents={a.request.amountCents} />
          {f.creditHistoryMonths < 12 && !f.foreignReportAvailable && <CreditBuildingCard loans={loans} />}
          <aside aria-label="Applicant summary" className="space-y-4">
            <p className="leading-7 text-fg-2">{a.story}</p>
            {a.business && (
              <p className="text-sm text-fg-3">
                {a.business.industry} · {a.business.yearsOperating} years · {a.business.employees} employees
              </p>
            )}
            <Card pad="none">
              <dl className="divide-y divide-line text-sm">
                {keyFacts(f).map((k) => (
                  <div key={k.label} className="flex justify-between gap-3 px-5 py-2.5">
                    <dt className="text-fg-3">{k.label}</dt>
                    <dd className="num text-right font-semibold">{k.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </aside>
        </div>
      </div>
    </PageContainer>
  )
}
