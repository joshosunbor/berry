import type { SubjectRef } from "@/lib/schemas"
import type { AuditLog } from "./audit"
import { member, OPS, ROLE_ORDER, type Role, type TeamMember } from "./config"

/*
 * Maker-checker with delegated authority. The person who prepares an action
 * can never approve it. A checker can approve only up to their role's
 * delegated authority limit; above it, the request escalates to the next
 * role. Requests are immutable: every change returns a new request, and
 * every action writes one audit event.
 */

export type ApprovalKind = "credit_signoff" | "hardship" | "payee_release" | "ledger_correction" | "policy_change" | "limit_override"

export interface ApprovalRequest {
  id: string
  kind: ApprovalKind
  subject: SubjectRef
  /** The amount the authority limit is checked against, in cents. */
  amountCents: number
  summary: string
  preparedBy: string
  preparedAt: string
  /** The least senior role that may approve this amount. */
  requiredRole: Role
  status: "pending" | "approved" | "rejected"
  decidedBy?: string
  decidedAt?: string
  escalations: { from: Role; to: Role; by: string; at: string }[]
}

export class MakerCheckerViolation extends Error {}
export class NotAuthorized extends Error {}

export function limitFor(role: Role): number | null {
  return OPS.authority[role].limitCents
}

/** The least senior role whose limit covers the amount. */
export function roleFor(amountCents: number): Role {
  return ROLE_ORDER.find((r) => {
    const limit = limitFor(r)
    return limit === null || amountCents <= limit
  })!
}

const rank = (r: Role) => ROLE_ORDER.indexOf(r)

/** The role an approval needs: whoever's limit covers the amount, and never below a kind's minimum (e.g. hardship needs a lead). */
export function requiredRoleFor(amountCents: number, minimumRole: Role = "analyst"): Role {
  const byAmount = roleFor(amountCents)
  return rank(byAmount) >= rank(minimumRole) ? byAmount : minimumRole
}
const freeze = (r: ApprovalRequest): ApprovalRequest => Object.freeze({ ...r, escalations: Object.freeze([...r.escalations]) as ApprovalRequest["escalations"] })

function person(id: string): TeamMember {
  const m = member(id)
  if (!m) throw new NotAuthorized(`unknown team member ${id}`)
  return m
}

export function prepare(
  log: AuditLog,
  input: { id: string; kind: ApprovalKind; subject: SubjectRef; amountCents: number; summary: string; preparedBy: string; at: string; minimumRole?: Role },
): ApprovalRequest {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) throw new Error("amount must be whole cents")
  person(input.preparedBy)
  const { minimumRole, ...rest } = input
  const req = freeze({ ...rest, preparedAt: input.at, requiredRole: requiredRoleFor(input.amountCents, minimumRole), status: "pending", escalations: [] })
  log.append({ at: input.at, actor: { kind: "user", id: input.preparedBy }, action: "approval.prepared", subject: input.subject, after: snapshot(req), reason: input.summary })
  return req
}

/**
 * Who prepared a request and the role it needs, as the audit trail recorded
 * them when it was prepared. The request object a caller passes in is never
 * trusted for these, so a copy with a different maker or a lower role
 * changes nothing.
 */
function preparedRecord(log: AuditLog, id: string): { preparedBy: string; requiredRole: Role } {
  const e = [...log.all].reverse().find((x) => x.action === "approval.prepared" && (x.after as { id?: string } | undefined)?.id === id)
  if (!e) throw new NotAuthorized(`request ${id} was never prepared on this audit trail`)
  const after = e.after as { requiredRole: Role }
  return { preparedBy: e.actor.id, requiredRole: after.requiredRole }
}

/**
 * Approve as `checkerId`. Throws if the checker prepared the request. If the
 * amount is above the checker's delegated authority, the request escalates
 * to the next role instead of being approved.
 */
export function approve(log: AuditLog, given: ApprovalRequest, checkerId: string, at: string): ApprovalRequest {
  if (given.status !== "pending") throw new Error(`request ${given.id} is already ${given.status}`)
  const req: ApprovalRequest = { ...given, ...preparedRecord(log, given.id) }
  if (checkerId === req.preparedBy) {
    log.append({ at, actor: { kind: "user", id: checkerId }, action: "approval.blocked", subject: req.subject, before: snapshot(req), after: snapshot(req), reason: "Maker-checker: the person who prepared this can't approve it." })
    throw new MakerCheckerViolation("The person who prepared this can't approve it.")
  }
  const checker = person(checkerId)
  if (rank(checker.role) < rank(req.requiredRole)) {
    // Escalate one level up; the role needed to approve never goes down.
    const to = ROLE_ORDER[rank(checker.role) + 1]
    const next = freeze({ ...req, escalations: [...req.escalations, { from: checker.role, to, by: checkerId, at }] })
    log.append({
      at,
      actor: { kind: "user", id: checkerId },
      action: "approval.escalated",
      subject: req.subject,
      before: snapshot(req),
      after: snapshot(next),
      reason: `Above ${checker.role.replace("_", " ")} authority; escalated to ${to.replace("_", " ")}.`,
    })
    return next
  }
  const next = freeze({ ...req, status: "approved", decidedBy: checkerId, decidedAt: at })
  log.append({ at, actor: { kind: "user", id: checkerId }, action: "approval.approved", subject: req.subject, before: snapshot(req), after: snapshot(next) })
  return next
}

export function reject(log: AuditLog, given: ApprovalRequest, checkerId: string, at: string, reason: string): ApprovalRequest {
  if (given.status !== "pending") throw new Error(`request ${given.id} is already ${given.status}`)
  const req: ApprovalRequest = { ...given, ...preparedRecord(log, given.id) }
  if (checkerId === req.preparedBy) throw new MakerCheckerViolation("The person who prepared this can't decide on it.")
  person(checkerId)
  const next = freeze({ ...req, status: "rejected", decidedBy: checkerId, decidedAt: at })
  log.append({ at, actor: { kind: "user", id: checkerId }, action: "approval.rejected", subject: req.subject, before: snapshot(req), after: snapshot(next), reason })
  return next
}

function snapshot(r: ApprovalRequest) {
  return { id: r.id, amountCents: r.amountCents, status: r.status, requiredRole: r.requiredRole, decidedBy: r.decidedBy ?? null, escalations: r.escalations.length }
}
