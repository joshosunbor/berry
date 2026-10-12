"use client"

import { useState } from "react"
import { ModeChip } from "@/components/berry/mode-chip"
import { OutcomeChip } from "@/components/berry/outcome-chip"
import { formatCents } from "@/lib/money"
import { MODES, MODE_META, type Mode } from "@/lib/modes"
import type { Decision } from "@/lib/schemas"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

export function ForeignReportToggle({ withReport, withoutReport }: { withReport: Record<Mode, Decision>; withoutReport: Record<Mode, Decision> }) {
  const [on, setOn] = useState(true)
  const decisions = on ? withReport : withoutReport
  return (
    <Card>
      <label className="flex items-center gap-3 text-sm font-semibold text-fg">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => setOn(!on)}
          className={cn("relative h-6 w-11 shrink-0 rounded-full shadow-inset-line-strong transition-colors", on ? "bg-green" : "bg-field")}
        >
          <span className={cn("absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[1.375rem]" : "translate-x-0.5")} />
        </button>
        Foreign credit report available? <span className="font-normal text-fg-3">{on ? "Yes" : "No"}</span>
      </label>
      <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-live="polite">
        {MODES.map((m) => {
          const d = decisions[m]
          const ok = d.outcome === "approve" || d.outcome === "approve_with_conditions"
          return (
            <div key={m} className={cn("rounded-[10px] border-t-4 bg-panel-alt p-4 shadow-inset-line", MODE_META[m].classes.border)}>
              <ModeChip mode={m} />
              <div className="mt-2">
                <OutcomeChip outcome={d.outcome} />
              </div>
              <p className="num mt-1 text-xl font-semibold text-fg">{ok ? formatCents(d.limitCents, { whole: true }) : "No offer"}</p>
              <p className="mt-2 text-sm leading-6 text-fg-2">{d.reasons[0]?.customerText}</p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
