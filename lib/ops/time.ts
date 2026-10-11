import { isBusinessDay } from "@/lib/rules/nsf"
import { OPS } from "./config"

/*
 * Business-hours arithmetic for service levels. Times are "YYYY-MM-DDTHH:MM"
 * in the lender's local time; weekdays only, holidays not modelled
 * (illustrative).
 */

const toDate = (t: string) => new Date(`${t}:00Z`)
const fmt = (d: Date) => d.toISOString().slice(0, 16)

/** Moves a time into business hours (start of the next business period if outside). */
export function nextBusinessMoment(t: string, hours = OPS.businessHours): string {
  const d = toDate(t)
  for (let i = 0; i < 30; i++) {
    const day = d.toISOString().slice(0, 10)
    const h = d.getUTCHours() + d.getUTCMinutes() / 60
    if (isBusinessDay(day) && h < hours.end) {
      if (h < hours.start) d.setUTCHours(hours.start, 0, 0, 0)
      return fmt(d)
    }
    d.setUTCDate(d.getUTCDate() + 1)
    d.setUTCHours(hours.start, 0, 0, 0)
  }
  throw new Error("no business moment found")
}

/** Adds working minutes, skipping evenings and weekends. */
export function addBusinessMinutes(t: string, minutes: number, hours = OPS.businessHours): string {
  let at = nextBusinessMoment(t, hours)
  let left = minutes
  for (;;) {
    const d = toDate(at)
    const endOfDay = new Date(d)
    endOfDay.setUTCHours(hours.end, 0, 0, 0)
    const available = (endOfDay.getTime() - d.getTime()) / 60_000
    if (left <= available) return fmt(new Date(d.getTime() + left * 60_000))
    left -= available
    const next = new Date(d)
    next.setUTCDate(next.getUTCDate() + 1)
    next.setUTCHours(hours.start, 0, 0, 0)
    at = nextBusinessMoment(fmt(next), hours)
  }
}

export const addBusinessHours = (t: string, h: number) => addBusinessMinutes(t, Math.round(h * 60))
