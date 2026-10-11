import { describe, expect, it } from "vitest"
import { edgeCases } from "@/lib/evaluation/edge-cases"
import expected from "@/tests/expected.json"
import { CONFIGS } from "@/lib/engine/config"
import path from "node:path"
import { loadApplicants } from "@/lib/evaluation/load"
import { decideAll } from "@/lib/engine/decide"
import { toEngineInput } from "@/lib/schemas"

const decide = (id: string) => decideAll(toEngineInput(loadApplicants(path.join(process.cwd(), "data/planted")).find((a) => a.slug === `planted-${id}`)!))
const exp = (expected as unknown as { cases: Record<string, Record<string, { outcome: string }>> }).cases

describe("published edge cases", () => {
  const cases = edgeCases()

  it("are the two debatable cases, described in plain words first", () => {
    expect(cases.map((c) => c.id)).toEqual(["b07", "p19"])
    for (const c of cases) {
      expect(c.description).not.toMatch(/\b[bp]\d\d\b/i)
      for (const k of ["engineAnswer", "argumentAgainst", "wouldChange"] as const) expect(c[k].length, `${c.id}.${k}`).toBeGreaterThan(80)
    }
  })

  it("describe what the engine actually does, which still matches the expected outcomes (nothing changed)", () => {
    const b07 = decide("b07")
    expect(b07.bank.outcome).toBe("refer")
    expect(b07.credit_union.outcome).toBe("approve")
    expect(b07.fintech.outcome).toBe("approve")
    expect(exp.b07.bank.outcome).toBe("refer")

    const p19 = decide("p19")
    expect(p19.credit_union.outcome).toBe("approve")
    expect(p19.credit_union.reasons[0].code).toBe("RELATIONSHIP_SUPPORTS_APPROVAL")
    expect(exp.p19.credit_union.outcome).toBe("approve")
  })

  it("p19's coverage sits between Northgate's relationship and standard minimums, as written", () => {
    const t = CONFIGS.credit_union.thresholds
    const p = cases[1]
    const cov = Number(/coverage is (\d\.\d\d)x/.exec(p.engineAnswer)![1])
    expect(cov).toBeGreaterThanOrEqual(t.relationshipMinDscr)
    expect(cov).toBeLessThan(t.minDscr)
    expect(p.engineAnswer).toContain(`${t.minDscr.toFixed(2)}x`)
  })
})
