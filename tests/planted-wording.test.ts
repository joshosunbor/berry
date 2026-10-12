import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import fixture from "./fixtures/planted-fingerprint.json"
import { plantedFingerprint } from "./planted-fingerprint"

const root = path.resolve(import.meta.dirname, "..")
const planted = readdirSync(path.join(root, "data/planted")).filter((f) => f.endsWith(".json"))
const story = (id: string) => JSON.parse(readFileSync(path.join(root, `data/planted/planted-${id}.json`), "utf8")).story as string

describe("planted case wording", () => {
  it("names Northgate's $50,000 tier as the Lending officer tier", () => {
    expect(story("b01")).toContain("Lending officer tier")
    expect(story("b02")).toContain("Lending officer tier")
  })

  it("never calls it the Lender tier in stories, expectations or the generator", () => {
    const files = [...planted.map((f) => `data/planted/${f}`), "tests/expected.json", "scripts/generators/planted.ts", "public/accuracy.json"]
    for (const f of files) expect(readFileSync(path.join(root, f), "utf8"), f).not.toMatch(/Lender tier/)
  })

  it("leaves every input, expected outcome, decision, limit and reason unchanged", () => {
    // Refresh tests/fixtures/planted-fingerprint.json from plantedFingerprint() only for an intended policy or data change.
    expect(plantedFingerprint()).toEqual(fixture)
  })
})
