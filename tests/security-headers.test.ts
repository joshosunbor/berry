import { describe, expect, it } from "vitest"
import config, { contentSecurityPolicy } from "@/next.config"

describe("security headers", () => {
  it("doesn't advertise the framework", () => {
    expect(config.poweredByHeader).toBe(false)
  })

  it("sends HSTS, nosniff, a referrer policy, no framing and a CSP on every route", async () => {
    const rules = await config.headers!()
    const all = rules.find((r) => r.source === "/:path*")!
    const h = Object.fromEntries(all.headers.map((x) => [x.key.toLowerCase(), x.value]))
    expect(h["strict-transport-security"]).toMatch(/max-age=\d{7,}/)
    expect(h["x-content-type-options"]).toBe("nosniff")
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin")
    expect(h["x-frame-options"]).toBe("DENY")
    expect(h["content-security-policy"]).toMatch(/frame-ancestors 'none'/)
    expect(h["content-security-policy"]).toMatch(/object-src 'none'/)
    expect(h["permissions-policy"]).toMatch(/camera=\(\)/)
  })

  it("allows eval only in development", () => {
    expect(contentSecurityPolicy(true)).toContain("'unsafe-eval'")
    expect(contentSecurityPolicy(false)).not.toContain("'unsafe-eval'")
    expect(contentSecurityPolicy(false)).toMatch(/default-src 'self'/)
  })
})
