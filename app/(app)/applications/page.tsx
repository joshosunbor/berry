import type { Metadata } from "next"
import { ApplicantGrid, type ApplicantCard } from "@/components/berry/applicant-grid"
import { PageContainer, PageHeader } from "@/components/ui/page-header"
import { getCast } from "@/lib/data"
import { INCOME_LABELS, PRODUCT_LABELS } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODES } from "@/lib/modes"

export const metadata: Metadata = {
  title: "Applications",
  description: "Synthetic applicants, each decided by a credit union, a fintech and a bank.",
}

export default function ApplicationsPage() {
  const cast = getCast()
  const cards: ApplicantCard[] = cast.map(({ applicant: a, features: f, decisions }) => ({
    slug: a.slug,
    name: a.displayName,
    story: a.story,
    kind: a.kind,
    product: PRODUCT_LABELS[a.request.product],
    amount: formatCents(a.request.amountCents, { whole: true }),
    incomeType: f.income.type,
    incomeLabel: INCOME_LABELS[f.income.type],
    outcomes: Object.fromEntries(
      MODES.map((m) => [m, { outcome: decisions[m].outcome, limit: decisions[m].limitCents ? formatCents(decisions[m].limitCents, { whole: true }) : null }]),
    ) as ApplicantCard["outcomes"],
  }))
  const incomeTypes = [...new Set(cast.map((c) => c.features.income.type))].map((t) => ({ value: t, label: INCOME_LABELS[t] }))

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={[{ label: "Demo", href: "/demo" }, { label: "Applications" }]}
        title="Applications"
        lead={`${cast.length} synthetic applicants, each decided by three fictional lenders. Pick a lender at the top to highlight its answers, or open a file to see why.`}
      />
      <ApplicantGrid cards={cards} incomeTypes={incomeTypes} />
    </PageContainer>
  )
}
