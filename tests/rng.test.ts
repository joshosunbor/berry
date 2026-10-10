import { describe, expect, it } from "vitest"
import { Rng, hashSeed } from "@/lib/rng"

describe("seeded rng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = new Rng(42)
    const b = new Rng(42)
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()))
  })
  it("produces different sequences for different seeds", () => {
    expect(new Rng(1).next()).not.toEqual(new Rng(2).next())
  })
  it("keeps values in range", () => {
    const r = new Rng(7)
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 9)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(9)
    }
  })
  it("hashes strings to stable seeds", () => {
    expect(hashSeed("berry:priya")).toBe(hashSeed("berry:priya"))
    expect(hashSeed("berry:priya")).not.toBe(hashSeed("berry:sofia"))
  })
})
