import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { ClockControl } from "@/components/berry/clock"
import { LoanDetail } from "@/components/berry/loan-detail"
import { ModeChip } from "@/components/berry/mode-chip"
import { StressTest } from "@/components/berry/stress-test"
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
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8 sm:py-10">
      <Link href="/ops/loans" className="inline-flex items-center gap-1 text-sm text-muted-ink hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Loan book
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <ModeChip mode={loan.mode} />
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{loan.applicantName}</h1>
          <p className="mt-1 text-muted-ink">{PRODUCT_LABELS[loan.product]} · servicing view (simulated)</p>
        </div>
      </div>
      <ClockControl className="mt-6" />
      <div className="mt-6">
        <LoanDetail loan={loan} />
      </div>
      {stress && (
        <div className="mt-6">
          <StressTest loanId={loan.id} applicantName={loan.applicantName} mode={loan.mode} results={stress} defaultPct={SERVICING.stress.poorHarvestRevenueDropPct} />
        </div>
      )}
    </main>
  )
}
