"use client"

import { useMemo, useState } from "react"
import { Briefcase, User } from "lucide-react"
import { useMode } from "@/components/berry/mode-context"
import { OutcomeChip } from "@/components/berry/outcome-chip"
import { CardLink } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Select } from "@/components/ui/field"
import { LenderDot, Pill } from "@/components/ui/pill"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { MODES, MODE_META, type Mode } from "@/lib/modes"
import type { Outcome } from "@/lib/schemas"
import { cn } from "@/lib/utils"

export interface ApplicantCard {
  slug: string
  name: string
  story: string
  kind: "personal" | "business"
  product: string
  amount: string
  incomeType: string
  incomeLabel: string
  outcomes: Record<Mode, { outcome: Outcome; limit: string | null }>
}

type KindFilter = "all" | "personal" | "business"

export function ApplicantGrid({ cards, incomeTypes }: { cards: ApplicantCard[]; incomeTypes: { value: string; label: string }[] }) {
  const { mode } = useMode()
  const [kind, setKind] = useState<KindFilter>("all")
  const [income, setIncome] = useState("all")
  const shown = useMemo(() => cards.filter((c) => (kind === "all" || c.kind === kind) && (income === "all" || c.incomeType === income)), [cards, kind, income])

  return (
    <>
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Filters">
        <SegmentedControl
          kind="radio"
          label="Applicant type"
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All" },
            { value: "personal", label: "Personal" },
            { value: "business", label: "Business" },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-fg-3">
          Income
          <Select value={income} onChange={(e) => setIncome(e.target.value)}>
            <option value="all">All types</option>
            {incomeTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
        <p className="num ml-auto text-sm text-fg-3" aria-live="polite">
          {shown.length} of {cards.length} applicants
        </p>
      </div>

      <ul aria-label="Applicants" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <li key={c.slug}>
            <CardLink href={`/workbench/${c.slug}`} className="group h-full gap-0 p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-[-0.01em] group-hover:underline">{c.name}</h2>
                <Pill tone="neutral" className="font-medium">
                  {c.kind === "business" ? <Briefcase aria-hidden className="size-3" /> : <User aria-hidden className="size-3" />}
                  {c.kind === "business" ? "Business" : "Personal"}
                </Pill>
              </div>
              <p className="mt-2 text-sm leading-6 text-fg-2">{c.story}</p>
              <p className="mt-3 text-sm">
                <span className="font-semibold">{c.product}</span> <span className="num text-fg-3">· {c.amount}</span>
                <span className="text-fg-3"> · {c.incomeLabel}</span>
              </p>
              <dl className="mt-auto space-y-1 border-t border-line pt-4">
                {MODES.map((m) => (
                  <div key={m} className={cn("flex items-center justify-between gap-2 rounded-[8px] px-2 py-1.5", m === mode && MODE_META[m].classes.soft)}>
                    <dt className={cn("flex items-center gap-2 text-xs font-medium", m === mode ? MODE_META[m].classes.fg : "text-fg-3")}>
                      <LenderDot mode={m} className="size-2" />
                      {MODE_META[m].institution}
                    </dt>
                    <dd className="flex items-center gap-2">
                      {c.outcomes[m].limit && <span className="num text-xs text-fg-2">{c.outcomes[m].limit}</span>}
                      <OutcomeChip outcome={c.outcomes[m].outcome} short />
                    </dd>
                  </div>
                ))}
              </dl>
            </CardLink>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <EmptyState title="No applicants match these filters." className="mt-8" />}
    </>
  )
}
