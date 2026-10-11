import { dollars } from "@/lib/money"
import type { Channel, TransactionCategory } from "@/lib/schemas"
import type { TxnBuilder } from "./builder"
import { addDays, dayInMonth, dayOfWeek, eachDay, eachMonth, isWeekend, monthOf, nextWeekday } from "./dates"

/*
 * Reusable cash-flow archetypes. Amounts are given in dollars for
 * readability and converted to integer cents once, here.
 */

export interface Window {
  start: string
  end: string
}

const positive = (v: number, min = 1) => Math.max(min, v)

/** Salary paid every second Friday (or any fixed weekday), from `firstPayday`. */
export function biweeklyPayroll(b: TxnBuilder, accountId: string, w: Window, p: { firstPayday: string; net: number; sd: number; employer: string }) {
  for (let d = p.firstPayday; d <= w.end; d = addDays(d, 14)) {
    if (d < w.start) continue
    b.credit(accountId, d, dollars(positive(b.rng.normal(p.net, p.sd), p.net * 0.8)), "PAYROLL", `Payroll deposit ${p.employer}`, "EFT", { merchant: p.employer })
  }
}

/** A recurring monthly payment on a fixed day, moved to the next weekday for PAD and EFT. */
export function monthly(
  b: TxnBuilder,
  accountId: string,
  w: Window,
  p: { day: number; amount: number; sd?: number; category: TransactionCategory; description: string; channel: Channel; merchant?: string; months?: number[]; memo?: "DEBIT" | "CREDIT" },
) {
  for (const m of eachMonth(w.start, w.end)) {
    if (p.months && !p.months.includes(monthOf(m))) continue
    let d = dayInMonth(m, p.day)
    if (p.channel === "PAD" || p.channel === "EFT") d = nextWeekday(d)
    if (d < w.start || d > w.end) continue
    const amount = dollars(positive(p.sd ? b.rng.normal(p.amount, p.sd) : p.amount))
    const add = p.memo === "CREDIT" ? b.credit.bind(b) : b.debit.bind(b)
    add(accountId, d, amount, p.category, p.description, p.channel, { merchant: p.merchant })
  }
}

/** Everyday spending: about `perWeek` transactions a week averaging `avg`. */
export function everyday(
  b: TxnBuilder,
  accountId: string,
  w: Window,
  p: { perWeek: number; avg: number; sd: number; category: TransactionCategory; merchants: readonly string[]; channel?: Channel; label?: string },
) {
  const daily = p.perWeek / 7
  for (const d of eachDay(w.start, w.end)) {
    if (!b.rng.chance(daily)) continue
    const merchant = b.rng.pick(p.merchants)
    b.debit(accountId, d, dollars(positive(b.rng.normal(p.avg, p.sd), 3)), p.category, p.label ? `${p.label} ${merchant}` : merchant, p.channel ?? "CARD", { merchant })
  }
}

/**
 * Gig platform payouts: many small deposits on most days, with a seasonal
 * multiplier per calendar month (1 = normal).
 */
export function gigPayouts(
  b: TxnBuilder,
  accountId: string,
  w: Window,
  p: { platforms: readonly { name: string; chance: number; avg: number; sd: number }[]; activeDayChance: number; seasonality?: Partial<Record<number, number>> },
) {
  for (const d of eachDay(w.start, w.end)) {
    if (!b.rng.chance(p.activeDayChance)) continue
    const factor = p.seasonality?.[monthOf(d)] ?? 1
    for (const platform of p.platforms) {
      if (!b.rng.chance(platform.chance)) continue
      const amount = positive(b.rng.normal(platform.avg * factor, platform.sd), 12)
      b.credit(accountId, d, dollars(amount), "GIG_INCOME", `Instant payout ${platform.name}`, "EFT", { merchant: platform.name })
    }
  }
}

/**
 * Seasonal revenue: `annual` dollars split across calendar months by
 * `weights` (month 1–12 → share, summing to 1), paid in a few deposits a month.
 */
export function seasonalRevenue(
  b: TxnBuilder,
  accountId: string,
  w: Window,
  p: { annual: number; weights: Record<number, number>; depositsPerMonth: [number, number]; description: string; merchant: string; channel: Channel; jitter: number },
) {
  for (const m of eachMonth(w.start, w.end)) {
    const total = p.annual * (p.weights[monthOf(m)] ?? 0)
    if (total <= 0) continue
    const n = b.rng.int(p.depositsPerMonth[0], p.depositsPerMonth[1])
    const shares = Array.from({ length: n }, () => b.rng.float(1 - p.jitter, 1 + p.jitter))
    const sum = shares.reduce((a, s) => a + s, 0)
    const days = Array.from({ length: n }, () => nextWeekday(dayInMonth(m, b.rng.int(2, 26)))).sort()
    days.forEach((d, i) => {
      if (d < w.start || d > w.end) return
      b.credit(accountId, d, dollars((total * shares[i]) / sum), "BUSINESS_REVENUE", p.description, p.channel, { merchant: p.merchant })
    })
  }
}

/**
 * Card processor settlements. `weekly` uses one batch per week on
 * `weekday`; otherwise one batch per open day. Revenue grows by
 * `monthlyGrowth` and follows optional monthly seasonality.
 */
export function cardSettlements(
  b: TxnBuilder,
  accountId: string,
  w: Window,
  p: {
    perPeriod: number
    sd: number
    processor: string
    cadence: "weekly" | "daily"
    weekday?: number
    openDays?: number[]
    monthlyGrowth?: number
    seasonality?: Partial<Record<number, number>>
  },
) {
  const startMs = Date.parse(w.start)
  for (const d of eachDay(w.start, w.end)) {
    const dow = dayOfWeek(d)
    if (p.cadence === "weekly" && dow !== (p.weekday ?? 1)) continue
    if (p.cadence === "daily" && !(p.openDays ?? [1, 2, 3, 4, 5, 6]).includes(dow)) continue
    const months = (Date.parse(d) - startMs) / (30.44 * 86_400_000)
    const growth = Math.pow(1 + (p.monthlyGrowth ?? 0), months)
    const season = p.seasonality?.[monthOf(d)] ?? 1
    if (season <= 0) continue
    const amount = positive(b.rng.normal(p.perPeriod * growth * season, p.sd * season), 20)
    b.credit(accountId, d, dollars(amount), "CARD_SETTLEMENT", `Card settlement ${p.processor}`, "EFT", { merchant: p.processor })
  }
}

/** Branch cash deposits on open days. `skip` dates are left out (e.g. a special event day). */
export function cashDeposits(b: TxnBuilder, accountId: string, w: Window, p: { avg: number; sd: number; openDays: number[]; skip?: string[]; max: number }) {
  for (const d of eachDay(w.start, w.end)) {
    if (!p.openDays.includes(dayOfWeek(d)) || p.skip?.includes(d)) continue
    const amount = Math.min(p.max, positive(b.rng.normal(p.avg, p.sd), 50))
    b.credit(accountId, d, dollars(amount), "CASH_DEPOSIT", "Branch cash deposit", "CASH")
  }
}

/** A fixed-amount payment every two weeks (e.g. business payroll runs). */
export function biweekly(
  b: TxnBuilder,
  accountId: string,
  w: Window,
  p: { first: string; amount: number | ((date: string) => number); sd: number; category: TransactionCategory; description: string; channel: Channel },
) {
  for (let d = p.first; d <= w.end; d = addDays(d, 14)) {
    if (d < w.start) continue
    const base = typeof p.amount === "function" ? p.amount(d) : p.amount
    if (base <= 0) continue
    b.debit(accountId, d, dollars(positive(b.rng.normal(base, p.sd))), p.category, p.description, p.channel)
  }
}

/** A weekly supplier or spending debit on a fixed weekday. */
export function weekly(
  b: TxnBuilder,
  accountId: string,
  w: Window,
  p: { weekday: number; amount: number | ((date: string) => number); sd: number; category: TransactionCategory; description: string; channel: Channel; merchant?: string; skip?: string[] },
) {
  for (const d of eachDay(w.start, w.end)) {
    if (dayOfWeek(d) !== p.weekday || (isWeekend(d) && p.channel === "PAD") || p.skip?.includes(d)) continue
    const base = typeof p.amount === "function" ? p.amount(d) : p.amount
    if (base <= 0) continue
    b.debit(accountId, d, dollars(positive(b.rng.normal(base, p.sd))), p.category, p.description, p.channel, { merchant: p.merchant })
  }
}
