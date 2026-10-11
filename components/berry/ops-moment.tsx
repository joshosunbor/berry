"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { setOpsMoment, useOpsMoment } from "@/components/berry/ops-store"
import { OPS_MOMENTS } from "@/lib/ops/moments"
import { cn } from "@/lib/utils"

/** The simulated moment the operations pages show; shared by the console and the dashboard. */
export function MomentPicker({ className }: { className?: string }) {
  const now = useOpsMoment()
  const i = OPS_MOMENTS.findIndex((m) => m.at === now)
  const step = "inline-flex items-center justify-center rounded-md border border-rule px-2 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor="ops-moment" className="text-xs font-medium text-muted-ink">
        Simulated time
      </label>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" aria-label="Previous moment" disabled={i <= 0} onClick={() => setOpsMoment(OPS_MOMENTS[i - 1].at)} className={step}>
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <select id="ops-moment" value={now} onChange={(e) => setOpsMoment(e.target.value)} className="min-w-0 flex-1 rounded-md border border-rule bg-surface px-2 py-1.5 text-sm">
          {OPS_MOMENTS.map((m) => (
            <option key={m.at} value={m.at}>
              {m.label} · {m.note}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Next moment" disabled={i >= OPS_MOMENTS.length - 1} onClick={() => setOpsMoment(OPS_MOMENTS[i + 1].at)} className={step}>
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  )
}

/** "Oct 6, 2026, 10:05" for a local ops time. */
export function asOfText(at: string) {
  const d = new Date(`${at}:00Z`)
  return `${d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}, ${at.slice(11, 16)}`
}
