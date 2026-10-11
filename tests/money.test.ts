import { describe, expect, it } from "vitest"
import { allocateWholeDollars } from "@/lib/money"
import { Rng } from "@/lib/rng"

describe("whole-dollar display rounding", () => {
  it("makes displayed draws add up to the displayed total (the $60,001 case)", () => {
    const cents = [1_315_073, 2_489_058, 1_615_607, 524_656, 55_606] // $60,000.00 in cents
    expect(cents.reduce((t, c) => t + c, 0)).toBe(6_000_000)
    const shown = allocateWholeDollars(cents)
    expect(shown.reduce((t, d) => t + d, 0)).toBe(60_000)
    // Naive rounding would show $60,001.
    expect(cents.map((c) => Math.round(c / 100)).reduce((t, d) => t + d, 0)).toBe(60_001)
    // Each figure moves by less than a dollar.
    shown.forEach((d, i) => expect(Math.abs(d - cents[i] / 100)).toBeLessThan(1))
  })

  it("always sums exactly, for 1,000 random sets", () => {
    const rng = new Rng(60001)
    for (let i = 0; i < 1000; i++) {
      const cents = Array.from({ length: rng.int(1, 8) }, () => rng.int(1, 5_000_000))
      const shown = allocateWholeDollars(cents)
      expect(shown.reduce((t, d) => t + d, 0)).toBe(Math.round(cents.reduce((t, c) => t + c, 0) / 100))
    }
  })
})
