import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/*
 * Berry must never claim regulatory standing (CLAUDE.md §4A copy rules):
 * no "compliant", "certified" or "approved by" in anything a visitor can
 * read. Scans user-facing source (pages, components, every module that
 * produces customer or lender text) and the JSON content pages render.
 * Code comments are stripped first, so a comment explaining this rule is
 * fine. e2e/smoke.spec.ts checks the rendered pages too.
 */

const BANNED = /\b(compliant|compliance-certified|certified|approved by)\b/i
const root = path.resolve(__dirname, "..")

const USER_FACING = [
  "app",
  "components/berry",
  "lib/engine/reasons.ts",
  "lib/engine/products.ts",
  "lib/engine/fintrac.ts",
  "lib/engine/modes",
  "lib/engine/repayment.ts",
  "lib/engine/aft.ts",
  "lib/labels.ts",
  "lib/feature-display.ts",
  "lib/rules",
  "lib/onboarding",
  "lib/servicing",
  "data/servicing.json",
  "data/institutions",
  "data/regulatory-status.json",
  "data/watchlist.json",
  "public/accuracy.json",
  "tests/accuracy-notes.json",
]

function files(p: string): string[] {
  const full = path.join(root, p)
  if (!existsSync(full)) return []
  if (statSync(full).isFile()) return [full]
  return readdirSync(full, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(tsx?|json)$/.test(e.name))
    .map((e) => path.join(e.parentPath, e.name))
}

/** Removes block comments and whole-line // comments; string contents are kept. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

describe("user-facing copy makes no regulatory claims", () => {
  it("the banned-phrase check itself works", () => {
    expect(BANNED.test("Berry is fully compliant")).toBe(true)
    expect(BANNED.test("Certified by the regulator")).toBe(true)
    expect(BANNED.test("Approved by: Branch Manager")).toBe(true)
    expect(BANNED.test("Sign-off: Branch Manager")).toBe(false)
    expect(BANNED.test(stripComments("// never say compliant\nconst x = 1"))).toBe(false)
    expect(BANNED.test(stripComments('const s = "compliant"'))).toBe(true)
  })

  const all = USER_FACING.flatMap(files)
  it("scans a meaningful set of files", () => {
    expect(all.length).toBeGreaterThan(20)
  })

  it.each(all.map((f) => [path.relative(root, f), f]))("%s", (_rel, f) => {
    const text = f.endsWith(".json") ? readFileSync(f, "utf8") : stripComments(readFileSync(f, "utf8"))
    const match = text.match(BANNED)
    expect(match?.[0] ?? null, match ? `found "${match[0]}"` : "").toBeNull()
  })
})
