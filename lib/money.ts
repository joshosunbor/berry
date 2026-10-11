/**
 * All money in Berry is integer cents (CAD). Never store or add floating-point
 * dollars; convert only at the edges (display, generator input).
 */

export function dollars(amount: number): number {
  return Math.round(amount * 100)
}

export function toDollars(cents: number): number {
  return cents / 100
}

const full = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" })
const whole = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })

export function formatCents(cents: number, opts: { whole?: boolean } = {}): string {
  return (opts.whole ? whole : full).format(cents / 100)
}

/**
 * Rounds amounts in cents to whole dollars for display so the rounded
 * figures add up exactly to the rounded total (largest-remainder method).
 */
export function allocateWholeDollars(amountsCents: number[]): number[] {
  const total = Math.round(amountsCents.reduce((t, c) => t + c, 0) / 100)
  const floors = amountsCents.map((c) => Math.floor(c / 100))
  let remainder = total - floors.reduce((t, f) => t + f, 0)
  const order = amountsCents.map((c, i) => ({ i, frac: c / 100 - Math.floor(c / 100) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  const out = [...floors]
  for (const { i } of order) {
    if (remainder <= 0) break
    out[i]++
    remainder--
  }
  return out
}
