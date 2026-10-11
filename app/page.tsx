import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { HeroComparison, type HeroColumn } from "@/components/berry/hero-comparison"
import { getApplicant } from "@/lib/data"
import { PRODUCT_LABELS, STRUCTURE_LABELS } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODES } from "@/lib/modes"

// The hero shows the engine's real decisions for Hollis Family Farm. The rest
// of the landing page (lifecycle strip, operations, Built for Canada) comes later.

export default function Home() {
  const hollis = getApplicant("hollis-family-farm")!
  const columns: HeroColumn[] = MODES.map((m) => {
    const d = hollis.decisions[m]
    const ok = d.outcome === "approve" || d.outcome === "approve_with_conditions"
    return {
      mode: m,
      outcome: d.outcome,
      amount: ok ? formatCents(d.limitCents, { whole: true }) : null,
      product: ok ? (d.structure === "seasonal_operating" ? `${PRODUCT_LABELS[d.product]}, ${STRUCTURE_LABELS.seasonal_operating.split(": ")[1]}` : PRODUCT_LABELS[d.product]) : null,
      reason: d.reasons[0].customerText,
    }
  })

  return (
    <main>
      <section className="bg-ledger relative overflow-hidden">
        <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-display">One applicant. Three lenders. Three different answers.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-ink">
            Berry shows how credit unions, banks and fintechs read the same cash flow differently, and explains every decision.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/workbench" className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-background hover:bg-ink/90">
              Try the workbench
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="/compare/hollis-family-farm" className="inline-flex items-center gap-2 rounded-md border border-rule bg-surface px-5 py-2.5 text-sm font-medium hover:border-ink/30">
              See how it decides
            </Link>
          </div>
          <div className="mt-12">
            <HeroComparison name={hollis.applicant.displayName} story={hollis.applicant.story} columns={columns} />
          </div>
        </div>
      </section>
    </main>
  )
}
