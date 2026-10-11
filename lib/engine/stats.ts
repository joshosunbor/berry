export function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0)
}

export function mean(values: number[]): number {
  return values.length ? sum(values) / values.length : 0
}

export function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Population standard deviation. */
export function stdev(values: number[]): number {
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

/** Coefficient of variation (stdev / mean). 0 when the mean is 0 or negative. */
export function cv(values: number[]): number {
  const m = mean(values)
  return m > 0 ? stdev(values) / m : 0
}

/** Rounds to 2 decimal places, for ratios shown to people and stored as evidence. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100
}
