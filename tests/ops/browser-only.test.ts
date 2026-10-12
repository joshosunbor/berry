import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { BROWSER_ONLY_NOTICE, BROWSER_ONLY_SHORT } from "@/lib/ops/copy"

describe("the console says browser decisions stay local", () => {
  it("states plainly that they don't change the simulation", () => {
    expect(BROWSER_ONLY_NOTICE).toMatch(/hardship/i)
    expect(BROWSER_ONLY_NOTICE).toMatch(/this browser only/i)
    expect(BROWSER_ONLY_NOTICE).toMatch(/don't change the simulation/i)
    expect(BROWSER_ONLY_SHORT).toMatch(/won't change/i)
  })

  it("shows the notice under the toolbar and next to every approve or reject", () => {
    const src = readFileSync(path.resolve(import.meta.dirname, "../../components/berry/ops-console.tsx"), "utf8")
    expect(src).toContain("{BROWSER_ONLY_NOTICE}")
    expect(src).toContain("{BROWSER_ONLY_SHORT}")
  })
})
