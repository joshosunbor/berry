import type { Metadata } from "next"
import { ConsentDashboard } from "@/components/berry/consent-dashboard"
import { PageContainer, PageHeader } from "@/components/ui/page-header"

export const metadata: Metadata = {
  title: "Your consents · Berry",
  description: "Every data-sharing consent you've given in Berry, with expiry dates, one-click revoke and a log.",
}

export default function ConsentsPage() {
  return (
    <PageContainer className="max-w-[960px]">
      <PageHeader
        breadcrumb={[{ label: "Apply", href: "/apply" }, { label: "Your consents" }]}
        title="Your consents"
        lead="Who can read your banking data, what they can read, and until when. Built around the draft framework's consent principles. Stored in this browser only."
      />
      <ConsentDashboard />
    </PageContainer>
  )
}
