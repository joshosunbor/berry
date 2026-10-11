import { expect, test, type Page } from "@playwright/test"

/** Fails the test on any console error or uncaught exception. */
function watchConsole(page: Page): string[] {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(String(e)))
  return errors
}

test("landing → workbench → applicant → compare", async ({ page }) => {
  const errors = watchConsole(page)

  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("One applicant. Three lenders. Three different answers.")
  await expect(page.getByRole("article", { name: /Northgate Credit Union/ })).toContainText("$60,000")
  await expect(page.getByRole("article", { name: /Kite/ })).toContainText("$8,000")
  await expect(page.getByRole("article", { name: /Aspen Bank/ })).toContainText("Declined")

  await page.getByRole("link", { name: "Try the workbench" }).click()
  await expect(page).toHaveURL(/\/workbench$/)
  await expect(page.getByRole("list").getByRole("link")).toHaveCount(14)

  await page.getByRole("link", { name: /Hollis Family Farm/ }).click()
  await expect(page).toHaveURL(/\/workbench\/hollis-family-farm$/)
  const panel = page.getByRole("region", { name: /decision/ })
  await expect(panel).toContainText("Sign-off: Branch Manager")

  // Switching lender updates the decision panel.
  await page.getByRole("radio", { name: /^Kite$/ }).click()
  await expect(panel).toContainText("$8,000")
  await page.getByRole("radio", { name: /^Aspen/ }).click()
  await expect(panel).toContainText("Declined")

  await page.getByRole("link", { name: "Compare all three lenders" }).click()
  await expect(page).toHaveURL(/\/compare\/hollis-family-farm$/)
  await expect(page.getByRole("article")).toHaveCount(3)

  expect(errors).toEqual([])
})

test("accuracy page publishes results", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/accuracy")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accuracy")
  await expect(page.getByText(/planted decisions match/)).toBeVisible()
  expect(errors).toEqual([])
})

test("unknown applicant is a 404", async ({ page }) => {
  const res = await page.goto("/workbench/nobody")
  expect(res?.status()).toBe(404)
})

test("no page makes regulatory claims", async ({ page }) => {
  const pages = ["/", "/workbench", "/workbench/hollis-family-farm", "/workbench/main-street-hardware", "/compare/hollis-family-farm", "/accuracy"]
  for (const p of pages) {
    await page.goto(p)
    const text = await page.locator("body").innerText()
    expect(text, p).not.toMatch(/\b(compliant|certified|approved by)\b/i)
  }
})

test("Main Street Hardware's file shows the FINTRAC review and the AFT file", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/workbench/main-street-hardware")
  await page.getByRole("tab", { name: "FINTRAC review" }).click()
  const panel = page.getByRole("tabpanel", { name: "FINTRAC review" })
  await expect(panel).toContainText("24-hour rule")
  await expect(panel).toContainText("$10,500.00")
  await expect(panel).toContainText("Illustrative — not a filing")
  await expect(panel).toContainText("never a credit factor")

  await page.getByRole("tab", { name: "Disbursement (AFT)" }).click()
  await expect(page.getByRole("tabpanel", { name: "Disbursement (AFT)" })).toContainText("Illustrative — not for submission")
  await page.getByRole("button", { name: "View raw file" }).click()
  await expect(page.getByLabel("Raw file, one record per line")).toContainText("NORTHGATE CU")
  expect(errors).toEqual([])
})
