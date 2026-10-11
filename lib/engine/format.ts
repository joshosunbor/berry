/** Formatting for explanation text. Engine maths never uses these. */

const whole = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })

export const money = (cents: number) => whole.format(Math.round(cents / 100))
export const pct = (ratio: number) => `${Math.round(ratio * 100)}%`
export const times = (ratio: number) => `${ratio.toFixed(2)}x`
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
export const monthName = (m: number) => MONTHS[m - 1]
/** "September to November" for a run of calendar months. */
export const monthRange = (months: number[]) => (months.length > 1 ? `${monthName(months[0])} to ${monthName(months[months.length - 1])}` : monthName(months[0]))
