import type { Metadata } from "next"
import Link from "next/link"
import { OpsDashboard, type DashboardData } from "@/components/berry/ops-dashboard"
import { getMetricSources } from "@/lib/data"
import { bottleneck, computeKpis, type LenderFilter } from "@/lib/ops/metrics"
import { OPS_MOMENTS } from "@/lib/ops/moments"
import { MODES } from "@/lib/modes"

export const metadata: Metadata = {
  title: "Operations dashboard · Berry",
  description: "Operating KPIs computed from the ledger, the servicing simulator, reconciliation and the work queues: time to funding, cure rate, returns, losses, SLA and cost per loan.",
}

function dashboardData(): DashboardData {
  const src = getMetricSources()
  const filters: LenderFilter[] = ["all", ...MODES]
  return {
    snapshots: Object.fromEntries(
      filters.map((f) => [f, Object.fromEntries(OPS_MOMENTS.map((m) => [m.at, { kpis: computeKpis(src, f, m.at), bottleneck: bottleneck(src, f, m.at)?.text ?? null }]))]),
    ) as DashboardData["snapshots"],
  }
}

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-12 sm:px-8">
      <p className="text-sm font-medium text-muted-ink">Operations · lender view</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Operations dashboard</h1>
      <p className="mt-2 max-w-2xl text-muted-ink">
        How the three lenders are running, computed from the ledger, the servicing simulator, month-end reconciliation and the work queues. Move through the simulation
        to watch it change.
      </p>
      <nav aria-label="Operations" className="mt-4 flex gap-4 text-sm">
        <Link href="/ops" className="text-muted-ink underline-offset-4 hover:underline">
          Console
        </Link>
        <span aria-current="page" className="font-medium">
          Dashboard
        </span>
        <Link href="/ops/loans" className="text-muted-ink underline-offset-4 hover:underline">
          Loan book
        </Link>
      </nav>
      <div className="mt-6">
        <OpsDashboard data={dashboardData()} />
      </div>
    </main>
  )
}
