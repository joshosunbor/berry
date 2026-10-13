import type { Metadata } from "next"
import { CanadianRules } from "@/components/how-it-works/canadian-rules"
import { HowItDecides } from "@/components/how-it-works/how-it-decides"
import { HowItWorksTabs } from "@/components/how-it-works/how-it-works-tabs"
import { TestResults } from "@/components/how-it-works/test-results"
import { PageContainer, PageHeader } from "@/components/ui/page-header"

export const metadata: Metadata = {
  title: "How it works",
  description: "How Berry decides, its published test results on planted cases, and the Canadian rules it uses with their current status.",
}

export default function HowItWorksPage() {
  return (
    <PageContainer className="max-w-[1000px]">
      <PageHeader
        breadcrumb={[{ label: "Demo", href: "/demo" }, { label: "How it works" }]}
        title="How it works"
        lead="Every decision is made by deterministic rules that are unit tested. The same file always gets the same answer, and every answer is explained in plain language. AI never sets a limit, a price or an approval."
      />
      <HowItWorksTabs panels={{ "how-it-decides": <HowItDecides />, "test-results": <TestResults />, "canadian-rules": <CanadianRules /> }} />
    </PageContainer>
  )
}
