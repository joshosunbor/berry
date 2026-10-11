/*
 * Call limits for the memo route, so a public site with an API key can't
 * run up cost. They only apply when ANTHROPIC_API_KEY is set; without a
 * key nothing is sent to Claude and the template is always used.
 *
 *   MEMO_RATE_LIMIT_PER_IP  Claude drafts per client IP per hour (default 5)
 *   MEMO_DAILY_CAP          Claude drafts per day, all clients (default 100, UTC day)
 *
 * Counts are kept in memory on each machine, so with N machines the real
 * ceiling is N times these values. Over a limit, the route returns the
 * template memo instead of calling Claude.
 */

export interface MemoLimits {
  perIpPerHour: number
  dailyCap: number
}

const positiveInt = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export function limitsFromEnv(env: Record<string, string | undefined> = process.env): MemoLimits {
  return { perIpPerHour: positiveInt(env.MEMO_RATE_LIMIT_PER_IP, 5), dailyCap: positiveInt(env.MEMO_DAILY_CAP, 100) }
}

const HOUR_MS = 3_600_000

export type LimitResult = { ok: true } | { ok: false; reason: string }

export class MemoRateLimiter {
  private readonly perIp = new Map<string, { windowStart: number; count: number }>()
  private day = ""
  private dayCount = 0

  constructor(private readonly limits: MemoLimits) {}

  /** Records a call if it's allowed. Call only when Claude will actually be used. */
  take(ip: string, now = Date.now()): LimitResult {
    const today = new Date(now).toISOString().slice(0, 10)
    if (today !== this.day) {
      this.day = today
      this.dayCount = 0
    }
    if (this.dayCount >= this.limits.dailyCap) return { ok: false, reason: "The daily limit for AI drafts has been reached; showing the template memo." }

    // Drop expired windows so the map can't grow without bound.
    if (this.perIp.size > 10_000) for (const [k, w] of this.perIp) if (now - w.windowStart >= HOUR_MS) this.perIp.delete(k)
    const w = this.perIp.get(ip)
    if (w && now - w.windowStart < HOUR_MS) {
      if (w.count >= this.limits.perIpPerHour) return { ok: false, reason: "Too many AI drafts from your connection this hour; showing the template memo." }
      w.count++
    } else {
      this.perIp.set(ip, { windowStart: now, count: 1 })
    }
    this.dayCount++
    return { ok: true }
  }
}

/** The client's IP: Fly's own header first (set by Fly's proxy, not the client), then the first forwarded address. */
export function clientIp(headers: Headers): string {
  return headers.get("fly-client-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
}
