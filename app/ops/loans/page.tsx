import type { Metadata } from "next"
import { ClockControl } from "@/components/berry/clock"
import { LoanBook } from "@/components/berry/loan-book"
import { ModeSwitcher } from "@/components/berry/mode-context"
import { getLoanSummaries } from "@/lib/data"

export const metadata: Metadata = {
  title: "Loan book · Berry",
  description: "Every simulated loan at each lender: funding, collections, returns, recovery and status, with a time control to fast-forward.",
}

export default function LoansPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-12 sm:px-8">
      <p className="text-sm font-medium text-muted-ink">Operations · lender view</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Loan book</h1>
          <p className="mt-2 max-w-2xl text-muted-ink">
            Every approved applicant becomes a loan at that lender. Collections, returned payments, recovery and charge-offs are simulated; fast-forward to
            watch them play out.
          </p>
        </div>
        <ModeSwitcher />
      </div>
      <ClockControl className="mt-6" />
      <div className="mt-6">
        <LoanBook loans={getLoanSummaries()} />
      </div>
    </main>
  )
}
