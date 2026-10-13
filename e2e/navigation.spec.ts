import { expect, test, type Page } from "@playwright/test"

/*
 * The four-section structure: old URLs redirect, every product page has the
 * app header and a breadcrumb, and the guided tour runs by keyboard alone.
 */

function watchConsole(page: Page): string[] {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(String(e)))
  return errors
}

const REDIRECTS: [string, string][] = [
  ["/workbench", "/applications"],
  ["/workbench/hollis-family-farm", "/applications/hollis-family-farm"],
  ["/compare/hollis-family-farm", "/applications/hollis-family-farm?tab=compare"],
  ["/apply", "/borrower/apply"],
  ["/consents", "/borrower/consents"],
  ["/ops", "/operations"],
  ["/ops/dashboard", "/operations/dashboard"],
  ["/ops/loans", "/loans"],
  ["/ops/loans/loan_grace-cu", "/loans/loan_grace-cu"],
  ["/methodology", "/how-it-works"],
  ["/accuracy", "/how-it-works?tab=test-results"],
]

test("every old URL redirects permanently to its new home", async ({ request }) => {
  for (const [from, to] of REDIRECTS) {
    const res = await request.get(from, { maxRedirects: 0 })
    expect(res.status(), from).toBe(308)
    expect(res.headers().location, from).toBe(to)
  }
  // An unknown id still ends in a real 404 after the redirect.
  expect((await request.get("/workbench/nobody")).status()).toBe(404)
})

test("renamed businesses: every old address redirects permanently, in one hop", async ({ request }) => {
  const cases: [string, string][] = [
    ["/applications/corner-grind-cafe", "/applications/quillbean-cafe"],
    ["/workbench/main-street-hardware", "/applications/fennick-hardware"],
    ["/compare/bright-smile-dental", "/applications/halverly-dental?tab=compare"],
    ["/loans/loan_lakeside-lodge-cu", "/loans/loan_larchmere-lodge-cu"],
    ["/ops/loans/loan_northline-auto-repair-kite", "/loans/loan_corvane-auto-repair-kite"],
  ]
  for (const [from, to] of cases) {
    const res = await request.get(from, { maxRedirects: 0 })
    expect(res.status(), from).toBe(308)
    expect(res.headers().location, from).toBe(to)
    expect((await request.get(to)).status(), to).toBe(200)
  }
})

test("an old anchor lands on the How it works tab that holds it", async ({ page }) => {
  await page.goto("/methodology#regulatory-status")
  await expect(page).toHaveURL(/\/how-it-works#regulatory-status$/)
  await expect(page.getByRole("tab", { name: "Canadian rules" })).toHaveAttribute("aria-selected", "true")
  await expect(page.locator("#regulatory-status")).toBeInViewport()
})

test("product pages have the app header, a breadcrumb and plain-English titles", async ({ page, isMobile }) => {
  const pages: [string, RegExp][] = [
    ["/applications", /^Applications · Berry$/],
    ["/applications/hollis-family-farm", /^Hollis Family Farm · Applications · Berry$/],
    ["/borrower/apply", /^Apply · Borrower view · Berry$/],
    ["/loans/loan_grace-cu", /^Grace's loan · Loans · Berry$/],
    ["/operations", /^Operations · Berry$/],
    ["/operations/dashboard", /^Dashboard · Operations · Berry$/],
    ["/how-it-works", /^How it works · Berry$/],
  ]
  for (const [path, title] of pages) {
    await page.goto(path)
    await expect(page, path).toHaveTitle(title)
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }), path).toContainText("Demo")
    await expect(page.getByRole("banner").getByRole("link", { name: "Back to site" }), path).toHaveAttribute("href", "/")
    // Desktop: section links in the header and the sidebar. Phones: the tab bar.
    const sections = isMobile ? page.getByRole("navigation", { name: "Sections", exact: true }).filter({ visible: true }) : page.getByRole("navigation", { name: "App sections" })
    await expect(sections.getByRole("link"), path).toHaveText(isMobile ? ["Applications", "Borrower", "Loans", "Operations"] : ["Applications", "Borrower view", "Loans", "Operations"])
  }
})

test("guided tour: start, six steps by keyboard, close with Esc, resume", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/demo")
  await page.getByRole("button", { name: "Take the 3-minute tour" }).click()

  const bar = page.getByRole("region", { name: "Guided tour" }).filter({ visible: true })
  const expected: [RegExp, string][] = [
    [/\/borrower\/apply\?as=hollis-family-farm$/, "apply"],
    [/\/applications\/hollis-family-farm\?tab=verification$/, "tab-verification"],
    [/\/applications\/hollis-family-farm\?tab=compare$/, "tab-compare"],
    [/\/loans\/loan_hollis-family-farm-cu$/, "funding"],
    [/\/loans\/loan_hollis-family-farm-kite$/, "timeline"],
    [/\/operations\?queue=credit_referral$/, "queues"],
  ]
  for (let i = 0; i < expected.length; i++) {
    const [url, target] = expected[i]
    await expect(page).toHaveURL(url)
    await expect(bar).toContainText(`Step ${i + 1} of 6`)
    await expect(page.locator(`[data-tour="${target}"][data-tour-active]`)).toBeVisible()
    if (i < expected.length - 1) {
      // Keyboard only: focus Next and press Enter.
      await bar.getByRole("button", { name: "Next" }).focus()
      await page.keyboard.press("Enter")
    }
  }
  // Step 5 showed the failed payment; step 6 the sign-off still open.
  await expect(page.getByRole("button", { name: /Hollis Family Farm: sign-off for \$60,000/ })).toBeVisible()

  // Back works, Esc closes, and /demo offers to resume where it stopped.
  await bar.getByRole("button", { name: "Back" }).click()
  await expect(page).toHaveURL(/loan_hollis-family-farm-kite$/)
  await expect(page.getByText(/901 NSF/).first()).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("region", { name: "Guided tour" })).toHaveCount(0)
  await page.goto("/demo")
  await page.getByRole("button", { name: "Resume the tour at step 5 of 6" }).click()
  await expect(page).toHaveURL(/loan_hollis-family-farm-kite$/)
  await expect(bar).toContainText("Step 5 of 6")
  expect(errors).toEqual([])
})

test("tour respects reduced motion: no highlight animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/demo")
  await page.getByRole("button", { name: "Take the 3-minute tour" }).click()
  const area = page.locator("[data-tour-active]")
  await expect(area).toBeVisible()
  expect(await area.evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
})

test("phones: the tour bar stays pinned to the bottom while the header scrolls away, and never covers content", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout only")
  await page.goto("/demo")
  await page.getByRole("button", { name: "Take the 3-minute tour" }).click()
  await page.getByRole("region", { name: "Guided tour" }).filter({ visible: true }).getByRole("button", { name: "Next" }).click()
  await expect(page).toHaveURL(/tab=verification$/)
  const bar = page.getByRole("region", { name: "Guided tour" }).filter({ visible: true })
  const tabBar = page.getByRole("navigation", { name: "Sections", exact: true }).filter({ visible: true })
  const vh = page.viewportSize()!.height
  for (const y of [0, 600, 100_000]) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    const b = (await bar.boundingBox())!
    const t = (await tabBar.boundingBox())!
    // Pinned directly above the tab bar, which sits at the bottom of the viewport.
    expect(Math.round(t.y + t.height), `scroll ${y}`).toBe(vh)
    expect(Math.round(b.y + b.height), `scroll ${y}`).toBe(Math.round(t.y))
  }
  // The header has scrolled away; at the very bottom, the footer ends above the bar.
  await expect(page.getByRole("banner")).not.toBeInViewport()
  const footer = (await page.getByRole("contentinfo").boundingBox())!
  const b = (await bar.boundingBox())!
  expect(footer.y + footer.height).toBeLessThanOrEqual(b.y)
})

test("How it works: all three tabs fit at 375px with short labels; the same accessible names at every size", async ({ page, isMobile }) => {
  await page.goto("/how-it-works")
  const tabs = page.getByRole("tablist", { name: "How it works" })
  for (const name of ["How it decides", "Test results", "Canadian rules"]) await expect(tabs.getByRole("tab", { name, exact: true })).toBeVisible()
  // What's on screen: the label spans that take up space (the screen-reader-only name is 1px).
  const visible = await tabs
    .getByRole("tab")
    .evaluateAll((els) => els.map((e) => [...e.querySelectorAll("span")].filter((s) => s.getBoundingClientRect().width > 1).map((s) => s.textContent!.trim()).join("")))
  expect(visible).toEqual(isMobile ? ["Decisions", "Tests", "Rules"] : ["How it decides", "Test results", "Canadian rules"])
  const fits = await tabs.evaluate((el) => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= window.innerWidth)
  expect(fits).toBe(true)
})

test("phones: no horizontal scroll on the new pages", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout only")
  for (const path of ["/demo", "/how-it-works", "/how-it-works?tab=canadian-rules", "/applications/hollis-family-farm?tab=compare", "/operations"]) {
    await page.goto(path)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0)
  }
})
