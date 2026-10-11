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
  const pages = ["/", "/workbench", "/workbench/hollis-family-farm", "/workbench/main-street-hardware", "/compare/hollis-family-farm", "/accuracy", "/apply", "/consents", "/methodology", "/ops", "/ops/dashboard", "/ops/loans", "/ops/loans/loan_corner-grind-cafe-cu"]
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

test("ops console: the maker can't approve, a second person can, and the audit trail records both", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/ops")
  await page.getByLabel("Simulated time").selectOption("2026-10-06T10:05")
  await page.getByRole("tab", { name: /Payee confirmation/ }).click()
  await page.getByRole("button", { name: /Grace: confirm the payee/ }).click()
  const panel = page.getByRole("article", { name: /Grace: confirm the payee/ })
  // Prepare it as an analyst; acting as that same analyst, approval is blocked.
  await page.getByLabel("Acting as").selectOption("usr_rivera")
  await panel.getByRole("button", { name: "Prepare as A. Rivera" }).click()
  await panel.getByRole("button", { name: "Approve as A. Rivera" }).click()
  // The block is shown inline, inside the item's panel.
  await expect(panel.getByRole("alert")).toContainText("prepared this can't approve it")
  await expect(panel.getByText("Waiting for approval")).toBeVisible()

  await page.getByLabel("Acting as").selectOption("usr_moreau")
  await panel.getByRole("button", { name: "Approve as K. Moreau" }).click()
  await expect(panel.getByText(/Approved · checker: K. Moreau/)).toBeVisible()

  await page.getByRole("tab", { name: "Audit trail" }).click()
  await expect(page.getByText(/Hash chain verified/)).toBeVisible()
  await page.getByLabel("Action").selectOption("approval.blocked")
  await expect(page.getByRole("row")).toHaveCount(2)
  await page.getByLabel("Action").selectOption("approval.approved")
  await expect(page.getByRole("row").filter({ hasText: "K. Moreau" }).first()).toBeVisible()

  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "CSV" }).click()
  expect((await download).suggestedFilename()).toMatch(/^berry-audit-.*\.csv$/)

  // Reset clears the browser's actions.
  await page.getByRole("button", { name: /Reset my/ }).click()
  await expect(page.getByRole("button", { name: /Reset my/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test("policy change: impact preview, maker-checker, escalation, versions and rollback", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/ops")
  await page.getByRole("tab", { name: "Policy" }).click()
  await page.getByLabel("Acting as").selectOption("usr_rivera")
  const form = page.getByRole("region", { name: "Propose a change" })
  await form.getByLabel("Most income variation allowed (CV)").fill("1.5")
  // The impact is shown before anything can be prepared, per lender, with the decisions that change.
  const changes = form.getByRole("list", { name: "Decisions that would change" })
  await expect(changes).toContainText("Hollis Family Farm")
  await expect(form.getByRole("row", { name: /Northgate Credit Union/ })).toContainText("not affected")
  await form.getByLabel(/^Why/).fill("Accept steadier seasonal income at Aspen.")
  await form.getByRole("button", { name: "Prepare v2 as A. Rivera" }).click()

  const card = page.getByRole("article", { name: "Aspen Bank policy v2" })
  const approve = card.getByRole("button", { name: /^Approve as/ })
  await expect(approve).toBeDisabled()
  await card.getByLabel(/I've reviewed the impact/).check()
  await approve.click()
  await expect(card.getByRole("alert")).toContainText("prepared this can't approve it")

  await page.getByLabel("Acting as").selectOption("usr_moreau")
  await approve.click()
  await expect(card).toContainText("to Branch manager")
  await page.getByLabel("Acting as").selectOption("usr_lindqvist")
  await approve.click()
  await expect(page.getByText(/Current: v2/)).toBeVisible()

  // Roll back to v1: a new version, prepared and approved by different people.
  const history = page.getByRole("region", { name: "Version history" })
  await history.getByRole("button", { name: "Roll back to v1…" }).click()
  await history.getByLabel("Why roll back?").fill("Too many irregular-income approvals in review.")
  await history.getByRole("button", { name: "Prepare rollback" }).click()
  const rb = page.getByRole("article", { name: "Aspen Bank policy v3" })
  await rb.getByLabel(/I've reviewed the impact/).check()
  await rb.getByRole("button", { name: /^Approve as/ }).click()
  await expect(rb.getByRole("alert")).toContainText("prepared this can't approve it")
  await page.getByLabel("Acting as").selectOption("usr_committee")
  await rb.getByRole("button", { name: /^Approve as/ }).click()
  await expect(page.getByText(/Current: v3/)).toBeVisible()
  await expect(history).toContainText("Rollback to v1")

  await page.getByRole("tab", { name: "Audit trail" }).click()
  await page.getByLabel("Action").selectOption("policy.rolled_back")
  await expect(page.getByRole("row")).toHaveCount(2)
  await page.getByRole("button", { name: /Reset my/ }).click()
  expect(errors).toEqual([])
})

test("ops dashboard: KPIs follow the console's moment, filter by lender, explain themselves", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/ops")
  await page.getByLabel("Simulated time").selectOption("2027-10-06T17:00")
  await page.getByRole("link", { name: "Dashboard" }).click()
  await expect(page).toHaveURL(/\/ops\/dashboard$/)
  // The moment chosen in the console carries over.
  await expect(page.getByLabel("Simulated time")).toHaveValue("2027-10-06T17:00")
  const losses = page.getByRole("article", { name: "Credit losses" })
  await expect(losses).toContainText("As of Oct 6, 2027, 17:00 (simulated)")
  await expect(losses.getByText("Illustrative").first()).toBeVisible()
  await losses.getByText("How it's computed").click()
  await expect(losses).toContainText("charge-off entry")

  await page.getByRole("radio", { name: "Kite" }).click()
  await expect(losses).toContainText("$0")
  await page.getByRole("radio", { name: "Northgate Credit Union" }).click()
  await expect(losses).toContainText("$7,763")
  await expect(page.getByRole("article", { name: "Cost per loan" }).getByText("Illustrative").first()).toBeVisible()
  await expect(page.getByRole("region", { name: "What I'd improve next" })).toContainText("% of manual work")
  expect(errors).toEqual([])
})

test("accuracy: what the score means, and two debatable cases described in plain words", async ({ page }) => {
  await page.goto("/accuracy")
  await expect(page.getByText("The engine reproduces the outcomes its rules were designed for.")).toBeVisible()
  const debatable = page.getByRole("region", { name: "Two cases where the answer is debatable" })
  await expect(debatable.getByRole("heading", { level: 3 })).toHaveText([
    "A small business paid by client invoices, with steady months",
    "A long-standing member asking for a personal loan, with coverage just under the standard minimum",
  ])
  for (const t of ["The engine's answer", "The strongest argument for a different answer", "What a lender would need to see to change it"]) await expect(debatable.getByText(t, { exact: true })).toHaveCount(2)
  await expect(debatable).toContainText("Planted case P19")
})

test("landing: lifecycle strip, operations glimpse, Built for Canada, responsible by design; no status badges", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/")
  const main = page.getByRole("main")
  // No status badges on the landing page: caveats live on /methodology.
  for (const badge of ["Illustrative", "Simulated", "In draft", "Launching", "Live"]) await expect(main.getByText(badge, { exact: true })).toHaveCount(0)

  const strip = page.getByRole("region", { name: "The whole loan, end to end" })
  const steps = strip.getByRole("button")
  await expect(steps).toHaveText(["1Consent", "2Verify", "3Decide", "4Fund (AFT or instant)", "5Collect (PAD)", "6Recover", "7Reconcile"])
  await steps.nth(5).click()
  await expect(steps.nth(5)).toHaveAttribute("aria-expanded", "true")
  await expect(strip).toContainText("outside the borrower's NSF fee window")

  const ops = page.getByRole("region", { name: "Run it like an operation" })
  await expect(ops.getByText("Breached").first()).toBeVisible()
  await expect(ops.getByText("Cost per loan")).toBeVisible()

  const canada = page.getByRole("region", { name: "Built for Canada" })
  await expect(canada.getByRole("listitem")).toHaveCount(6)
  await expect(canada.getByRole("link", { name: /Regulatory status, as of October 2026/ })).toBeVisible()
  await expect(page.getByRole("region", { name: "Responsible by design" })).toContainText("111 of 111")

  await expect(page.getByRole("link", { name: /LinkedIn/ })).toHaveAttribute("href", "https://www.linkedin.com/in/joshuaosunbor")
  await expect(page.getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/joshosunbor/berry")

  // Every Built for Canada tile lands on a real section of /methodology.
  const hrefs = await canada.getByRole("listitem").getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")!))
  await page.goto("/methodology")
  for (const h of hrefs) await expect(page.locator(`#${h.split("#")[1]}`)).toHaveCount(1)
  expect(errors).toEqual([])
})

test("poor-harvest stress: shortfall shown, over-limit request goes through maker-checker, carry-over options listed", async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto("/ops/loans/loan_hollis-family-farm-cu")
  const stress = page.getByRole("region", { name: /Poor-harvest stress test/ })
  await expect(stress.getByText("Illustrative").first()).toBeVisible()
  // Base only until the toggle is on; then side by side.
  await expect(stress.getByRole("columnheader")).toHaveCount(2)
  await stress.getByRole("switch").click()
  await expect(stress.getByRole("columnheader", { name: "Harvest revenue 30% lower" })).toBeVisible()
  await expect(stress.getByRole("row", { name: /Peak drawn this season/ })).toContainText("$29,012")
  await expect(stress.getByRole("status")).toContainText("over the $60,000 limit")
  await stress.getByRole("button", { name: /Prepare an over-limit request as A. Rivera/ }).click()
  await expect(stress).toContainText("Over-limit request is in Credit referrals and sign-offs")

  await page.goto("/ops")
  await page.getByLabel("Acting as").selectOption("usr_rivera")
  await page.getByRole("tab", { name: /Credit referrals/ }).click()
  await page.getByRole("button", { name: /Hollis Family Farm: over-limit request to \$115,000/ }).click()
  const panel = page.getByRole("article", { name: /over-limit request/ })
  await panel.getByRole("button", { name: "Approve as A. Rivera" }).click()
  await expect(panel.getByRole("alert")).toContainText("prepared this can't approve it")
  await page.getByLabel("Acting as").selectOption("usr_lindqvist")
  await panel.getByRole("button", { name: "Approve as S. Lindqvist" }).click()
  await expect(panel).toContainText("Approved · checker: S. Lindqvist")
  await page.getByRole("button", { name: /Reset my/ }).click()

  await page.goto("/ops/loans/loan_lakeside-lodge-cu")
  const lake = page.getByRole("region", { name: /Poor-harvest stress test/ })
  await lake.getByRole("switch").click()
  await expect(lake).toContainText("The sweep leaves")
  for (const o of ["Carry it over.", "Term out the remainder.", "Review the limit."]) await expect(lake.getByText(o)).toBeVisible()
  await expect(lake).toContainText("Berry doesn't pick one")
  expect(errors).toEqual([])
})
