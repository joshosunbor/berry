import type { Metadata } from "next"
import Link from "next/link"
import { OpsConsole } from "@/components/berry/ops-console"
import { getAuditEvents, getOpsEventItems, getOpsItems } from "@/lib/data"

export const metadata: Metadata = {
  title: "Operations console · Berry",
  description: "Work queues with service levels, maker-checker approvals, delegated authority and an append-only audit trail, fed by real open items.",
}

export default function OpsPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-12 sm:px-8">
      <p className="text-sm font-medium text-muted-ink">Operations · lender view</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Operations console</h1>
      <p className="mt-2 max-w-2xl text-muted-ink">
        Every item here comes from something real in the files: a verification check that needs review, a large cash deposit, a sign-off, a returned payment,
        a reconciliation break, a hardship request or a payee to confirm. A small fictional team works them in business hours.
      </p>
      <nav aria-label="Operations" className="mt-4 flex gap-4 text-sm">
        <span aria-current="page" className="font-medium">
          Console
        </span>
        <Link href="/ops/loans" className="text-muted-ink underline-offset-4 hover:underline">
          Loan book
        </Link>
      </nav>
      <div className="mt-6">
        <OpsConsole items={getOpsItems()} events={getAuditEvents()} eventItems={getOpsEventItems()} />
      </div>
    </main>
  )
}
