import { z } from "zod"
import { InstitutionId, IsoDateTime, SubjectRef, prefixedId } from "./common"

/**
 * Operations times are the lender's local business time, "YYYY-MM-DDTHH:MM",
 * deliberately without a zone (the fictional lenders aren't placed anywhere).
 */
const LocalTime = z.union([IsoDateTime, z.iso.datetime({ local: true })])

/* Operations: work queues, team, maker-checker, audit trail, policy versions. */

export const QueueName = z.enum([
  "verification",
  "credit_referral",
  "fintrac_review",
  "collections",
  "reconciliation",
  "hardship",
  "payee_confirmation",
])

export const Priority = z.enum(["low", "normal", "high", "urgent"])

export const QueueItem = z.object({
  id: prefixedId("q"),
  queue: QueueName,
  subject: SubjectRef,
  title: z.string().min(1),
  priority: Priority,
  status: z.enum(["open", "in_progress", "waiting", "done"]),
  createdAt: LocalTime,
  /** SLA due time; the UI derives green / amber / breached from it. */
  slaDueAt: LocalTime,
  ownerId: prefixedId("usr").optional(),
  nextAction: z.string().min(1),
  playbookId: z.string(),
  /** For credit referrals: which authority tier must approve. */
  authorityTierId: z.string().optional(),
  closedAt: LocalTime.optional(),
})

export const Analyst = z.object({
  id: prefixedId("usr"),
  /** Fictional team member. */
  name: z.string().min(1),
  role: z.enum(["analyst", "lead", "branch_manager", "credit_committee"]),
  skills: z.array(QueueName),
  /** Work points per day. */
  capacity: z.number().int().positive(),
})

export const Actor = z.object({
  kind: z.enum(["user", "system", "engine"]),
  id: z.string().min(1),
})

/**
 * Append-only audit event. Each event carries the previous event's hash, so
 * any edit or deletion breaks the chain and is detectable.
 */
export const AuditEvent = z.object({
  id: prefixedId("aud"),
  seq: z.number().int().nonnegative(),
  at: LocalTime,
  actor: Actor,
  action: z.string().regex(/^[a-z_]+\.[a-z_]+$/, "use noun.verb, e.g. decision.created"),
  subject: SubjectRef,
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  reason: z.string().optional(),
  prevHash: z.string(),
  hash: z.string(),
})

/** Maker-checker: the checker must be a different person from the maker. */
export const Approval = z
  .object({
    id: prefixedId("apv"),
    kind: z.enum(["limit_override", "hardship", "policy_change", "write_off"]),
    subject: SubjectRef,
    makerId: prefixedId("usr"),
    madeAt: LocalTime,
    checkerId: prefixedId("usr").optional(),
    checkedAt: LocalTime.optional(),
    status: z.enum(["pending", "approved", "rejected"]),
    reason: z.string().min(1),
  })
  .refine((a) => a.checkerId === undefined || a.checkerId !== a.makerId, {
    path: ["checkerId"],
    message: "maker and checker must be different people",
  })
  .refine((a) => a.status === "pending" || (a.checkerId && a.checkedAt), {
    path: ["status"],
    message: "an approved or rejected item needs a checker",
  })

export const PolicyVersion = z.object({
  id: prefixedId("pol"),
  institutionId: InstitutionId,
  version: z.number().int().positive(),
  changedBy: prefixedId("usr"),
  changedAt: LocalTime,
  why: z.string().min(1),
  diff: z.array(z.object({ path: z.string(), from: z.unknown(), to: z.unknown() })),
  approvalId: prefixedId("apv").optional(),
})

export type QueueName = z.infer<typeof QueueName>
export type Priority = z.infer<typeof Priority>
export type QueueItem = z.infer<typeof QueueItem>
export type Analyst = z.infer<typeof Analyst>
export type Actor = z.infer<typeof Actor>
export type AuditEvent = z.infer<typeof AuditEvent>
export type Approval = z.infer<typeof Approval>
export type PolicyVersion = z.infer<typeof PolicyVersion>
