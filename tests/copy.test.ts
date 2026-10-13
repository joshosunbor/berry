import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/*
 * Berry must never claim regulatory standing (CLAUDE.md §4A copy rules):
 * no "compliant", "certified" or "approved by", no promised outcomes
 * ("guaranteed", "would have repaid") and no claim of real customers or
 * pilots in anything a visitor can read. Scans user-facing source (pages, components, every module that
 * produces customer or lender text) and the JSON content pages render.
 * Code comments are stripped first, so a comment explaining this rule is
 * fine. e2e/smoke.spec.ts checks the rendered pages too.
 */

const BANNED = /\b(compliant|compliance-certified|certified|approved by|guaranteed|would have repaid|trusted by|our partners?|our (customers|clients)|customers include|(live|paid|current) pilots?|pilot (customers|clients)|in production (at|with))\b|(?<!\bnot )\baccredited\b/i
const root = path.resolve(__dirname, "..")

const USER_FACING = [
  "app",
  "content",
  "lib/landing",
  "components/berry",
  "components/landing",
  "components/site",
  "components/how-it-works",
  "components/tour",
  "lib/ops",
  "lib/engine/reasons.ts",
  "lib/engine/products.ts",
  "lib/engine/fintrac.ts",
  "lib/engine/modes",
  "lib/engine/repayment.ts",
  "lib/engine/aft.ts",
  "lib/labels.ts",
  "lib/memo/facts.ts",
  "lib/memo/template.ts",
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
    // Implied standing or customers.
    expect(BANNED.test("Trusted by 40 credit unions")).toBe(true)
    expect(BANNED.test("Berry is accredited under the framework")).toBe(true)
    expect(BANNED.test("Berry is not accredited")).toBe(false)
    expect(BANNED.test("Built with our partners")).toBe(true)
    // Promised outcomes, and real customers or pilots.
    expect(BANNED.test("Approval is guaranteed")).toBe(true)
    expect(BANNED.test("borrowers who would have repaid")).toBe(true)
    expect(BANNED.test("who could likely have repaid")).toBe(false)
    expect(BANNED.test("Credit Union Deposit Guarantee Corporation")).toBe(false)
    expect(BANNED.test("Used by our customers")).toBe(true)
    expect(BANNED.test("Three live pilots with credit unions")).toBe(true)
    expect(BANNED.test("In production at a credit union")).toBe(true)
    expect(BANNED.test("This is how I'd run a pilot with a lender.")).toBe(false)
  })

  it("covers the landing page and site chrome", () => {
    for (const dir of ["components/landing", "components/site", "lib/ops"]) expect(USER_FACING, dir).toContain(dir)
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
