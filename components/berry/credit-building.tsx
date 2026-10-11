"use client"

import { CheckCircle2, Circle, Sprout } from "lucide-react"
import { useClock } from "@/components/berry/clock"
import { Illustrative } from "@/components/berry/illustrative"
import { useMode } from "@/components/berry/mode-context"
import { MODE_META } from "@/lib/modes"
import { milestones } from "@/lib/servicing/credit-building"
import type { LoanSummary } from "@/lib/servicing/views"
import { cn } from "@/lib/utils"

/** The thin-file credit-building path: starter limit plus milestones, with progress from the simulated loan. */
export function CreditBuildingCard({ loans }: { loans: LoanSummary[] }) {
  const { mode } = useMode()
  const date = useClock()
  const loan = loans.find((l) => l.mode === mode)
  const offeredBy = loans.map((l) => MODE_META[l.mode].institution)

  return (
    <section aria-labelledby="credit-building" className="rounded-lg border border-rule bg-surface p-5">
      <h2 id="credit-building" className="flex items-center gap-2 font-semibold">
        <Sprout aria-hidden className="size-4 text-approve" />
        Credit-building path
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-ink">
        A thin Canadian credit file, and no foreign credit report to bring in: the starter limit and these milestones fill the gap foreign credit reports
        don&apos;t cover.
      </p>
      {loan ? (
        <ul className="mt-4 space-y-4">
          {milestones(loan.snapshots[date]).map((m) => (
            <li key={m.label} className="text-sm">
              <p className="flex items-center gap-2 font-medium">
                {m.reached ? <CheckCircle2 aria-hidden className="size-4 text-approve" /> : <Circle aria-hidden className="size-4 text-muted-ink" />}
                {m.label} <span className="font-normal text-muted-ink">→ {m.detail}</span>
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-muted" aria-hidden>
                  <div className={cn("h-full rounded-full", m.reached ? "bg-approve" : "bg-ink")} style={{ width: `${(m.progress / m.target) * 100}%` }} />
                </div>
                <span className="num text-xs text-muted-ink">
                  {m.progress} of {m.target}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm">
          {MODE_META[mode].institution} made no offer. {offeredBy.length ? `Starter credit is available from ${offeredBy.join(" and ")}.` : ""}
        </p>
      )}
      <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-ink">
        <Illustrative /> Milestones and limits are illustrative; progress comes from the simulated loan at the date chosen on the Servicing tab.
      </p>
    </section>
  )
}
