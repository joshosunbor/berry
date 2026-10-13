import type { AuditEvent } from "@/lib/schemas"
import { approve, prepare, reject, requiredRoleFor, type ApprovalRequest } from "./approvals"
import { AuditLog, type AuditInput } from "./audit"
import type { PolicyProposal } from "./policy"
import { OPS, ROLE_ORDER, member } from "./config"
import { formatCents } from "@/lib/money"
import { MODE_META, type Mode } from "@/lib/modes"
import { slaState, type OpsItem, type SlaState } from "./queues"
import { addBusinessHours, nextBusinessMoment } from "./time"

/*
 * What the operations console shows at a point in simulated time: each
 * item's state, and the audit trail. The simulated team's work is the
 * history; actions taken in the browser are layered on top. Once a person
 * acts on an item in the browser, they take it over: the simulated team's
 * later steps on that item are dropped. The audit trail is rebuilt in time
 * order and re-chained, so it always verifies.
 */

export type UserActionKind =
  | "assigned"
  | "prepared"
  | "approved"
  | "escalated"
  | "rejected"
  | "blocked"
  | "completed"
  | "message_sent"
  | "memo_approved"
  | "policy_proposed"
  | "policy_decided"
  | "item_created"

export interface UserAction {
  itemId: string | null
  at: string
  kind: UserActionKind
  by: string
  ownerId?: string
  /** The approval request after this action. */
  request?: ApprovalRequest
  /** A queue item created in the browser (e.g. an over-limit request from a stress test). */
  item?: OpsItem
  /** Policy actions: the proposal after this action. */
  policy?: PolicyProposal
  events: AuditInput[]
}

export interface ItemState {
  status: "not_yet" | "open" | "done"
  ownerId: string | null
  request: ApprovalRequest | null
  completedAt: string | null
  sla: SlaState
  takenOverAt: string | null
  history: { at: string; who: string; text: string; mine: boolean }[]
}

const TAKES_OVER: UserActionKind[] = ["assigned", "prepared", "approved", "escalated", "rejected", "blocked", "completed", "item_created"]

const firstTakeover = (item: OpsItem, actions: UserAction[], now: string) =>
  actions.find((a) => a.itemId === item.id && a.at <= now && TAKES_OVER.includes(a.kind))?.at ?? null

const name = (id: string) => member(id)?.name ?? id

/** The simulated approval request as of `cutoff`, rebuilt from the team's steps. */
function simRequest(item: OpsItem, cutoff: string): ApprovalRequest | null {
  const a = item.approval
  const prep = item.steps.find((s) => s.action === "prepared")
  if (!a || !prep || prep.end > cutoff || !item.ownerId) return null
  const later = item.steps.filter((s) => s.action !== "prepared" && s.action !== "worked" && s.end <= cutoff)
  const escalations = later
    .filter((s) => s.action === "escalated")
    .map((s) => {
      const from = member(s.who)!.role
      return { from, to: ROLE_ORDER[ROLE_ORDER.indexOf(from) + 1], by: s.who, at: s.end }
    })
  const done = later.find((s) => s.action === "approved")
  return Object.freeze({
    id: `apv_${item.id.replace(/^q_/, "")}`,
    kind: a.kind,
    subject: item.subject,
    amountCents: a.amountCents,
    summary: item.title,
    preparedBy: item.ownerId,
    preparedAt: prep.end,
    requiredRole: requiredRoleFor(a.amountCents, a.minimumRole),
    status: done ? "approved" : "pending",
    decidedBy: done?.who,
    decidedAt: done?.end,
    escalations,
  })
}

export function itemAt(item: OpsItem, now: string, actions: UserAction[]): ItemState {
  if (item.createdAt > now) return { status: "not_yet", ownerId: null, request: null, completedAt: null, sla: "on_time", takenOverAt: null, history: [] }
  const takenOverAt = firstTakeover(item, actions, now)
  const cutoff = takenOverAt && takenOverAt < now ? takenOverAt : now
  const steps = item.steps.filter((s) => s.start <= cutoff)
  const history: ItemState["history"] = [{ at: item.createdAt, who: "System", text: `Added to ${OPS.queues[item.queue].label}.`, mine: false }]
  for (const s of steps) {
    history.push({ at: s.start, who: name(s.who), text: s.action === "worked" ? "Started work." : s.action === "prepared" ? "Started preparing." : "Picked up for review.", mine: false })
    if (s.end <= cutoff) history.push({ at: s.end, who: name(s.who), text: { worked: "Finished.", prepared: "Prepared for approval.", approved: "Approved.", escalated: "Above their authority: escalated." }[s.action], mine: false })
  }

  let ownerId = steps.length ? item.ownerId : null
  let request = simRequest(item, cutoff)
  let completedAt = item.completedAt && item.completedAt <= cutoff ? item.completedAt : null

  for (const a of actions.filter((x) => x.itemId === item.id && x.at <= now)) {
    if (a.ownerId) ownerId = a.ownerId
    if (a.request) request = a.request
    if (a.kind === "completed" || (a.request && a.request.status !== "pending")) completedAt ??= a.at
    history.push({ at: a.at, who: name(a.by), text: a.events.map((e) => e.reason ?? e.action).join(" "), mine: true })
  }
  if (completedAt && completedAt > now) completedAt = null
  const status = completedAt ? "done" : "open"
  return { status, ownerId, request, completedAt, sla: slaState({ createdAt: item.createdAt, slaDueAt: item.slaDueAt, completedAt }, now), takenOverAt, history: history.sort((x, y) => x.at.localeCompare(y.at)) }
}

/** The audit trail as of `now`: the team's events (minus taken-over items' later steps) and the browser's actions, in time order. */
export function auditAt(serverEvents: readonly AuditEvent[], eventItems: readonly (string | null)[], items: OpsItem[], actions: UserAction[], now: string): AuditLog {
  const takeovers = new Map(items.map((i) => [i.id, firstTakeover(i, actions, now)]))
  const rows: { at: string; order: number; input: AuditInput }[] = []
  serverEvents.forEach((e, i) => {
    if (e.at > now) return
    const t = eventItems[i] ? takeovers.get(eventItems[i]!) : null
    if (t && e.at > t) return
    rows.push({ at: e.at, order: i, input: { at: e.at, actor: e.actor, action: e.action, subject: e.subject, before: e.before, after: e.after, reason: e.reason } })
  })
  let order = serverEvents.length
  for (const a of actions) if (a.at <= now) for (const input of a.events) rows.push({ at: a.at, order: order++, input })
  const log = new AuditLog()
  for (const r of rows.sort((x, y) => x.at.localeCompare(y.at) || x.order - y.order)) log.append(r.input)
  return log
}

/*
 * Actions a person takes in the console. Each runs the real maker-checker
 * functions against a scratch log and returns the events to record.
 */

const capture = (fn: (log: AuditLog) => ApprovalRequest | void) => {
  const log = new AuditLog()
  try {
    const request = fn(log) ?? undefined
    return { request, events: log.all.map(toInput), error: null as string | null }
  } catch (e) {
    return { request: undefined, events: log.all.map(toInput), error: e instanceof Error ? e.message : "Not allowed." }
  }
}

function toInput(e: AuditEvent): AuditInput {
  return { at: e.at, actor: e.actor, action: e.action, subject: e.subject, before: e.before, after: e.after, reason: e.reason }
}

export type ActionResult = { action: UserAction; error: string | null }

export function assign(item: OpsItem, state: ItemState, to: string, by: string, at: string, auto = false): ActionResult {
  const events: AuditInput[] = [
    {
      at,
      actor: auto ? { kind: "system", id: "auto-assign" } : { kind: "user", id: by },
      action: "queue_item.assigned",
      subject: item.subject,
      before: { owner: state.ownerId },
      after: { owner: to },
      reason: auto ? `Auto-assigned by skill to ${name(to)} (least open work).` : `Assigned to ${name(to)}.`,
    },
  ]
  return { action: { itemId: item.id, at, kind: "assigned", by, ownerId: to, events }, error: null }
}

export function complete(item: OpsItem, by: string, at: string): ActionResult {
  if (item.approval) return { action: { itemId: item.id, at, kind: "blocked", by, events: [] }, error: "This item needs an approval, not just marking done." }
  const events: AuditInput[] = [{ at, actor: { kind: "user", id: by }, action: "queue_item.completed", subject: item.subject, before: { status: "open" }, after: { status: "done" }, reason: "Marked done." }]
  return { action: { itemId: item.id, at, kind: "completed", by, events }, error: null }
}

export function prepareItem(item: OpsItem, by: string, at: string): ActionResult {
  const a = item.approval!
  const r = capture((log) =>
    prepare(log, { id: `apv_${item.id.replace(/^q_/, "")}-u`, kind: a.kind, subject: item.subject, amountCents: a.amountCents, summary: item.title, preparedBy: by, at, minimumRole: a.minimumRole }),
  )
  return { action: { itemId: item.id, at, kind: "prepared", by, ownerId: by, request: r.request, events: r.events }, error: r.error }
}

export function decide(item: OpsItem, req: ApprovalRequest, by: string, at: string, verdict: "approve" | "reject", reason = ""): ActionResult {
  const r = capture((log) => (verdict === "approve" ? approve(log, req, by, at) : reject(log, req, by, at, reason || "Rejected.")))
  const kind: UserActionKind = r.error ? "blocked" : verdict === "reject" ? "rejected" : r.request!.status === "approved" ? "approved" : "escalated"
  return { action: { itemId: item.id, at, kind, by, request: r.request, events: r.events }, error: r.error }
}

export function messageSent(item: OpsItem, subjectLine: string, by: string, at: string): ActionResult {
  const events: AuditInput[] = [{ at, actor: { kind: "user", id: by }, action: "communication.sent", subject: item.subject, after: { subject: subjectLine, simulated: true }, reason: `Message sent (simulated): "${subjectLine}".` }]
  return { action: { itemId: item.id, at, kind: "message_sent", by, events }, error: null }
}

/** Open work per person at `now`, in minutes, against their daily capacity. */
export function workload(items: OpsItem[], states: Map<string, ItemState>): { id: string; minutes: number; capacity: number; open: number }[] {
  return OPS.team.map((m) => {
    const mine = items.filter((i) => states.get(i.id)?.status === "open" && states.get(i.id)?.ownerId === m.id)
    return { id: m.id, minutes: mine.reduce((t, i) => t + OPS.queues[i.queue].minutesPerItem, 0), capacity: m.capacity, open: mine.length }
  })
}

/** Who auto-assign picks: a skilled analyst or lead with the least open work. */
export function suggestOwner(item: OpsItem, load: ReturnType<typeof workload>): string | null {
  const skilled = OPS.team.filter((m) => m.skills.includes(OPS.queues[item.queue].skill) && (m.role === "analyst" || m.role === "lead"))
  const ranked = skilled.map((m) => ({ m, l: load.find((x) => x.id === m.id)!.minutes })).sort((a, b) => a.l - b.l || a.m.id.localeCompare(b.m.id))
  return ranked[0]?.m.id ?? null
}

/** Every policy proposal's latest state, in the order they were prepared. */
export function proposalsFrom(actions: UserAction[], now: string): PolicyProposal[] {
  const byId = new Map<string, PolicyProposal>()
  for (const a of actions) if (a.policy && a.at <= now) byId.set(a.policy.id, a.policy)
  return [...byId.values()]
}

/** Runs a policy step against a scratch log and returns the action to record (with any error). */
export function policyAction(by: string, at: string, kind: "policy_proposed" | "policy_decided", fn: (log: AuditLog) => PolicyProposal): ActionResult {
  const log = new AuditLog()
  try {
    const policy = fn(log)
    return { action: { itemId: null, at, kind, by, policy, events: log.all.map(toInput) }, error: null }
  } catch (e) {
    return { action: { itemId: null, at, kind: "blocked", by, events: log.all.map(toInput) }, error: e instanceof Error ? e.message : "Not allowed." }
  }
}

/** Queue items created in the browser, as of `now`. */
export function browserItems(actions: UserAction[], now: string): OpsItem[] {
  return actions.flatMap((a) => (a.item && a.at <= now ? [a.item] : []))
}

/**
 * An over-limit request from the poor-harvest stress test: a Credit
 * referrals and sign-offs item, prepared by the person who raises it, so a
 * different person with enough authority must approve it.
 */
export function overLimitRequest(input: {
  loanId: string
  applicantName: string
  mode: Mode
  limitCents: number
  needCents: number
  requestedLimitCents: number
  dropPct: number
  by: string
  at: string
}): ActionResult {
  const id = `q_overlimit-${input.loanId.replace(/^loan_/, "")}-${input.dropPct}`
  const item: OpsItem = {
    id,
    queue: "credit_referral",
    title: `${input.applicantName}: over-limit request to ${formatCents(input.requestedLimitCents, { whole: true })}`,
    detail: `Stress test (illustrative): with peak-season revenue ${input.dropPct}% lower, next season would need ${formatCents(input.needCents, { whole: true })} against a ${formatCents(input.limitCents, { whole: true })} limit at ${MODE_META[input.mode].institution}.`,
    mode: input.mode,
    subject: { kind: "loan", id: input.loanId },
    href: `/loans/${input.loanId}`,
    createdAt: input.at,
    slaDueAt: addBusinessHours(nextBusinessMoment(input.at), OPS.queues.credit_referral.slaBusinessHours),
    priority: "high",
    nextAction: "Review the stress test and the borrower's plans; approve a limit increase, or agree another option.",
    approval: { kind: "limit_override", amountCents: input.requestedLimitCents, minimumRole: "lead" },
    steps: [],
    ownerId: input.by,
    approverId: null,
    completedAt: null,
  }
  const log = new AuditLog()
  log.append({ at: input.at, actor: { kind: "user", id: input.by }, action: "queue_item.created", subject: item.subject, after: { queue: item.queue, title: item.title, slaDueAt: item.slaDueAt }, reason: item.detail })
  try {
    const request = prepare(log, {
      id: `apv_${id.replace(/^q_/, "")}`,
      kind: "limit_override",
      subject: item.subject,
      amountCents: input.requestedLimitCents,
      summary: item.title,
      preparedBy: input.by,
      at: input.at,
      minimumRole: "lead",
    })
    return { action: { itemId: id, at: input.at, kind: "item_created", by: input.by, ownerId: input.by, request, item, events: log.all.map(toInput) }, error: null }
  } catch (e) {
    return { action: { itemId: id, at: input.at, kind: "blocked", by: input.by, events: [] }, error: e instanceof Error ? e.message : "Not allowed." }
  }
}
