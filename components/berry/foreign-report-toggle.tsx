"use client"

import { useState } from "react"
import { ModeChip } from "@/components/berry/mode-chip"
import { OutcomeChip } from "@/components/berry/outcome-chip"
import { formatCents } from "@/lib/money"
import { MODES, MODE_META, type Mode } from "@/lib/modes"
import type { Decision } from "@/lib/schemas"
import { cn } from "@/lib/utils"

export function ForeignReportToggle({ withReport, withoutReport }: { withReport: Record<Mode, Decision>; withoutReport: Record<Mode, Decision> }) {
  const [on, setOn] = useState(true)
  const decisions = on ? withReport : withoutReport
  return (
    <div className="rounded-lg border border-rule bg-surface p-5">
      <label className="flex items-center gap-3 text-sm font-medium">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => setOn(!on)}
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-approve" : "bg-muted ring-1 ring-rule")}
        >
          <span className={cn("absolute left-0 top-0.5 size-5 rounded-full bg-surface shadow-soft transition-transform", on ? "translate-x-5" : "translate-x-0.5")} />
        </button>
        Foreign credit report available? <span className="font-normal text-muted-ink">{on ? "Yes" : "No"}</span>
      </label>
      <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-live="polite">
        {MODES.map((m) => {
          const d = decisions[m]
          const ok = d.outcome === "approve" || d.outcome === "approve_with_conditions"
          return (
            <div key={m} className={cn("rounded-md border-t-4 bg-background p-4", MODE_META[m].classes.border)}>
              <ModeChip mode={m} />
              <div className="mt-2">
                <OutcomeChip outcome={d.outcome} />
              </div>
              <p className="num mt-1 text-xl font-semibold">{ok ? formatCents(d.limitCents, { whole: true }) : "No offer"}</p>
              <p className="mt-2 text-sm leading-6 text-muted-ink">{d.reasons[0]?.customerText}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
