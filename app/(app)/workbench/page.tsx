import type { Metadata } from "next"
import { ApplicantGrid, type ApplicantCard } from "@/components/berry/applicant-grid"
import { ModeSwitcher } from "@/components/berry/mode-context"
import { getCast } from "@/lib/data"
import { INCOME_LABELS, PRODUCT_LABELS } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODES } from "@/lib/modes"

export const metadata: Metadata = {
  title: "Workbench · Berry",
  description: "Synthetic applicants, each decided by a credit union, a fintech and a bank.",
}

export default function WorkbenchPage() {
  const cast = getCast()
  const cards: ApplicantCard[] = cast.map(({ applicant: a, features: f, decisions }) => ({
    slug: a.slug,
    name: a.displayName,
    story: a.story,
    kind: a.kind,
    product: PRODUCT_LABELS[a.request.product],
    amount: formatCents(a.request.amountCents, { whole: true }),
    incomeType: f.income.type,
    incomeLabel: INCOME_LABELS[f.income.type],
    outcomes: Object.fromEntries(
      MODES.map((m) => [m, { outcome: decisions[m].outcome, limit: decisions[m].limitCents ? formatCents(decisions[m].limitCents, { whole: true }) : null }]),
    ) as ApplicantCard["outcomes"],
  }))
  const incomeTypes = [...new Set(cast.map((c) => c.features.income.type))].map((t) => ({ value: t, label: INCOME_LABELS[t] }))

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-12 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Workbench</h1>
          <p className="mt-2 max-w-xl text-muted-ink">
            {cast.length} synthetic applicants, each decided by three fictional lenders. Pick a lender to highlight its answers, or open a file to
            see why.
          </p>
        </div>
        <ModeSwitcher />
      </div>
      <div className="mt-8">
        <ApplicantGrid cards={cards} incomeTypes={incomeTypes} />
      </div>
    </main>
  )
}
