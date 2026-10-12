import { outcomeLabel } from "@/components/berry/outcome-chip"
import statusFile from "@/data/regulatory-status.json"
import { getApplicant, getBooks, getCast, getLoanView, getOpsItems, getPolicyCases } from "@/lib/data"
import { CONFIGS } from "@/lib/engine/config"
import { INCOME_LABELS, PRODUCT_LABELS, STRUCTURE_LABELS } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODES, type Mode } from "@/lib/modes"
import { member } from "@/lib/ops/config"
import { OPS as OPS_CONFIG } from "@/lib/ops/config"
import { impactOf } from "@/lib/ops/policy"
import { slaState, type SlaState } from "@/lib/ops/queues"
import { businessMinutesBetween } from "@/lib/ops/time"
import type { Decision, InstitutionConfig } from "@/lib/schemas"
import { SERVICING } from "@/lib/servicing/config"
import { RAILS, RTR_FULL_NAME } from "@/lib/servicing/funding"
import { CLOCK_START } from "@/lib/servicing/views"

/*
 * Every figure on the landing page, read from the engine, the seed data,
 * the servicing simulator and the queue engine at build time. Nothing here
 * is typed in: where the design showed a sample detail the data doesn't
 * have, it is left out. tests/landing.test.ts checks each value against
 * its source.
 */

export const LANDING_APPLICANT = "hollis-family-farm"
export const LANDING_LOAN = "loan_hollis-family-farm-cu"
/**
 * The work queue as it stood at a real simulated moment: the morning after
 * the January month-end close, with an unapplied return past its service
 * level beside new collections and hardship work. (No moment in the
 * simulation has a breached, an at-risk and an on-time item open at once.)
 */
export const LANDING_QUEUE_AT = "2027-02-04T09:05"
/** The policy-preview example: Aspen's income-variation limit loosened from its published value to this. */
export const LANDING_POLICY_EXAMPLE = { mode: "bank" as Mode, key: "maxIncomeCv", to: 1.5 }

const PROVINCES: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
}

/** Reasons that describe how a lender read the applicant's income. */
const INCOME_REASONS = ["INCOME_TOO_VARIABLE", "NO_SEASONAL_STRUCTURE", "SEASONAL_REPAYMENT_FITS", "STABLE_PAYROLL", "STEADY_REVENUE", "STABLE_PENSION", "CONSISTENT_GIG_INCOME", "INCOME_NEEDS_DOCUMENTS"]

/** The plain part of a structure label ("Seasonal: interest-only, repaid after peak season" → "interest-only, repaid after peak season"). */
const structureText = (st: NonNullable<Decision["structure"]>) => STRUCTURE_LABELS[st].split(": ").at(-1)!
const approved = (d: Decision) => d.outcome === "approve" || d.outcome === "approve_with_conditions"
const money = (c: number) => formatCents(c, { whole: c % 100 === 0 })
const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" })
const monthYear = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" })

export interface LandingLender {
  mode: Mode
  outcome: Decision["outcome"]
  outcomeLabel: string
  /** The big figure: the limit when approved, the outcome otherwise. */
  headline: string
  approved: boolean
  product: string
  borrowerReason: string
  lenderReason: string
}

export interface LedgerRow {
  date: string
  entry: string
  amountCents: number
  balanceCents: number
  payment: boolean
  scheduled: boolean
}

export interface QueueRow {
  title: string
  queue: string
  owner: string
  sla: SlaState
  left: string
}

export function landingData() {
  const view = getApplicant(LANDING_APPLICANT)!
  const a = view.applicant
  const f = view.features
  const d = view.decisions

  // --- Hero comparison ----------------------------------------------------
  const lenders: Record<Mode, LandingLender> = Object.fromEntries(
    MODES.map((m) => {
      const x = d[m]
      const ok = approved(x)
      return [
        m,
        {
          mode: m,
          outcome: x.outcome,
          outcomeLabel: outcomeLabel(x.outcome),
          headline: ok ? money(x.limitCents) : outcomeLabel(x.outcome),
          approved: ok,
          product: ok ? PRODUCT_LABELS[x.product] : "No offer",
          borrowerReason: x.reasons[0].customerText,
          lenderReason: x.reasons[0].lenderText,
        },
      ]
    }),
  ) as Record<Mode, LandingLender>

  const kindOfFarm = a.story.split(".")[0]
  const months = f.monthly.map((m) => ({
    month: m.month,
    label: monthLabel(m.month),
    inCents: m.inflowCents,
    outCents: m.outflowCents,
    peak: f.income.peakMonths.includes(Number(m.month.slice(5, 7))),
  }))

  const long = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" })
  const peakNames = months.filter((m) => m.peak).map((m) => new Date(`${m.month}-15T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", timeZone: "UTC" }))
  const topIn = months.reduce((x, y) => (y.inCents > x.inCents ? y : x))
  const topOut = months.reduce((x, y) => (y.outCents > x.outCents ? y : x))
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0])
  const chartSummary = {
    spark: `Deposits over 12 months, ${long(months[0].month)} to ${long(months.at(-1)!.month)}: highest in ${list(peakNames)}, the harvest months.`,
    chart: `Money in and out each month, ${long(months[0].month)} to ${long(months.at(-1)!.month)}. Money in is highest in ${list(peakNames)}, peaking at ${money(topIn.inCents)} in ${long(topIn.month)}. Money out is highest in ${long(topOut.month)}, at ${money(topOut.outCents)}.`,
  }

  // --- Applicant file (tour) ----------------------------------------------
  const cu = d.credit_union
  const tiers = CONFIGS.credit_union.authorityTiers!
  const dateText = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  const below = cu.approver ? tiers.find((t) => t.order === cu.approver!.order - 1) : undefined
  const features = [
    { k: "Income pattern", v: INCOME_LABELS[f.income.type] },
    { k: "Months of history", v: String(f.windowMonths) },
    { k: "Returned payments, 12 mo", v: String(f.nsf12m) },
    ...(a.relationship?.memberSince ? [{ k: "Member since", v: a.relationship.memberSince.slice(0, 4) }] : []),
    ...(f.relationship ? [{ k: "Products held", v: String(f.relationship.productsHeld) }] : []),
  ]

  // --- Compare (tour) -----------------------------------------------------
  const order: Mode[] = ["bank", "fintech", "credit_union"]
  const pad = view.pad
  const cell = (fn: (m: Mode) => string) => Object.fromEntries(order.map((m) => [m, fn(m)])) as Record<Mode, string>
  const row = (k: string, cells: Record<Mode, string>, bold = false) => ({ k, cells, bold, differs: new Set(Object.values(cells)).size > 1 })
  const compare = [
    row("Data used", cell(() => `Same ${f.windowMonths} months of bank data`)),
    row("Reads income as", cell((m) => d[m].reasons.find((r) => INCOME_REASONS.includes(r.code))?.lenderText ?? "—")),
    row("Outcome", cell((m) => outcomeLabel(d[m].outcome)), true),
    row("Limit", cell((m) => (approved(d[m]) ? money(d[m].limitCents) : "—")), true),
    row("Repayment", cell((m) => (pad[m] && d[m].structure ? `PAD · ${structureText(d[m].structure!)}` : "—"))),
    row("Signed off by", cell((m) => d[m].approver?.title ?? "Automatic")),
    row("Compliance flags", cell((m) => (d[m].flags.length ? d[m].flags.map((x) => x.summary).join("; ") : "None"))),
  ]

  // --- Servicing (tour): the loan's ledger, then its remaining schedule ----
  const loan = getLoanView(LANDING_LOAN)!
  const loanAccounts = new Set([`principal:${loan.id}`, `interest:${loan.id}`])
  const ledger: LedgerRow[] = []
  let balance = 0
  for (const e of loan.entries) {
    const delta = e.lines.filter((l) => loanAccounts.has(l.account)).reduce((t, l) => t + l.debitCents - l.creditCents, 0)
    if (!delta) continue
    balance += delta
    const entry = e.type === "draw" ? "Draw" : e.type === "interest_accrual" ? "Interest charged" : e.type === "collection_sent" ? "PAD collected" : e.type.replaceAll("_", " ")
    ledger.push({ date: e.date, entry, amountCents: delta, balanceCents: balance, payment: delta < 0, scheduled: false })
  }
  const lastPosted = ledger.at(-1)!.date
  const outstandingAtEnd = balance
  for (const s of loan.schedule.filter((x) => x.date > lastPosted)) {
    if (s.interestCents) {
      balance += s.interestCents
      ledger.push({ date: s.date, entry: "Interest, scheduled", amountCents: s.interestCents, balanceCents: balance, payment: false, scheduled: true })
    }
    balance -= s.amountCents
    ledger.push({ date: s.date, entry: "PAD scheduled, final", amountCents: -s.amountCents, balanceCents: balance, payment: true, scheduled: true })
  }
  const tb = getBooks().credit_union.ledger.trialBalance()
  const plan = pad.credit_union!
  const servicing = {
    limitCents: loan.principalCents,
    peakDrawnCents: (loan.draws ?? []).reduce((t, x) => t + x.amountCents, 0),
    seasonInterestCents: plan.totalInterestCents,
    repayment: cu.structure ? `PAD · ${structureText(cu.structure)}` : "—",
    outstandingAtEndCents: outstandingAtEnd,
    simulatedTo: lastPosted,
    /** When the loan's status turned paid off in the simulation, if it did. */
    paidOffOn: loan.statusTimeline.find((t) => t.status === "paid_off")?.date ?? null,
    /** The last debit sent before payoff. */
    finalPaymentOn: [...loan.entries].reverse().find((e) => e.type === "collection_sent")?.date ?? null,
    finalScheduledOn: loan.schedule.at(-1)!.date,
    finalBalanceCents: balance,
    balanced: tb.debitCents === tb.creditCents,
  }

  // --- Operations ---------------------------------------------------------
  const at = LANDING_QUEUE_AT
  const open = getOpsItems().filter((i) => i.createdAt <= at && (!i.completedAt || i.completedAt > at))
  // Every open item at that moment, most urgent first.
  const queue: QueueRow[] = [...open]
    .sort((x, y) => x.slaDueAt.localeCompare(y.slaDueAt))
    .map((i) => {
      const started = i.steps[0] && i.steps[0].start <= at
      const mins = businessMinutesBetween(at, i.slaDueAt)
      const state = slaState(i, at)
      const left = state === "breached" ? "Breached" : mins < 60 ? `${mins}m left` : mins < 480 ? `${Math.floor(mins / 60)}h ${mins % 60}m left` : `${Math.round((mins / 480) * 10) / 10} business days left`
      return { title: i.title, queue: OPS_CONFIG.queues[i.queue].label, owner: started && i.ownerId ? member(i.ownerId)!.name : "Unassigned", sla: state, left }
    })

  const funded = getCast().length && MODES.flatMap((m) => getBooks()[m].loans.map((l) => l.setup.funding))
  const median = (xs: number[]) => {
    const s = [...xs].sort((p, q) => p - q)
    return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)
  }
  const railTimes = (["aft", "etransfer", "rtr_simulated"] as const).map((r) => {
    const ms = (funded || []).filter((x) => x.rail === r).map((x) => x.timeToFundMinutes)
    const min = median(ms)
    const value =
      r === "rtr_simulated" ? `${SERVICING.rails.rtr_simulated.secondsToComplete} seconds` : min >= 60 ? `${Math.round((min / 60) * 10) / 10} hours` : `${min} minutes`
    return { rail: r, label: r === "aft" ? "AFT batch" : r === "etransfer" ? "e-Transfer" : RTR_FULL_NAME, minutes: min, value, loans: ms.length }
  })

  // A real policy-preview run, as the console shows it.
  const ex = LANDING_POLICY_EXAMPLE
  const current: InstitutionConfig = CONFIGS[ex.mode]
  const proposed: InstitutionConfig = { ...current, version: current.version + 1, thresholds: { ...current.thresholds, [ex.key]: ex.to } }
  const cases = getPolicyCases()
  const impact = impactOf(ex.mode, current, proposed, cases).byLender[ex.mode]
  const newlyApproved = [...impact.cast, ...impact.planted].filter((c) => c.from.outcome !== "approve" && c.from.outcome !== "approve_with_conditions" && (c.to.outcome === "approve" || c.to.outcome === "approve_with_conditions")).length
  const policyQuote = `“This change would have approved ${newlyApproved} more of the ${cases.length} applications in the demo.”`

  return {
    applicant: {
      name: a.displayName,
      province: a.province ? PROVINCES[a.province] : null,
      description: `${kindOfFarm}${a.province ? `, ${PROVINCES[a.province]}` : ""} · asking for a ${PRODUCT_LABELS[a.request.product].toLowerCase()}`,
      tourLine: [kindOfFarm, a.province ? PROVINCES[a.province] : null, a.kind === "business" ? "Business" : "Personal"].filter(Boolean).join(" · "),
      story: a.story.split(".").slice(1).join(".").trim(),
    },
    lenders,
    months,
    chartSummary,
    otherApplicants: getCast().length - 1,
    decisionPanel: {
      outcomeLabel: outcomeLabel(cu.outcome),
      limit: money(cu.limitCents),
      product: cu.structure ? `${PRODUCT_LABELS[cu.product]} · ${structureText(cu.structure)}` : PRODUCT_LABELS[cu.product],
      reasons: cu.reasons.slice(0, 3).map((r) => r.customerText),
      signOff: cu.approver ? { title: cu.approver.title, belowTitle: below?.title ?? null, belowLimit: below?.maxExposureCents ? formatCents(below.maxExposureCents, { whole: true }) : null } : null,
    },
    features,
    compare,
    ledger,
    servicing,
    queue: { at, atText: `${dateText(at.slice(0, 10))}, ${at.slice(11)} (simulated)`, openCount: open.length, rows: queue },
    railTimes,
    policyQuote,
    statusAsOf: monthYear(statusFile.asOf),
    clockStart: CLOCK_START,
  }
}

export type LandingData = ReturnType<typeof landingData>
