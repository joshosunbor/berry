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
