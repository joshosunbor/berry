/*
 * Days the Canadian clearing systems don't process payments (illustrative).
 *
 * Berry treats these federal holidays as non-processing days: New Year's
 * Day, Good Friday, Victoria Day, Canada Day, Labour Day, Thanksgiving,
 * Remembrance Day, Christmas Day and Boxing Day. A holiday on a weekend is
 * observed on the next weekday (and Boxing Day after an observed
 * Christmas). Provincial holidays such as Family Day, the Civic Holiday and
 * Saint-Jean-Baptiste are processing days.
 *
 * Illustrative: Payments Canada's own holiday calendar for 2026–2027 could
 * not be read, so this follows the commonly published federal list rather
 * than an official schedule. Listed under Limitations on How it works.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

/** Easter Sunday (Gregorian), by the anonymous Meeus/Jones/Butcher algorithm. */
function easter(y: number): Date {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return utc(y, month, day)
}

/** The nth weekday (0 = Sunday) of a month. */
function nthWeekday(y: number, month: number, weekday: number, n: number): Date {
  const first = utc(y, month, 1)
  const offset = (weekday - first.getUTCDay() + 7) % 7
  return utc(y, month, 1 + offset + (n - 1) * 7)
}

/** The Monday before 25 May. */
function victoriaDay(y: number): Date {
  const d = utc(y, 5, 24)
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1)
  return d
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6

/** Moves a holiday off the weekend, and past any day already taken. */
function observed(d: Date, taken: Set<string>): Date {
  let o = d
  while (isWeekend(o) || taken.has(iso(o))) o = addDays(o, 1)
  return o
}

const cache = new Map<number, Set<string>>()

/** Non-processing days in a year, as "YYYY-MM-DD". */
export function nonProcessingDays(y: number): Set<string> {
  const hit = cache.get(y)
  if (hit) return hit
  const days = new Set<string>()
  const add = (d: Date, moves = true) => days.add(iso(moves ? observed(d, days) : d))
  add(utc(y, 1, 1))
  add(addDays(easter(y), -2), false)
  add(victoriaDay(y), false)
  add(utc(y, 7, 1))
  add(nthWeekday(y, 9, 1, 1), false)
  add(nthWeekday(y, 10, 1, 2), false)
  add(utc(y, 11, 11))
  add(utc(y, 12, 25))
  add(utc(y, 12, 26))
  cache.set(y, days)
  return days
}

export function isNonProcessingDay(date: string): boolean {
  return nonProcessingDays(Number(date.slice(0, 4))).has(date)
}
