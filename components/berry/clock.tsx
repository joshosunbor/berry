"use client"

import { useSyncExternalStore } from "react"
import { Clock } from "lucide-react"
import { CLOCK_OPTIONS, CLOCK_START } from "@/lib/servicing/views"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"

/*
 * The simulator's clock: which date the servicing pages show. Remembered
 * per browser (a convenience); server render and first paint use funding day.
 */

const KEY = "berry.clock.v1"
const listeners = new Set<() => void>()
const VALID = new Set<string>(CLOCK_OPTIONS.map((o) => o.date))

function read(): string {
  try {
    const v = localStorage.getItem(KEY)
    return v && VALID.has(v) ? v : CLOCK_START
  } catch {
    return CLOCK_START
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

export function useClock(): string {
  return useSyncExternalStore(subscribe, read, () => CLOCK_START)
}

function setClock(date: string) {
  try {
    localStorage.setItem(KEY, date)
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })

export function ClockControl({ className }: { className?: string }) {
  const date = useClock()
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <span className="flex items-center gap-1.5 text-sm text-fg-3">
        <Clock aria-hidden className="size-4" />
        Simulated date: <span className="num font-medium text-fg">{longDate(date)}</span>
      </span>
      <SegmentedControl
        kind="radio"
        size="sm"
        label="Fast-forward the simulation"
        value={date}
        onChange={setClock}
        options={CLOCK_OPTIONS.map((o) => ({
          value: o.date,
          label: (
            <>
              <span className="sm:hidden">{o.short}</span>
              <span className="hidden sm:inline">{o.label}</span>
            </>
          ),
        }))}
      />
    </div>
  )
}
