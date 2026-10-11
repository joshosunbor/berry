import { describe, expect, it } from "vitest"
import { clientIp, limitsFromEnv, MemoRateLimiter } from "@/lib/memo/limits"

const T0 = Date.parse("2026-10-11T12:00:00Z")
const HOUR = 3_600_000

describe("memo call limits", () => {
  it("reads limits from the environment, with safe defaults", () => {
    expect(limitsFromEnv({})).toEqual({ perIpPerHour: 5, dailyCap: 100 })
    expect(limitsFromEnv({ MEMO_RATE_LIMIT_PER_IP: "2", MEMO_DAILY_CAP: "50" })).toEqual({ perIpPerHour: 2, dailyCap: 50 })
    expect(limitsFromEnv({ MEMO_RATE_LIMIT_PER_IP: "-1", MEMO_DAILY_CAP: "lots" })).toEqual({ perIpPerHour: 5, dailyCap: 100 })
  })

  it("limits each IP per hour and resets after the hour", () => {
    const l = new MemoRateLimiter({ perIpPerHour: 2, dailyCap: 100 })
    expect(l.take("1.1.1.1", T0).ok).toBe(true)
    expect(l.take("1.1.1.1", T0 + 1).ok).toBe(true)
    expect(l.take("1.1.1.1", T0 + 2).ok).toBe(false)
    expect(l.take("2.2.2.2", T0 + 3).ok).toBe(true)
    expect(l.take("1.1.1.1", T0 + HOUR).ok).toBe(true)
  })

  it("caps calls per day across all IPs, and resets the next UTC day", () => {
    const l = new MemoRateLimiter({ perIpPerHour: 100, dailyCap: 3 })
    for (let i = 0; i < 3; i++) expect(l.take(`10.0.0.${i}`, T0).ok).toBe(true)
    const over = l.take("10.0.0.9", T0)
    expect(over.ok).toBe(false)
    expect(!over.ok && over.reason).toMatch(/daily limit/)
    expect(l.take("10.0.0.9", Date.parse("2026-10-12T00:00:01Z")).ok).toBe(true)
  })

  it("a refused call isn't counted", () => {
    const l = new MemoRateLimiter({ perIpPerHour: 1, dailyCap: 2 })
    expect(l.take("a", T0).ok).toBe(true)
    expect(l.take("a", T0).ok).toBe(false)
    expect(l.take("b", T0).ok).toBe(true)
  })

  it("prefers Fly's client IP header", () => {
    expect(clientIp(new Headers({ "fly-client-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("9.9.9.9")
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4")
    expect(clientIp(new Headers())).toBe("unknown")
  })
})
