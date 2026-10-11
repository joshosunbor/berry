import { defineConfig, devices } from "@playwright/test"

/*
 * End-to-end smoke test against a production build: npm run test:e2e.
 * Includes axe accessibility checks (e2e/a11y.spec.ts). Runs locally and in CI.
 */

const PORT = 3200

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
})
