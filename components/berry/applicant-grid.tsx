"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Briefcase, User } from "lucide-react"
import { useMode } from "@/components/berry/mode-context"
import { OutcomeChip } from "@/components/berry/outcome-chip"
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
        <div className="inline-flex rounded-lg border border-rule bg-surface p-1" role="radiogroup" aria-label="Applicant type">
          {(["all", "personal", "business"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn("rounded-md px-3 py-1.5 text-sm capitalize", kind === k ? "bg-ink text-background" : "text-muted-ink hover:text-ink")}
            >
              {k}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-ink">
          Income
          <select
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            className="rounded-lg border border-rule bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="all">All types</option>
            {incomeTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <p className="num ml-auto text-sm text-muted-ink" aria-live="polite">
          {shown.length} of {cards.length} applicants
        </p>
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/workbench/${c.slug}`}
              className="group flex h-full flex-col rounded-lg border border-rule bg-surface p-5 shadow-soft transition-colors hover:border-ink/30"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold group-hover:underline">{c.name}</h2>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-ink">
                  {c.kind === "business" ? <Briefcase aria-hidden className="size-3" /> : <User aria-hidden className="size-3" />}
                  {c.kind === "business" ? "Business" : "Personal"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-ink">{c.story}</p>
              <p className="mt-3 text-sm">
                <span className="font-medium">{c.product}</span> <span className="num text-muted-ink">· {c.amount}</span>
                <span className="text-muted-ink"> · {c.incomeLabel}</span>
              </p>
              <dl className="mt-auto space-y-1.5 border-t border-rule pt-4">
                {MODES.map((m) => (
                  <div key={m} className={cn("flex items-center justify-between gap-2 rounded-md px-2 py-1", m === mode && MODE_META[m].classes.soft)}>
                    <dt className={cn("text-xs font-medium", m === mode ? MODE_META[m].classes.fg : "text-muted-ink")}>{MODE_META[m].institution}</dt>
                    <dd className="flex items-center gap-2">
                      {c.outcomes[m].limit && <span className="num text-xs text-muted-ink">{c.outcomes[m].limit}</span>}
                      <OutcomeChip outcome={c.outcomes[m].outcome} short />
                    </dd>
                  </div>
                ))}
              </dl>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="mt-8 text-muted-ink">No applicants match these filters.</p>}
    </>
  )
}
