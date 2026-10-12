import type { Metadata } from "next"
import { ApplyFlow, type ProfileOption } from "@/components/berry/apply-flow"
import { getCast } from "@/lib/data"

export const metadata: Metadata = {
  title: "Apply · Berry",
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
    <main className="mx-auto max-w-[960px] px-4 py-12 sm:px-8">
      <p className="text-sm font-medium text-muted-ink">Apply</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Apply in a few minutes</h1>
      <p className="mt-2 max-w-2xl text-muted-ink">
        Walk through a full application as a synthetic applicant: consent to share data, identity checks, your request, and an answer from three fictional
        lenders. Your progress is saved in this browser so you can come back to it.
      </p>
      <div className="mt-10">
        <ApplyFlow profiles={profiles} />
      </div>
    </main>
  )
}
