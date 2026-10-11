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
  const pages = ["/", "/workbench", "/workbench/hollis-family-farm", "/workbench/main-street-hardware", "/compare/hollis-family-farm", "/accuracy", "/apply", "/consents", "/methodology", "/ops/loans", "/ops/loans/loan_corner-grind-cafe-cu"]
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

test("apply: consent, verification, request and three decisions; consents can be revoked", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/apply")
  await page.getByRole("button", { name: /Hollis Family Farm/ }).click()
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible()
  await page.getByRole("button", { name: "Continue" }).click()

  await expect(page.getByRole("heading", { name: "Share your banking data" })).toBeVisible()
  await expect(page.getByText("What we won't ask for")).toBeVisible()
  await expect(page.getByText(/s\. 86/).first()).toBeVisible()
  await page.getByRole("button", { name: "I consent" }).click()

  await expect(page.getByRole("heading", { name: "Verifying your identity" })).toBeVisible()
  await expect(page.getByText("All checks cleared automatically.")).toBeVisible({ timeout: 10_000 })
  await page.getByRole("button", { name: "Continue" }).click()

  // Save and resume: reload mid-application.
  await page.reload()
  await page.getByRole("button", { name: "Resume" }).click()
  await expect(page.getByRole("heading", { name: "What would you like to borrow?" })).toBeVisible()

  await page.getByLabel("Amount (CAD)").fill("40000")
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page.getByText("$40,000")).toBeVisible()
  await page.getByRole("button", { name: "Submit application" }).click()

  await expect(page.getByRole("heading", { name: "Your decisions" })).toBeVisible()
  await expect(page.getByRole("article")).toHaveCount(3)

  await page.getByRole("link", { name: "Manage your consents" }).click()
  await expect(page.getByRole("button", { name: /Revoke consent for/ })).toHaveCount(3)
  await page.getByRole("button", { name: "Revoke consent for Kite" }).click()
  await expect(page.getByRole("button", { name: /Revoke consent for/ })).toHaveCount(2)
  await expect(page.getByText("Revoked by the customer: Kite")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("button", { name: /Revoke consent for/ })).toHaveCount(2)
  expect(errors).toEqual([])
})

test("methodology: regulatory status panel shows sources, dates and the right statuses", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/")
  await page.getByRole("link", { name: "See how it decides" }).click()
  await expect(page).toHaveURL(/\/methodology$/)
  const panel = page.locator("#regulatory-status")
  await expect(panel).toContainText("Status as of October 11, 2026")
  const rows = panel.getByRole("listitem")
  const count = await rows.count()
  expect(count).toBeGreaterThanOrEqual(15)
  for (let i = 0; i < count; i++) {
    await expect(rows.nth(i).getByRole("link", { name: /^Source:/ })).toHaveAttribute("href", /^https:\/\//)
    await expect(rows.nth(i)).toContainText("Checked")
  }
  for (const name of ["Consumer-Driven Banking Act", "Consumer-Driven Banking Regulations"]) {
    await expect(rows.filter({ hasText: name }).first()).toContainText("In draft")
  }
  await expect(rows.filter({ hasText: "Real-Time Rail" }).first()).toContainText("Launching")
  await expect(rows.filter({ hasText: "2027 milestones" })).toContainText("Illustrative")
  expect(errors).toEqual([])
})

test("funding: RTR is labelled simulated and a close match must be confirmed before sending", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/workbench/grace")
  await page.getByRole("tab", { name: "Disbursement (AFT)" }).click()
  const panel = page.getByRole("tabpanel", { name: "Disbursement (AFT)" })
  await panel.getByRole("radio", { name: /Real-Time Rail/ }).click()
  await expect(panel).toContainText("simulated — RTR launching")
  await expect(panel).toContainText("Account verification: close match")
  await expect(panel.getByRole("status")).toContainText("confirm the account with the borrower")
  await panel.getByLabel("I've confirmed the account with the borrower").check()
  await expect(panel.getByRole("status")).toContainText("Seconds")
  expect(errors).toEqual([])
})

test("loan servicing: fast-forward to a charge-off, ledger in balance, return codes labelled", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/ops/loans")
  await page.getByRole("radio", { name: /\+12 m/ }).click()
  await page.getByRole("link", { name: "Corner Grind Café" }).click()
  await expect(page).toHaveURL(/\/ops\/loans\/loan_corner-grind-cafe-cu$/)
  await expect(page.getByText("Charged off").first()).toBeVisible()
  await expect(page.getByText(/Charged off at 120 days past due/).first()).toBeVisible()
  await expect(page.getByRole("status").filter({ hasText: "Debits" })).toContainText("✓")
  await expect(page.getByText("905 Account Closed")).toBeVisible()

  await page.goto("/ops/loans/loan_amara-kite")
  await expect(page.getByText("907 No Debit Allowed")).toBeVisible()
  await expect(page.getByText(/before settlement/).first()).toBeVisible()
  expect(errors).toEqual([])
})

test("unknown loan is a 404", async ({ page }) => {
  const res = await page.goto("/ops/loans/loan_nobody-cu")
  expect(res?.status()).toBe(404)
})

test("foreign report toggle on /methodology; credit-building path on Daniel's file, with no toggle", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/methodology#foreign-reports")
  const section = page.locator("#foreign-reports")
  const toggle = section.getByRole("switch")
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  await expect(section.getByText("No offer")).toHaveCount(0)
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await expect(section.getByText("No offer")).toHaveCount(2)

  await page.goto("/workbench/daniel")
  await expect(page.getByRole("heading", { name: "Credit-building path" })).toBeVisible()
  await expect(page.getByText("fill the gap foreign credit reports don't cover")).toBeVisible()
  await expect(page.getByRole("switch")).toHaveCount(0)
  expect(errors).toEqual([])
})

test("Hollis's operating line shows limit, drawn and available", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/ops/loans/loan_hollis-family-farm-cu")
  await page.getByRole("radio", { name: /\+12 m/ }).click()
  const line = page.getByRole("region", { name: "Operating line" })
  await expect(line).toContainText("Limit")
  await expect(line).toContainText("$60,000.00")
  await expect(line).toContainText("Drawn (owed principal)")
  await expect(line).toContainText("Available")
  await expect(line).toContainText("Draws keep one month's average spending in the account")
  await expect(line).toContainText("headroom")
  await expect(page.getByRole("status").filter({ hasText: "Debits" })).toContainText("✓")
  expect(errors).toEqual([])
})
