import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { evaluate } from "@/lib/evaluation/accuracy"
import { loadApplicants } from "@/lib/evaluation/load"
import { generatePlanted } from "@/scripts/generators/planted"
import { Applicant } from "@/lib/schemas"

const root = path.resolve(__dirname, "..")
const read = (p: string) => JSON.parse(readFileSync(path.join(root, p), "utf8"))
const planted = loadApplicants(path.join(root, "data/planted"))
const report = evaluate(planted, read("tests/expected.json"), read("tests/accuracy-notes.json"))

describe("planted-case accuracy", () => {
  it("has at least 30 planted cases, each with an expectation", () => {
    expect(planted.length).toBeGreaterThanOrEqual(30)
    expect(Object.keys(read("tests/expected.json").cases).sort()).toEqual(planted.map((a) => a.slug.replace("planted-", "")).sort())
  })

  it("committed planted data matches the generator", () => {
    expect(planted).toEqual(generatePlanted().map((a) => Applicant.parse(a)).sort((a, b) => a.slug.localeCompare(b.slug)))
  })

  it("public/accuracy.json is up to date (run npm run accuracy)", () => {
    expect(read("public/accuracy.json")).toEqual(JSON.parse(JSON.stringify(report)))
  })

  it("explains every miss", () => {
    for (const miss of report.misses) expect(miss.note, `${miss.id}/${miss.mode} needs a note in tests/accuracy-notes.json`).toBeTruthy()
  })

  it("the engine never reads the expected outcomes", () => {
    const engineDir = path.join(root, "lib/engine")
    for (const f of readdirSync(engineDir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())) {
      expect(readFileSync(path.join(f.parentPath, f.name), "utf8"), f.name).not.toMatch(/expected\.json|accuracy-notes|lib\/evaluation/)
    }
  })
})
