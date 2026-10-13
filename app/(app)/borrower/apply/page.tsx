import type { Metadata } from "next"
import { ApplyFlow, type ProfileOption } from "@/components/berry/apply-flow"
import { PageContainer, PageHeader } from "@/components/ui/page-header"
import { SectionNav } from "@/components/site/section-nav"
import { getCast } from "@/lib/data"

export const metadata: Metadata = {
  title: "Apply · Borrower view",
  description: "Apply as a synthetic applicant: consent, verification, request, and a decision from three lenders.",
}

export default function ApplyPage() {
  const profiles: ProfileOption[] = getCast().map(({ applicant: a }) => ({
    slug: a.slug,
    name: a.displayName,
    story: a.story,
    kind: a.kind,
    province: a.province,
    business: a.business ? { legalName: a.business.legalName, industry: a.business.industry, yearsOperating: a.business.yearsOperating, employees: a.business.employees } : null,
    request: a.request,
  }))
  return (
    <PageContainer className="max-w-[960px]">
      <PageHeader
        breadcrumb={[{ label: "Demo", href: "/demo" }, { label: "Borrower view", href: "/borrower/apply" }, { label: "Apply" }]}
        title="Apply in a few minutes"
        lead="Walk through a full application as a synthetic applicant: consent to share data, identity checks, your request, and an answer from three fictional lenders. Your progress is saved in this browser so you can come back to it."
      >
        <SectionNav section="borrower" />
      </PageHeader>
      <ApplyFlow profiles={profiles} />
    </PageContainer>
  )
}
