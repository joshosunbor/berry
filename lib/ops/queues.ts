import type { Features } from "@/lib/engine/features"
import type { LctrReview } from "@/lib/engine/fintrac"
import type { Mode } from "@/lib/modes"
import { MODE_META } from "@/lib/modes"
import type { Decision, QueueName, SubjectRef, VerificationCheck } from "@/lib/schemas"
import type { AccountVerificationOutcome } from "@/lib/servicing/funding"
import type { LoanView } from "@/lib/servicing/views"
import { formatCents } from "@/lib/money"
import { approve, prepare, requiredRoleFor, type ApprovalKind, type ApprovalRequest } from "./approvals"
import { AuditLog } from "./audit"
import { OPS, ROLE_ORDER, type Role, type TeamMember } from "./config"
import { PLAYBOOKS } from "./playbooks"
import { addBusinessHours, addBusinessMinutes, nextBusinessMoment } from "./time"

/*
 * Work queues, fed only by real open items from onboarding, decisions and
 * servicing. A simulated team (fictional) works them in business hours, so
 * service levels are met or breached by real backlog. Approval items go
 * through maker-checker with delegated authority; every step is written to
 * the audit trail in time order.
 */

export interface Sources {
  verification: { slug: string; name: string; checks: VerificationCheck[] }[]
  largeCash: { slug: string; name: string; review: LctrReview }[]
  decisions: { slug: string; name: string; mode: Mode; decision: Decision; features: Pick<Features, "income"> }[]
  loans: LoanView[]
  payee: { slug: string; name: string; mode: Mode; loanId: string; amountCents: number; verification: AccountVerificationOutcome; at: string }[]
}

export interface Step {
  who: string
  action: "worked" | "prepared" | "approved" | "escalated"
  start: string
  end: string
}

export interface OpsItem {
  id: string
  queue: QueueName
  title: string
  detail: string
  mode: Mode | null
  subject: SubjectRef
  href: string
  createdAt: string
  slaDueAt: string
  priority: "normal" | "high" | "urgent"
  nextAction: string
  /** Approval items: amount checked against delegated authority, and the least senior role that may approve. */
  approval?: { kind: ApprovalKind; amountCents: number; minimumRole: Role }
  /** Set when the item can't be closed by the team alone (e.g. a ledger correction is still outstanding). */
  blockedReason?: string
  steps: Step[]
  ownerId: string | null
  approverId: string | null
  completedAt: string | null
}

const at9 = (date: string) => `${date}T09:00`
const tierToRole: Record<string, Role> = { msr: "analyst", lender: "lead", branch_manager: "branch_manager", credit_committee: "credit_committee" }

/** Builds queue items from real sources. Nothing else creates queue items. */
export function buildItems(src: Sources): OpsItem[] {
  const items: OpsItem[] = []
  const add = (it: Omit<OpsItem, "slaDueAt" | "steps" | "ownerId" | "approverId" | "completedAt">) =>
    items.push({ ...it, slaDueAt: addBusinessHours(nextBusinessMoment(it.createdAt), OPS.queues[it.queue].slaBusinessHours), steps: [], ownerId: null, approverId: null, completedAt: null })

  // Decisions are made at the end of September; applications reach operations on October 1.
  const decided = "2026-10-01T09:00"

  for (const v of src.verification) {
    for (const c of v.checks.filter((x) => x.result === "needs_review")) {
      add({
        id: `q_ver-${v.slug}-${c.kind}`,
        queue: "verification",
        title: `${v.name}: ${c.kind.replaceAll("_", " ")}`,
        detail: c.reasons.join(" "),
        mode: null,
        subject: { kind: "verification", id: c.id },
        href: `/workbench/${v.slug}`,
        createdAt: decided,
        priority: c.kind.includes("screening") ? "high" : "normal",
        nextAction: c.kind.includes("screening") ? "Compare identifiers with the watch-list entry and clear or escalate." : "Ask the business for proof of its latest annual filing.",
      })
    }
  }

  for (const l of src.largeCash) {
    add({
      id: `q_fintrac-${l.slug}`,
      queue: "fintrac_review",
      title: `${l.name}: large cash deposits`,
      detail: l.review.reason,
      mode: null,
      subject: { kind: "applicant", id: `apl_${l.slug}` },
      href: `/workbench/${l.slug}`,
      createdAt: decided,
      priority: "high",
      nextAction: `Confirm the deposits and whether the report was filed by ${l.review.reportSummary.reportDueBy}.`,
    })
  }

  for (const d of src.decisions) {
    const dec = d.decision
    const approved = dec.outcome === "approve" || dec.outcome === "approve_with_conditions"
    if (d.mode === "credit_union" && approved && dec.approver) {
      add({
        id: `q_signoff-${d.slug}-cu`,
        queue: "credit_referral",
        title: `${d.name}: sign-off for ${formatCents(dec.limitCents, { whole: true })}`,
        detail: `${MODE_META[d.mode].institution} approval needs ${dec.approver.title} sign-off.`,
        mode: d.mode,
        subject: { kind: "decision", id: dec.id },
        href: `/workbench/${d.slug}`,
        createdAt: decided,
        priority: dec.approver.id === "credit_committee" ? "high" : "normal",
        nextAction: `Prepare the sign-off; ${dec.approver.title} approves.`,
        approval: { kind: "credit_signoff", amountCents: dec.limitCents, minimumRole: tierToRole[dec.approver.id] },
      })
    }
    if (dec.outcome === "refer") {
      add({
        id: `q_referral-${d.slug}-${d.mode.replace("_", "-")}`,
        queue: "credit_referral",
        title: `${d.name}: ${MODE_META[d.mode].institution} referral`,
        detail: dec.reasons[0]?.lenderText ?? "Referred for review.",
        mode: d.mode,
        subject: { kind: "decision", id: dec.id },
        href: `/workbench/${d.slug}`,
        createdAt: decided,
        priority: "normal",
        nextAction: "Request the documents listed and prepare a recommendation; a lead approves.",
        approval: { kind: "credit_signoff", amountCents: dec.limitCents, minimumRole: "lead" },
      })
    }
  }

  for (const p of src.payee) {
    add({
      id: `q_payee-${p.loanId.replace(/^loan_/, "")}`,
      queue: "payee_confirmation",
      title: `${p.name}: confirm the payee before an instant send`,
      detail: p.verification.message,
      mode: p.mode,
      subject: { kind: "loan", id: p.loanId },
      href: `/ops/loans/${p.loanId}`,
      createdAt: p.at,
      priority: "urgent",
      nextAction: "Call the borrower on a number on file; prepare the release for a second person to approve.",
      approval: { kind: "payee_release", amountCents: p.amountCents, minimumRole: "lead" },
    })
  }

  for (const loan of src.loans) {
    for (const e of loan.events) {
      if (e.type === "outreach_task" || e.type === "banking_details_requested" || e.type === "borrower_contacted") {
        add({
          id: `q_coll-${loan.id.replace(/^loan_/, "")}-${e.date}-${e.type.split("_")[0]}`,
          queue: "collections",
          title: `${loan.applicantName}: ${e.type === "outreach_task" ? "retry failed, contact the borrower" : e.type === "banking_details_requested" ? "new banking details needed" : "stopped or refused debit"}`,
          detail: e.text,
          mode: loan.mode,
          subject: { kind: "loan", id: loan.id },
          href: `/ops/loans/${loan.id}`,
          createdAt: at9(e.date),
          priority: e.type === "outreach_task" ? "high" : "normal",
          nextAction: e.type === "banking_details_requested" ? "Ask for new banking details and a new PAD agreement." : "Contact the borrower and agree next steps; check for hardship.",
        })
      }
      if (e.type === "hardship_offered") {
        // The simulator sizes the request the same way it applies the deferral.
        const deferred = e.amountCents ?? 0
        add({
          id: `q_hardship-${loan.id.replace(/^loan_/, "")}`,
          queue: "hardship",
          title: `${loan.applicantName}: approve a 3-month deferral`,
          detail: `${e.text} Payments moved: about ${formatCents(deferred, { whole: true })}.`,
          mode: loan.mode,
          subject: { kind: "loan", id: loan.id },
          href: `/ops/loans/${loan.id}`,
          createdAt: at9(e.date),
          priority: "high",
          nextAction: "Prepare the deferral; a lead or above approves.",
          approval: { kind: "hardship", amountCents: deferred, minimumRole: "lead" },
        })
      }
    }
  }

  for (const loan of src.loans) {
    for (const b of loan.breaks) {
      add({
        id: `q_recon-${b.reference.replace(/^(col|ret)_/, "")}-${b.kind.replaceAll("_", "-")}`,
        queue: "reconciliation",
        title: `${loan.applicantName}: ${b.kind === "returned_pad_not_applied" ? "returned PAD not applied" : b.kind === "timing_difference" ? "timing difference" : b.kind.replaceAll("_", " ")}`,
        detail: b.action,
        mode: loan.mode,
        subject: { kind: "reconciliation", id: b.reference },
        href: `/ops/loans/${loan.id}`,
        // Breaks are found at the month-end cut-off and worked the next morning.
        createdAt: at9(nextDayIso(b.firstSeen)),
        priority: b.kind === "returned_pad_not_applied" ? "high" : "normal",
        nextAction: b.kind === "timing_difference" ? "Confirm it clears on the next statement." : "Prepare a ledger entry applying the return; start recovery.",
        ...(b.kind !== "timing_difference" && !b.resolvedBy
          ? {
              blockedReason: "The return still has to be posted to the loan: a ledger correction needs preparing and a second person's approval.",
              approval: { kind: "ledger_correction" as const, amountCents: Math.abs(b.differenceCents), minimumRole: "lead" as const },
            }
          : {}),
      })
    }
  }

  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

function addDaysIso(d: string, n: number) {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}
function nextDayIso(d: string) {
  return addDaysIso(d, 1)
}

// ---------------------------------------------------------------------------
// The simulated team
// ---------------------------------------------------------------------------

/** The Credit Committee meets Mondays at 15:00 (illustrative). */
export function nextCommitteeMeeting(after: string): string {
  let d = new Date(`${after.slice(0, 10)}T15:00:00Z`)
  if (d.getUTCDay() === 1 && `${after.slice(0, 10)}T15:00` >= after) return d.toISOString().slice(0, 16)
  do d = new Date(d.getTime() + 86_400_000)
  while (d.getUTCDay() !== 1)
  return d.toISOString().slice(0, 16)
}

const REVIEW_MINUTES = 15
const roleRank = (r: Role) => ROLE_ORDER.indexOf(r)

interface Action {
  itemId: string | null
  at: string
  order: number
  run: (log: AuditLog) => void
}

/**
 * Works every item: assigns by skill to whoever can finish soonest, then for
 * approval items has a different person approve, escalating above their
 * delegated authority. Returns the worked items and the audit log.
 */
export function runTeam(input: OpsItem[], seedEvents: { at: string; run: (log: AuditLog) => void }[] = []): { items: OpsItem[]; log: AuditLog; eventItems: (string | null)[] } {
  const items = input.map((i) => ({ ...i, steps: [] as Step[] }))
  const freeAt = new Map(OPS.team.map((m) => [m.id, "2026-10-01T09:00"]))
  const actions: Action[] = seedEvents.map((e, i) => ({ ...e, itemId: null, order: i }))
  let order = seedEvents.length
  const later = (a: string, b: string) => (a > b ? a : b)

  const work = (m: TeamMember, readyAt: string, minutes: number) => {
    const start = later(nextBusinessMoment(readyAt), nextBusinessMoment(freeAt.get(m.id)!))
    const end = addBusinessMinutes(start, minutes)
    freeAt.set(m.id, end)
    return { start, end }
  }

  for (const it of items) {
    const minutes = OPS.queues[it.queue].minutesPerItem
    // Analysts prepare approval items so a lead or above can check them; the lead also works non-approval items.
    const skilled = OPS.team.filter((m) => m.skills.includes(OPS.queues[it.queue].skill) && (m.role === "analyst" || (m.role === "lead" && !it.approval)))
    const pick = skilled
      .map((m) => ({ m, finish: addBusinessMinutes(later(nextBusinessMoment(it.createdAt), nextBusinessMoment(freeAt.get(m.id)!)), minutes) }))
      .sort((a, b) => a.finish.localeCompare(b.finish) || roleRank(a.m.role) - roleRank(b.m.role))[0].m
    const t = work(pick, it.createdAt, minutes)
    it.ownerId = pick.id
    it.steps.push({ who: pick.id, action: it.approval ? "prepared" : "worked", start: t.start, end: t.end })
    actions.push({ itemId: it.id, at: it.createdAt, order: order++, run: (log) => log.append({ at: it.createdAt, actor: { kind: "system", id: "queues" }, action: "queue_item.created", subject: it.subject, after: { queue: it.queue, title: it.title, slaDueAt: it.slaDueAt }, reason: it.detail.slice(0, 200) }) })
    actions.push({ itemId: it.id, at: t.start, order: order++, run: (log) => log.append({ at: t.start, actor: { kind: "system", id: "auto-assign" }, action: "queue_item.assigned", subject: it.subject, before: { owner: null }, after: { owner: pick.id }, reason: "Assigned by skill to whoever could finish soonest." }) })

    // Blocked: investigated, but nobody prepares the correction, so it stays open (the planted break).
    if (it.blockedReason) {
      it.steps[0].action = "worked"
      continue
    }
    if (!it.approval) {
      it.completedAt = t.end
      actions.push({ itemId: it.id, at: t.end, order: order++, run: (log) => log.append({ at: t.end, actor: { kind: "user", id: pick.id }, action: "queue_item.completed", subject: it.subject, before: { status: "open" }, after: { status: "done" }, reason: it.nextAction }) })
      continue
    }

    // Approval: a different person approves; the lead reviews first and escalates above their limit.
    const approval = it.approval
    const chain: { member: TeamMember; start: string; end: string }[] = []
    let ready = t.end
    const required = requiredRoleFor(approval.amountCents, approval.minimumRole)
    for (const role of ["lead", "branch_manager", "credit_committee"] as Role[]) {
      const m = OPS.team.find((x) => x.role === role)!
      const slot = role === "credit_committee" ? { start: nextCommitteeMeeting(ready), end: addBusinessMinutes(nextCommitteeMeeting(ready), REVIEW_MINUTES) } : work(m, ready, REVIEW_MINUTES)
      chain.push({ member: m, ...slot })
      ready = slot.end
      if (roleRank(role) >= roleRank(required)) break
    }
    const reqId = `apv_${it.id.replace(/^q_/, "")}`
    let req: ApprovalRequest | null = null
    actions.push({
      itemId: it.id,
      at: t.end,
      order: order++,
      run: (log) => {
        req = prepare(log, { id: reqId, kind: approval.kind, subject: it.subject, amountCents: approval.amountCents, summary: it.title, preparedBy: pick.id, at: t.end, minimumRole: approval.minimumRole })
      },
    })
    chain.forEach((c, i) => {
      it.steps.push({ who: c.member.id, action: i === chain.length - 1 ? "approved" : "escalated", start: c.start, end: c.end })
      actions.push({ itemId: it.id, at: c.end, order: order++, run: (log) => (req = approve(log, req!, c.member.id, c.end)) })
    })
    it.approverId = chain.at(-1)!.member.id
    it.completedAt = chain.at(-1)!.end
    actions.push({ itemId: it.id, at: it.completedAt, order: order++, run: (log) => log.append({ at: it.completedAt!, actor: { kind: "user", id: it.approverId! }, action: "queue_item.completed", subject: it.subject, before: { status: "open" }, after: { status: "done" } }) })
  }

  const log = new AuditLog()
  // Which queue item each audit event belongs to (by sequence number).
  const eventItems: (string | null)[] = []
  for (const a of actions.sort((x, y) => x.at.localeCompare(y.at) || x.order - y.order)) {
    a.run(log)
    while (eventItems.length < log.size) eventItems.push(a.itemId)
  }
  return { items, log, eventItems }
}

// ---------------------------------------------------------------------------
// Service levels at a point in time
// ---------------------------------------------------------------------------

export type SlaState = "on_time" | "at_risk" | "breached" | "met" | "missed"

/** On time / at risk / breached while open; met / missed once done. "At risk": the last quarter of the window. */
export function slaState(it: Pick<OpsItem, "createdAt" | "slaDueAt" | "completedAt">, now: string): SlaState {
  if (it.completedAt && it.completedAt <= now) return it.completedAt <= it.slaDueAt ? "met" : "missed"
  if (now > it.slaDueAt) return "breached"
  const window = Date.parse(`${it.slaDueAt}:00Z`) - Date.parse(`${it.createdAt}:00Z`)
  return Date.parse(`${it.slaDueAt}:00Z`) - Date.parse(`${now}:00Z`) <= window / 4 ? "at_risk" : "on_time"
}

export function isOpen(it: Pick<OpsItem, "createdAt" | "completedAt">, now: string) {
  return it.createdAt <= now && (!it.completedAt || it.completedAt > now)
}

export { PLAYBOOKS }
