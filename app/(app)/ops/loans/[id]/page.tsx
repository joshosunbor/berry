import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ClockControl } from "@/components/berry/clock"
import { LoanDetail } from "@/components/berry/loan-detail"
import { ModeChip } from "@/components/berry/mode-chip"
import { StressTest } from "@/components/berry/stress-test"
import { PageContainer, PageHeader } from "@/components/ui/page-header"
import { getLoanView, getLoanViews, getStress } from "@/lib/data"
import { SERVICING } from "@/lib/servicing/config"
import { PRODUCT_LABELS } from "@/lib/labels"

export function generateStaticParams() {
  return getLoanViews().map((l) => ({ id: l.id }))
}

export async function generateMetadata({ params }: PageProps<"/ops/loans/[id]">): Promise<Metadata> {
  const { id } = await params
  const loan = getLoanView(id)
  return loan ? { title: `${loan.applicantName}'s loan · Berry`, description: `Servicing view: funding, collections, returns, recovery and the ledger.` } : {}
}

export default async function LoanPage({ params }: PageProps<"/ops/loans/[id]">) {
  const { id } = await params
  const loan = getLoanView(id)
  if (!loan) notFound()
  const stress = getStress(loan.id)
  return (
    <PageContainer>
      <PageHeader
        breadcrumb={[{ label: "Operations", href: "/ops" }, { label: "Loan book", href: "/ops/loans" }, { label: loan.applicantName }]}
        eyebrow={`${PRODUCT_LABELS[loan.product]} · servicing view (simulated)`}
        title={loan.applicantName}
        actions={<ModeChip mode={loan.mode} />}
      />
      <ClockControl />
      <div className="mt-6">
        <LoanDetail loan={loan} />
      </div>
      {stress && (
        <div className="mt-6">
          <StressTest loanId={loan.id} applicantName={loan.applicantName} mode={loan.mode} results={stress} defaultPct={SERVICING.stress.poorHarvestRevenueDropPct} />
        </div>
      )}
    </PageContainer>
  )
}
