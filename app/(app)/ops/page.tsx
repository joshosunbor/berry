import type { Metadata } from "next"
import { PageContainer, PageHeader } from "@/components/ui/page-header"
import { OPS_NAV, SubNav } from "@/components/ui/sub-nav"
import { OpsConsole } from "@/components/berry/ops-console"
import { getAuditEvents, getOpsEventItems, getOpsItems } from "@/lib/data"

export const metadata: Metadata = {
  title: "Operations console · Berry",
  description: "Work queues with service levels, maker-checker approvals, delegated authority and an append-only audit trail, fed by real open items.",
}

export default function OpsPage() {
  return (
    <PageContainer>
      <PageHeader breadcrumb={[{ label: "Operations", href: "/ops" }, { label: "Console" }]} title="Operations console" lead="Every item here comes from something real in the files: a verification check that needs review, a large cash deposit, a sign-off, a returned payment, a reconciliation break, a hardship request or a payee to confirm. A small fictional team works them in business hours.">
        <SubNav label="Operations" items={OPS_NAV} current="/ops" />
      </PageHeader>
      <div>
        <OpsConsole items={getOpsItems()} events={getAuditEvents()} eventItems={getOpsEventItems()} />
      </div>
    </PageContainer>
  )
}
