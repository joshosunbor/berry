import type { Metadata } from "next"
import { PageContainer, PageHeader } from "@/components/ui/page-header"
import { SectionNav } from "@/components/site/section-nav"
import { OpsDashboard, type DashboardData } from "@/components/berry/ops-dashboard"
import { getMetricSources } from "@/lib/data"
import { bottleneck, computeKpis, type LenderFilter } from "@/lib/ops/metrics"
import { OPS_MOMENTS } from "@/lib/ops/moments"
import { MODES } from "@/lib/modes"

export const metadata: Metadata = {
  title: "Dashboard · Operations",
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
    <PageContainer>
      <PageHeader breadcrumb={[{ label: "Demo", href: "/demo" }, { label: "Operations", href: "/operations" }, { label: "Dashboard" }]} title="Operations dashboard" lead="How the three lenders are running, computed from the ledger, the servicing simulator, month-end reconciliation and the work queues. Move through the simulation to watch it change.">
        <SectionNav section="operations" />
      </PageHeader>
      <div>
        <OpsDashboard data={dashboardData()} />
      </div>
    </PageContainer>
  )
}
