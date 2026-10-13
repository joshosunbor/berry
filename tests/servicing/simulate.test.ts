import { describe, expect, it } from "vitest"
import { getBooks, getOpsItems } from "@/lib/data"
import { MODES } from "@/lib/modes"
import { businessDaysBetween, earliestSafeRetry } from "@/lib/rules/nsf"
import { Rng } from "@/lib/rng"
import { RETURN_CODES, type ReturnCode } from "@/lib/schemas"
import { SERVICING } from "@/lib/servicing/config"
import { account } from "@/lib/servicing/ledger"
import { planRetry, RECOVERY_PATH, RETURNED_BEFORE_SETTLEMENT } from "@/lib/servicing/recovery"
import { daysBetween, simulateBook, type BookResult, type LoanResult, type LoanSetup } from "@/lib/servicing/simulate"
import { CONFIGS } from "@/lib/engine/config"
import { daysPastDueAsOf, toLoanView } from "@/lib/servicing/views"
import { expectBalanced } from "./helpers"

const books = getBooks()
const loan = (id: string): LoanResult => {
  for (const m of MODES) {
    const l = books[m].loans.find((x) => x.setup.id === id)
    if (l) return l
  }
  throw new Error(`no loan ${id}`)
}

/** Every NSF-safety and ledger invariant, for one book. */
function expectInvariants(book: BookResult) {
  expectBalanced(book.ledger)
  for (const l of book.loans) {
    const id = l.setup.id
    // The ledger and the simulator agree on what's owed.
    expect(book.ledger.outstanding(id), id).toBe(l.balances.principalCents + l.balances.interestCents)
    // Any two debits to the same account are at least 2 business days apart.
    for (let i = 1; i < l.attempts.length; i++) {
      expect(businessDaysBetween(l.attempts[i - 1].sentOn, l.attempts[i].sentOn), `${id} attempts ${i - 1},${i}`).toBeGreaterThanOrEqual(2)
    }
    // Nothing is sent before earliestSafeRetry of the previous return.
    for (const r of l.attempts.filter((a) => a.returnedOn)) {
      for (const next of l.attempts.filter((a) => a.sentOn > r.returnedOn!)) {
        expect(next.sentOn >= earliestSafeRetry(r.returnedOn!), `${id}: sent ${next.sentOn} after return ${r.returnedOn}`).toBe(true)
      }
    }
    // At most one fee-bearing NSF per 2 business days at the borrower's bank.
    const charged = l.borrowerFees.filter((f) => f.fee.feeCents > 0).map((f) => f.date)
    for (let i = 1; i < charged.length; i++) expect(businessDaysBetween(charged[i - 1], charged[i]), id).toBeGreaterThanOrEqual(2)
    // Whole cents everywhere.
    for (const a of l.attempts) expect(Number.isInteger(a.amountCents)).toBe(true)
  }
}

describe("servicing simulator: the three loan books", () => {
  it.each(MODES)("%s book: balanced ledger and every NSF-safety invariant", (m) => {
    expectInvariants(books[m])
  })

  it("is deterministic", () => {
    const again = simulateBook(books.credit_union.institutionId, "credit_union", books.credit_union.loans.map((l) => l.setup), books.credit_union.horizon)
    expect(again.ledger.trialBalance()).toEqual(books.credit_union.ledger.trialBalance())
    expect(again.loans.map((l) => l.events)).toEqual(books.credit_union.loans.map((l) => l.events))
    expectBalanced(again.ledger)
  })

  it("Grace: NSF, one retry after the safe date (not combined with her next payment), cured", () => {
    const g = loan("loan_grace-cu")
    const ret = g.attempts.find((a) => a.outcome === "returned")!
    expect(ret.code).toBe("901")
    const retry = g.attempts.find((a) => a.isRetry)!
    expect(retry.sentOn >= earliestSafeRetry(ret.returnedOn!)).toBe(true)
    expect(retry.outcome).toBe("settled")
    expect(g.cures.every((c) => c.curedOn)).toBe(true)
    expect(g.borrowerFees[0].fee).toMatchObject({ feeCents: 1_000, rule: "capped" }) // bank account: $10 cap
    expectBalanced(books.credit_union.ledger)
  })

  it("Corner Grind: NSF, failed retry (outreach), account closed before settlement, charged off at 120 days", () => {
    const c = loan("loan_corner-grind-cafe-cu")
    const types = c.events.map((e) => e.type)
    expect(types).toContain("outreach_task")
    expect(types).toContain("banking_details_requested")
    const closed = c.events.find((e) => e.code === "905")!
    expect(closed.stage).toBe("clearing")
    const chargeOff = c.events.find((e) => e.type === "charged_off")!
    expect(chargeOff.text).toMatch(/120 days past due/)
    expect(c.chargedOffOn).toBe(chargeOff.date)
    expect(c.statusTimeline.at(-1)!.status).toBe("charged_off")
    // Debit credit loss, credit receivables; nothing left owed.
    const entry = books.credit_union.ledger.forLoan(c.setup.id).find((e) => e.type === "charge_off")!
    expect(entry.lines.find((l) => l.account === account.creditLoss("northgate"))!.debitCents).toBeGreaterThan(0)
    expect(books.credit_union.ledger.outstanding(c.setup.id)).toBe(0)
    expectBalanced(books.credit_union.ledger)
  })

  it("Petalwick: three NSFs in 90 days bring a hardship deferral, credit union fee labelled illustrative", () => {
    const p = loan("loan_petalwick-florals-cu")
    expect(p.events.map((e) => e.type)).toContain("hardship_offered")
    expect(p.statusTimeline.map((t) => t.status)).toContain("hardship")
    expect(p.borrowerFees.every((f) => f.fee.label === "provincially regulated — fee illustrative")).toBe(true)
    expectBalanced(books.credit_union.ledger)
  })

  it("Petalwick: nothing on the loan changes until a second person approves the deferral", () => {
    const p = loan("loan_petalwick-florals-cu")
    const rerun = (decision: LoanSetup["hardshipDecision"]) =>
      simulateBook("northgate", "credit_union", [{ ...p.setup, hardshipDecision: decision }], books.credit_union.horizon).loans[0]
    // No decision yet: the request is logged, but no payment moves and the loan isn't in hardship.
    const pending = rerun(undefined)
    expect(pending.events.map((e) => e.type)).toContain("hardship_offered")
    expect(pending.events.map((e) => e.type)).not.toContain("payments_deferred")
    expect(pending.statusTimeline.map((t) => t.status)).not.toContain("hardship")
    // Rejected: same as pending, plus the decision on record.
    const offeredOn = pending.events.find((e) => e.type === "hardship_offered")!.date
    const rejected = rerun({ on: offeredOn, approved: false, by: "usr_lead" })
    expect(rejected.events.map((e) => e.type)).toContain("hardship_declined")
    expect(rejected.events.map((e) => e.type)).not.toContain("payments_deferred")
    expect(rejected.attempts).toEqual(pending.attempts)
  })

  it("Petalwick: the deferral starts when the maker-checker approval completes, for the amount approved", () => {
    const p = loan("loan_petalwick-florals-cu")
    const item = getOpsItems().find((i) => i.id === "q_hardship-petalwick-florals-cu")!
    const approved = p.events.find((e) => e.type === "hardship_approved")!
    expect(approved.date).toBe(item.completedAt!.slice(0, 10))
    expect(p.events.find((e) => e.type === "payments_deferred")!.date).toBe(approved.date)
    expect(p.statusTimeline.find((t) => t.status === "hardship")!.date).toBe(approved.date)
    expect(approved.amountCents).toBe(item.approval!.amountCents)
  })

  it("Petalwick: a deferral moves the schedule back, with no lump catch-up debit afterwards", () => {
    const p = loan("loan_petalwick-florals-cu")
    const approvedOn = p.events.find((e) => e.type === "hardship_approved")!.date
    const largest = Math.max(...p.setup.schedule.map((d) => d.amountCents))
    const after = p.attempts.filter((a) => a.sentOn > approvedOn)
    expect(after.length).toBeGreaterThan(0)
    for (const a of after) expect(a.amountCents, a.id).toBeLessThanOrEqual(largest)
    // Nothing is collected during the three months.
    const resumed = p.events.find((e) => e.type === "debits_resumed" && e.date > approvedOn)!.date
    expect(after.every((a) => a.sentOn >= resumed)).toBe(true)
    expect(daysBetween(approvedOn, resumed)).toBeGreaterThanOrEqual(89)
  })

  it("Petalwick: a payment missed after the deferral ages again", () => {
    const p = loan("loan_petalwick-florals-cu")
    const lastN = Math.max(...p.setup.schedule.map((d) => d.n))
    const script = { returns: [...p.setup.script!.returns, { n: lastN - 1, attempt: 1, code: "901" as const }, { n: lastN - 1, attempt: 2, code: "901" as const }] }
    const r = simulateBook("northgate", "credit_union", [{ ...p.setup, script }], "2029-12-31").loans[0]
    const end = r.events.find((e) => e.type === "debits_resumed" && e.text.startsWith("Deferral ended"))!.date
    expect(r.statusTimeline.some((t) => t.date > end && t.status === "delinquent")).toBe(true)
  })

  it("Rule H1: every debit is one payment at its own amount, never a combined or catch-up debit", () => {
    for (const m of MODES) {
      for (const l of books[m].loans) {
        const amounts = new Map(l.setup.schedule.map((d) => [`${l.setup.id.replace(/^loan_/, "")}-${d.n}`, d.amountCents]))
        for (const a of l.attempts) {
          expect(a.items, `${a.id}`).toHaveLength(1)
          expect(a.amountCents, `${a.id}`).toBe(amounts.get(a.items[0]))
        }
        expect(l.events.some((e) => /pre-notified/i.test(e.text)), l.setup.id).toBe(false)
      }
    }
  })

  it("Rule H1: after a pause, missed payments resume only after 10 days' notice", () => {
    for (const id of ["loan_amara-kite", "loan_quillfeather-plumbing-kite"]) {
      const l = loan(id)
      const resumed = l.events.find((e) => e.type === "debits_resumed")!
      const next = l.attempts.find((a) => a.sentOn > resumed.date)!
      expect(daysBetween(resumed.date, next.sentOn), id).toBeGreaterThanOrEqual(10)
      expect(resumed.text, id).toMatch(/10 days/)
    }
  })

  it("one missed payment doesn't age to charge-off while the borrower keeps paying: payments apply to the oldest owed", () => {
    const g = loan("loan_grace-cu")
    // Payment 2 fails twice (no more retries); every later payment goes through.
    const script = { returns: [{ n: 2, attempt: 1, code: "901" as const }, { n: 2, attempt: 2, code: "901" as const }] }
    const r = simulateBook("northgate", "credit_union", [{ ...g.setup, script }], "2027-12-31").loans[0]
    expect(r.chargedOffOn).toBeNull()
    expect(r.statusTimeline.map((t) => t.status)).not.toContain("charged_off")
    // Still one payment behind (delinquent), not current.
    expect(r.statusTimeline.at(-1)!.status).toBe("delinquent")
  })

  it("days past due on the loan file and dashboard are the simulator's own figure", () => {
    const g = loan("loan_grace-cu")
    const script = { returns: [{ n: 2, attempt: 1, code: "901" as const }, { n: 2, attempt: 2, code: "901" as const }] }
    const book = simulateBook("northgate", "credit_union", [{ ...g.setup, script }], "2027-12-31")
    const view = toLoanView(book, book.loans[0])
    // One payment behind all year: never more than about a month and a half past due.
    for (const d of ["2027-01-15", "2027-04-15", "2027-10-01"]) {
      const dpd = daysPastDueAsOf(view, d)
      expect(dpd, d).toBeGreaterThan(0)
      expect(dpd, d).toBeLessThan(45)
    }
    expect(daysPastDueAsOf(view, "2026-10-20")).toBe(0)
  })

  it("Hollis at Kite: NSF on a credit union account uses the illustrative provincial fee", () => {
    const h = loan("loan_hollis-family-farm-kite")
    expect(h.borrowerFees[0].fee.rule).toBe("provincially_regulated")
    expect(h.borrowerFees[0].fee.feeCents).toBe(SERVICING.borrowerBank.provincialCreditUnionNsfFeeCents)
    expectBalanced(books.fintech.ledger)
  })

  it("returns take both ledger paths: before settlement reverses clearing, after settlement the settlement account", () => {
    const fintech = books.fintech.ledger.all
    expect(fintech.some((e) => e.type === "return_from_clearing")).toBe(true) // Amara, 907
    expect(fintech.some((e) => e.type === "return_after_settlement")).toBe(true) // Hollis 901, Quillfeather 903
    const amara = loan("loan_amara-kite")
    expect(amara.attempts.find((a) => a.code === "907")!.stage).toBe("clearing")
    expect(amara.events.map((e) => e.type)).toContain("debits_resumed")
    expectBalanced(books.fintech.ledger)
  })

  it("funds Kite by e-Transfer up to its limit and by simulated RTR above it; the others by AFT", () => {
    for (const l of books.fintech.loans) expect(l.setup.funding.rail).toBe(l.setup.principalCents <= SERVICING.rails.etransfer.limitCents ? "etransfer" : "rtr_simulated")
    for (const l of [...books.credit_union.loans, ...books.bank.loans]) expect(l.setup.funding.rail).toBe("aft")
    const rtr = books.fintech.loans.find((l) => l.setup.funding.rail === "rtr_simulated")!
    expect(rtr.setup.funding.label).toBe("simulated")
  })
})

describe("seasonal operating lines are drawn, not disbursed", () => {
  it.each(["loan_hollis-family-farm-cu", "loan_lakeside-lodge-cu"])("%s: one draw entry per draw, interest only on what's drawn, never over the limit", (id) => {
    const l = loan(id)
    const entries = books.credit_union.ledger.forLoan(id)
    expect(entries.some((e) => e.type === "disbursement")).toBe(false)
    const draws = entries.filter((e) => e.type === "draw")
    expect(draws.length).toBeGreaterThan(0)
    expect(draws).toHaveLength(l.setup.draws!.length)
    const drawn = draws.reduce((t, e) => t + e.lines[0].debitCents, 0)
    expect(drawn).toBe(l.setup.draws!.reduce((t, d) => t + d.amountCents, 0))
    // Debit principal receivable, credit settlement.
    for (const e of draws) {
      expect(e.lines.find((x) => x.account === account.principal(id))!.debitCents).toBeGreaterThan(0)
      expect(e.lines.find((x) => x.account === account.settlement("northgate"))!.creditCents).toBeGreaterThan(0)
    }
    // The principal balance never exceeds the limit, and before the first draw nothing is owed or charged.
    let principal = 0
    let peak = 0
    for (const e of entries) {
      for (const x of e.lines) if (x.account === account.principal(id)) principal += x.debitCents - x.creditCents
      peak = Math.max(peak, principal)
      expect(principal).toBeLessThanOrEqual(l.setup.principalCents)
      if (e.date < draws[0].date) expect(e.type).not.toBe("interest_accrual")
    }
    // A healthy seasonal borrower never reaches 100% utilization in the base scenario.
    expect(peak / l.setup.principalCents).toBeLessThan(1)
    // Interest posted equals the schedule's interest, which is charged on the drawn balance.
    const accrued = entries.filter((e) => e.type === "interest_accrual").reduce((t, e) => t + e.lines[0].debitCents, 0)
    const scheduled = l.setup.schedule.filter((d) => d.date <= books.credit_union.horizon).reduce((t, d) => t + d.interestCents, 0)
    expect(accrued).toBe(scheduled)
    expectBalanced(books.credit_union.ledger)
  })

  it("Hollis draws about half its limit at peak: own cash first, one month's spending kept as a reserve", () => {
    const l = loan("loan_hollis-family-farm-cu")
    const peak = l.setup.draws!.reduce((t, d) => t + d.amountCents, 0)
    expect(peak / l.setup.principalCents).toBeGreaterThan(0.4)
    expect(peak / l.setup.principalCents).toBeLessThan(0.6)
    expectBalanced(books.credit_union.ledger)
  })

  it("Lakeside's line is repaid in full after its summer peak", () => {
    expect(loan("loan_lakeside-lodge-cu").statusTimeline.at(-1)!.status).toBe("paid_off")
    expect(books.credit_union.ledger.outstanding("loan_lakeside-lodge-cu")).toBe(0)
    expectBalanced(books.credit_union.ledger)
  })

  it("a line that's never drawn stays open, not 'paid off'", () => {
    const setup = { ...loan("loan_hollis-family-farm-cu").setup, id: "loan_undrawn-cu", draws: [], schedule: [] }
    const book = simulateBook("northgate", "credit_union", [setup], "2027-10-06")
    expect(book.loans[0].statusTimeline.map((t) => t.status)).toEqual(["active"])
    expect(book.ledger.all).toHaveLength(0)
    expectBalanced(book.ledger)
  })
})

describe("charge-off is configurable", () => {
  it("charges off earlier when the configured days past due is lower", () => {
    const setup = loan("loan_corner-grind-cafe-cu").setup
    const book = simulateBook("northgate", "credit_union", [setup], "2027-10-06", { ...SERVICING, chargeOffDaysPastDue: 60 })
    const c = book.loans[0]
    expect(c.events.find((e) => e.type === "charged_off")!.text).toMatch(/60 days past due/)
    expect(c.chargedOffOn! < loan("loan_corner-grind-cafe-cu").chargedOffOn!).toBe(true)
    expectBalanced(book.ledger)
  })
})

describe("recovery playbook", () => {
  it("covers every Standard 007 return code", () => {
    expect(Object.keys(RECOVERY_PATH).sort()).toEqual(Object.keys(RETURN_CODES).sort())
  })
  it("retries only NSF and funds-not-cleared returns", () => {
    const retried = Object.entries(RECOVERY_PATH).filter(([, p]) => p === "retry").map(([c]) => c)
    expect(retried.sort()).toEqual(["901", "908"])
  })
  it("never plans a retry before the safe date, even when payday comes sooner", () => {
    const rules = CONFIGS.credit_union.recovery
    // Returned Wednesday; payday is Thursday (inside the window), so the retry waits for the next payday.
    const plan = planRetry("2026-11-11", rules, { lastPayDate: "2026-11-12", cadenceDays: 14 })
    expect(plan.date >= earliestSafeRetry("2026-11-11")).toBe(true)
    expect(plan.date).toBe("2026-11-26")
    expect(planRetry("2026-11-13", rules, null).date).toBe(earliestSafeRetry("2026-11-13"))
  })
  it("returns account-level problems before settlement", () => {
    expect(RETURNED_BEFORE_SETTLEMENT.has("905")).toBe(true)
    expect(RETURNED_BEFORE_SETTLEMENT.has("901")).toBe(false)
  })
})

describe("NSF safety under 500 randomized loans", () => {
  it("holds every invariant with random returns, codes, paydays and account types", () => {
    const rng = new Rng(20261011)
    const codes = Object.keys(RETURN_CODES) as ReturnCode[]
    const template = loan("loan_priya-cu").setup
    const setups: LoanSetup[] = []
    for (let i = 0; i < 500; i++) {
      const months = rng.int(3, 12)
      const principal = rng.int(50_000, 5_000_000)
      const schedule = Array.from({ length: months }, (_, k) => {
        const date = new Date(Date.UTC(2026, 10 + k, rng.int(1, 28)))
        while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1)
        const principalPart = k === months - 1 ? principal - Math.floor(principal / months) * (months - 1) : Math.floor(principal / months)
        const interestCents = rng.int(0, 5_000)
        return { n: k + 1, date: date.toISOString().slice(0, 10), amountCents: principalPart + interestCents, interestCents, principalCents: principalPart, balanceAfterCents: 0 }
      })
      const returns = Array.from({ length: rng.int(0, 4) }, () => ({ n: rng.int(1, months), attempt: rng.int(1, 2), code: rng.pick(codes) }))
      setups.push({
        ...template,
        id: `loan_fuzz-${i}`,
        principalCents: principal,
        schedule,
        kind: rng.chance(0.7) ? "personal" : "business",
        borrowerAccount: { institutionType: rng.chance(0.5) ? "bank" : "credit_union", kind: "personal" },
        payroll: rng.chance(0.6) ? { lastPayDate: `2026-10-${String(rng.int(1, 14)).padStart(2, "0")}`, cadenceDays: rng.pick([7, 14, 15]) } : null,
        script: { returns, resumeAfterDays: rng.chance(0.5) ? rng.int(5, 30) : undefined },
      })
    }
    const book = simulateBook("northgate", "credit_union", setups, "2027-12-31")
    expectInvariants(book)
    // The random set really did exercise returns, retries and both settlement paths.
    const all = book.loans.flatMap((l) => l.attempts)
    expect(all.filter((a) => a.isRetry).length).toBeGreaterThan(50)
    expect(all.some((a) => a.stage === "clearing")).toBe(true)
    expect(all.some((a) => a.stage === "settled")).toBe(true)
  }, 30_000) // 500 simulated loans: give it room when the machine is busy
})
