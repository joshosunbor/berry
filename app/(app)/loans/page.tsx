import type { Metadata } from "next"
import { ClockControl } from "@/components/berry/clock"
import { LoanBook } from "@/components/berry/loan-book"
import { PageContainer, PageHeader } from "@/components/ui/page-header"
import { getLoanSummaries } from "@/lib/data"

export const metadata: Metadata = {
  title: "Loan book · Loans",
  description: "Every simulated loan at each lender: funding, collections, returns, recovery and status, with a time control to fast-forward.",
}

export default function LoansPage() {
  return (
    <PageContainer>
      <PageHeader
        breadcrumb={[{ label: "Demo", href: "/demo" }, { label: "Loans" }]}
        title="Loan book"
        lead="Every approved applicant becomes a loan at that lender. Collections, returned payments, recovery and charge-offs are simulated; fast-forward to watch them play out."
      />
      <ClockControl />
      <div className="mt-6">
        <LoanBook loans={getLoanSummaries()} />
      </div>
    </PageContainer>
  )
}
