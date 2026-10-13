import type { Metadata } from "next"
import { PageContainer, PageHeader } from "@/components/ui/page-header"
import { SectionNav } from "@/components/site/section-nav"
import { OpsConsole } from "@/components/berry/ops-console"
import { getAuditEvents, getOpsEventItems, getOpsItems } from "@/lib/data"

export const metadata: Metadata = {
  title: "Operations",
  description: "Work queues with service levels, maker-checker approvals, delegated authority and an append-only audit trail, fed by the simulation\u2019s open items.",
}

export default function OperationsPage() {
  return (
    <PageContainer>
      <PageHeader breadcrumb={[{ label: "Demo", href: "/demo" }, { label: "Operations" }]} title="Operations" lead="Every item here comes from something real in the files: a verification check that needs review, a large cash deposit, a sign-off, a returned payment, a reconciliation break, a hardship request or a payee to confirm. A small fictional team works them in business hours.">
        <SectionNav section="operations" />
      </PageHeader>
      <div>
        <OpsConsole items={getOpsItems()} events={getAuditEvents()} eventItems={getOpsEventItems()} />
      </div>
    </PageContainer>
  )
}
