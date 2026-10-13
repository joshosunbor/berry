import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

/*
 * Automated accessibility checks (axe) on the main pages, in light and dark
 * mode. Fails on serious or critical violations (WCAG 2.x A and AA rules).
 */

const PAGES = [
  "/",
  "/demo",
  "/applications",
  "/applications/hollis-family-farm",
  "/applications/hollis-family-farm?tab=compare",
  "/borrower/apply",
  "/borrower/consents",
  "/operations",
  "/operations?tab=team",
  "/operations?tab=policy",
  "/operations?tab=audit",
  "/operations/dashboard",
  "/loans",
  "/loans/loan_hollis-family-farm-cu",
  "/how-it-works",
  "/how-it-works?tab=test-results",
  "/how-it-works?tab=canadian-rules",
  "/applications/nobody",
]

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme })
    for (const path of PAGES) {
      test(`axe: ${path} has no serious or critical violations`, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState("networkidle")
        // Let entrance animations finish: contrast is checked on what people see once the page settles.
        await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"))
        await page.waitForTimeout(1500)
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()
        const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
        const report = blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 5).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n")
        expect(blocking, report).toEqual([])
      })
    }
  })
}
