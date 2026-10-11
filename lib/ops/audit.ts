import { AuditEvent, type SubjectRef } from "@/lib/schemas"
import { sha256 } from "./sha256"

/*
 * Append-only audit trail. Each event records who (actor), what (action and
 * subject), when, why, and the state before and after. Events are chained:
 * each carries the previous event's hash, and its own hash covers every
 * field, so editing, removing or reordering any event breaks verify().
 * There is no update or delete method; entries are frozen.
 */

export interface AuditInput {
  at: string
  actor: { kind: "user" | "system" | "engine"; id: string }
  action: string
  subject: SubjectRef
  before?: unknown
  after?: unknown
  reason?: string
}

export const GENESIS = "0".repeat(64)

/** Stable JSON: object keys sorted, so the same event always hashes the same. */
export function canonical(value: unknown): string {
  if (value === undefined) return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  const o = value as Record<string, unknown>
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`
}

const hashOf = (e: Omit<AuditEvent, "hash">) => sha256(canonical(e))

export class AuditLog {
  private readonly events: AuditEvent[] = []

  constructor(initial: readonly AuditEvent[] = []) {
    for (const e of initial) this.events.push(Object.freeze({ ...e }))
    const bad = this.verify()
    if (bad !== null) throw new Error(`audit log failed verification at event ${bad}`)
  }

  append(input: AuditInput): AuditEvent {
    const seq = this.events.length
    const body = {
      id: `aud_${String(seq + 1).padStart(6, "0")}`,
      seq,
      at: input.at,
      actor: input.actor,
      action: input.action,
      subject: input.subject,
      before: input.before,
      after: input.after,
      reason: input.reason,
      prevHash: this.events.at(-1)?.hash ?? GENESIS,
    }
    const event = AuditEvent.parse({ ...body, hash: hashOf(body) })
    this.events.push(Object.freeze(event))
    return event
  }

  get size(): number {
    return this.events.length
  }

  /** A frozen copy: read-only. */
  get all(): readonly AuditEvent[] {
    return Object.freeze([...this.events])
  }

  /** Index of the first event whose chain or hash doesn't check out, or null if the whole log is intact. */
  verify(): number | null {
    return verifyChain(this.events)
  }

  toJSON(): string {
    return JSON.stringify(this.events, null, 2)
  }

  toCSV(): string {
    const head = ["seq", "at", "actor", "action", "subject", "reason", "before", "after", "hash"]
    const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`
    const rows = this.events.map((e) =>
      [e.seq, e.at, `${e.actor.kind}:${e.actor.id}`, e.action, `${e.subject.kind}:${e.subject.id}`, e.reason, e.before === undefined ? "" : canonical(e.before), e.after === undefined ? "" : canonical(e.after), e.hash].map(cell).join(","),
    )
    return [head.join(","), ...rows].join("\n")
  }
}

export function verifyChain(events: readonly AuditEvent[]): number | null {
  let prev = GENESIS
  for (let i = 0; i < events.length; i++) {
    const { hash, ...body } = events[i]
    if (body.seq !== i || body.prevHash !== prev || hashOf(body) !== hash) return i
    prev = hash
  }
  return null
}
