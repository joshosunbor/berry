import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { decideAll } from "@/lib/engine/decide"
import { Rng } from "@/lib/rng"
import { Applicant, type EngineInput } from "@/lib/schemas"

/*
 * Fairness (CLAUDE.md §4.6): name, age, gender, nationality/immigration
 * status and postal code must not influence outcomes. The engine's input
 * type already excludes them; these tests check it at runtime too, by
 * handing the engine full applicant records with those fields shuffled.
 */

const dir = path.resolve(__dirname, "../data/applicants")
const cast = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => Applicant.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))))

/** Passes the whole record, protected fields included, as if the type guard were bypassed. */
const decideRaw = (a: Applicant) => decideAll(a as unknown as EngineInput)

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

describe("fairness: ignored attributes cannot change a decision", () => {
  const baseline = cast.map(decideRaw)

  it.each([1, 2, 3, 4, 5])("shuffle %i of name, date of birth, gender, nationality, immigration status, postal code and province", (seed) => {
    const rng = new Rng(seed)
    const protectedSets = shuffle(cast.map((a) => a.protected), rng)
    const names = shuffle(cast.map((a) => a.displayName), rng)
    const provinces = shuffle(cast.map((a) => a.province), rng)
    cast.forEach((a, i) => {
      const shuffled: Applicant = { ...a, protected: protectedSets[i], displayName: names[i], province: provinces[i], story: "—" }
      expect(decideRaw(shuffled)).toEqual(baseline[i])
    })
  })

  it("holds for extreme values of every ignored attribute", () => {
    const extremes: Partial<Applicant["protected"]>[] = [
      { dateOfBirth: "1940-01-01" },
      { dateOfBirth: "2007-12-31" },
      { gender: "undisclosed" },
      { nationality: "Not stated" },
      { immigrationStatus: "study_permit" },
      { immigrationStatus: "work_permit" },
      { postalCode: "X0X 0X0" },
    ]
    cast.forEach((a, i) => {
      for (const change of extremes) {
        expect(decideRaw({ ...a, protected: { ...a.protected, ...change } })).toEqual(baseline[i])
      }
    })
  })

  it("the engine source never reads an ignored field", () => {
    const engineDir = path.resolve(__dirname, "../lib/engine")
    const files = readdirSync(engineDir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile() && f.name.endsWith(".ts"))
    for (const f of files) {
      const src = readFileSync(path.join(f.parentPath, f.name), "utf8")
      expect(src, f.name).not.toMatch(/\.protected\b|\.displayName\b|\.province\b|\.story\b|dateOfBirth|nationality|immigrationStatus|postalCode|gender/)
    }
  })
})
