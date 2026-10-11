"use client"

import { useSyncExternalStore } from "react"
import { Clock } from "lucide-react"
import { CLOCK_OPTIONS, CLOCK_START } from "@/lib/servicing/views"
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
      <span className="flex items-center gap-1.5 text-sm text-muted-ink">
        <Clock aria-hidden className="size-4" />
        Simulated date: <span className="num font-medium text-ink">{longDate(date)}</span>
      </span>
      <div role="radiogroup" aria-label="Fast-forward the simulation" className="inline-flex rounded-lg border border-rule bg-surface p-1">
        {CLOCK_OPTIONS.map((o) => (
          <button
            key={o.date}
            type="button"
            role="radio"
            aria-checked={date === o.date}
            onClick={() => setClock(o.date)}
            className={cn("rounded-md px-2.5 py-1 text-sm", date === o.date ? "bg-ink text-background" : "text-muted-ink hover:text-ink")}
          >
            <span className="sm:hidden">{o.short}</span>
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
