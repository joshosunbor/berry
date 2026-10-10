/** Date helpers on plain `YYYY-MM-DD` strings, computed in UTC to avoid DST drift. */

export function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

export function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = parse(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fmt(d)
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return parse(date).getUTCDay()
}

export function isWeekend(date: string): boolean {
  const d = dayOfWeek(date)
  return d === 0 || d === 6
}

/** Same day if a weekday, otherwise the following Monday. */
export function nextWeekday(date: string): string {
  let d = date
  while (isWeekend(d)) d = addDays(d, 1)
  return d
}

export function eachDay(start: string, end: string): string[] {
  const days: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return days
}

/** First day of every month that overlaps [start, end], as `YYYY-MM-01`. */
export function eachMonth(start: string, end: string): string[] {
  const months: string[] = []
  let d = `${start.slice(0, 7)}-01`
  while (d <= end) {
    months.push(d)
    const p = parse(d)
    p.setUTCMonth(p.getUTCMonth() + 1)
    d = fmt(p)
  }
  return months
}

/** Calendar month number, 1–12. */
export function monthOf(date: string): number {
  return Number(date.slice(5, 7))
}

export function daysInMonth(monthStart: string): number {
  const p = parse(monthStart)
  return new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + 1, 0)).getUTCDate()
}

/** The given day of the month, clamped to the month's length. */
export function dayInMonth(monthStart: string, day: number): string {
  const d = Math.min(day, daysInMonth(monthStart))
  return `${monthStart.slice(0, 8)}${String(d).padStart(2, "0")}`
}

export function within(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}
