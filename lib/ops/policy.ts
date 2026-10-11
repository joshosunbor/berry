import { decide } from "@/lib/engine/decide"
import type { Features } from "@/lib/engine/features"
import { MODE_META, MODES, type Mode } from "@/lib/modes"
import { InstitutionConfig, type EngineInput, type Outcome, type ProductType } from "@/lib/schemas"
import { approve, prepare, reject, type ApprovalRequest } from "./approvals"
import type { AuditLog } from "./audit"
import type { Role } from "./config"

/*
 * Policy changes (CLAUDE.md §5C). Editing a lender's thresholds prepares a
 * new version with an impact preview: which cast and planted-case decisions
 * would change, at every lender, before anyone can approve. Maker-checker
 * applies: the preparer can't approve, and approval needs a branch manager
 * or above. Every version is kept; a rollback is a new version that copies
 * an earlier one, and goes through the same approval.
 *
 * Simulation only: approved versions apply inside the console's preview.
 * Published decisions elsewhere on the site use the configs in
 * data/institutions.
 */

export const POLICY_APPROVER: Role = "branch_manager"

export interface PolicyField {
  key: string
  label: string
  unit: "x" | "months" | "count" | "share" | "cents"
  step: number
  min: number
  max: number
}

const f = (key: string, label: string, unit: PolicyField["unit"], step: number, min: number, max: number): PolicyField => ({ key, label, unit, step, min, max })

/** The thresholds the console lets a lender edit (all illustrative). */
export const POLICY_FIELDS: Record<Mode, PolicyField[]> = {
  credit_union: [
    f("minDscr", "Minimum debt service coverage", "x", 0.05, 1, 2),
    f("relationshipMinDscr", "Minimum coverage with a strong relationship", "x", 0.05, 1, 2),
    f("seasonalPeakCoverage", "Seasonal: minimum coverage in peak months", "x", 0.05, 1, 2),
    f("relationshipSeasonalPeakCoverage", "Seasonal: peak coverage with a strong relationship", "x", 0.05, 1, 2),
    f("maxNsf90", "Most returned payments allowed in 90 days", "count", 1, 0, 6),
    f("thinFileMemberMaxCents", "Thin-file member starter limit", "cents", 50_000, 50_000, 1_000_000),
  ],
  fintech: [
    f("minHistoryMonths", "Minimum months of account history", "months", 1, 1, 24),
    f("maxNsf90", "Most returned payments allowed in 90 days", "count", 1, 0, 6),
    f("minDscrOnMedian", "Minimum coverage on a typical month", "x", 0.05, 1, 2),
    f("personalRevolvingToMedianNet", "Personal revolving limit, in months of typical net cash flow", "x", 0.5, 1, 10),
    f("businessRevolvingToMedianNet", "Business revolving limit, in months of typical net cash flow", "x", 0.5, 0.5, 10),
    f("thinFileMaxCents", "Thin-file starter limit", "cents", 25_000, 25_000, 500_000),
  ],
  bank: [
    f("minHistoryMonths", "Minimum months of account history", "months", 1, 1, 36),
    f("minCreditHistoryMonths", "Minimum months of credit history", "months", 1, 0, 60),
    f("maxIncomeCv", "Most income variation allowed (CV)", "share", 0.05, 0.05, 1.5),
    f("minDscr", "Minimum debt service coverage", "x", 0.05, 1, 2),
    f("maxNsf12m", "Most returned payments allowed in 12 months", "count", 1, 0, 6),
    f("maxCreditUtilization", "Most credit utilization allowed", "share", 0.05, 0.5, 1),
  ],
}

export interface PolicyCase {
  slug: string
  name: string
  group: "cast" | "planted"
  /** Engine input without transactions: decisions read only the request, kind and features. */
  input: EngineInput
  features: Features
}

interface Snap {
  outcome: Outcome
  product: ProductType
  limitCents: number
  aprBps: number | null
}

export interface DecisionChange {
  slug: string
  name: string
  group: "cast" | "planted"
  from: Snap
  to: Snap
}

export interface Impact {
  /** Every lender is listed; only the lender whose policy changes can be affected. */
  byLender: Record<Mode, { cast: DecisionChange[]; planted: DecisionChange[]; casesChecked: { cast: number; planted: number } }>
}

export interface ThresholdDiff {
  key: string
  from: number
  to: number
}

export interface PolicyVersionRecord {
  mode: Mode
  version: number
  config: InstitutionConfig
  kind: "initial" | "change" | "rollback"
  rollbackTo?: number
  diff: ThresholdDiff[]
  why: string
  preparedBy?: string
  checker?: string
  activatedAt?: string
}

export interface PolicyProposal {
  id: string
  mode: Mode
  kind: "change" | "rollback"
  /** The version this was prepared against; it can only be approved while that is still current. */
  baseVersion: number
  rollbackTo?: number
  diff: ThresholdDiff[]
  why: string
  proposed: InstitutionConfig
  impact: Impact
  request: ApprovalRequest
}

export class PolicyError extends Error {}

const snap = (c: PolicyCase, mode: Mode, config: InstitutionConfig): Snap => {
  const d = decide(c.input, mode, config, c.features)
  return { outcome: d.outcome, product: d.product, limitCents: d.limitCents, aprBps: d.aprBps }
}
const same = (a: Snap, b: Snap) => a.outcome === b.outcome && a.product === b.product && a.limitCents === b.limitCents && a.aprBps === b.aprBps

/** Which decisions change, per lender, if `mode`'s policy goes from `current` to `proposed`. */
export function impactOf(mode: Mode, current: InstitutionConfig, proposed: InstitutionConfig, cases: PolicyCase[]): Impact {
  const byLender = {} as Impact["byLender"]
  for (const m of MODES) {
    const changes: DecisionChange[] = []
    if (m === mode) {
      for (const c of cases) {
        const from = snap(c, m, current)
        const to = snap(c, m, proposed)
        if (!same(from, to)) changes.push({ slug: c.slug, name: c.name, group: c.group, from, to })
      }
    }
    byLender[m] = {
      cast: changes.filter((c) => c.group === "cast"),
      planted: changes.filter((c) => c.group === "planted"),
      casesChecked: { cast: cases.filter((c) => c.group === "cast").length, planted: cases.filter((c) => c.group === "planted").length },
    }
  }
  return { byLender }
}

export function diffThresholds(a: InstitutionConfig, b: InstitutionConfig): ThresholdDiff[] {
  const keys = [...new Set([...Object.keys(a.thresholds), ...Object.keys(b.thresholds)])].sort()
  return keys.filter((k) => a.thresholds[k] !== b.thresholds[k]).map((k) => ({ key: k, from: a.thresholds[k], to: b.thresholds[k] }))
}

const policySubject = (mode: Mode) => ({ kind: "policy" as const, id: `pol_${MODE_META[mode].institutionId}` })

function validate(mode: Mode, values: Record<string, number>) {
  const fields = POLICY_FIELDS[mode]
  for (const [k, v] of Object.entries(values)) {
    const field = fields.find((x) => x.key === k)
    if (!field) throw new PolicyError(`${k} can't be edited here.`)
    if (!Number.isFinite(v) || v < field.min || v > field.max) throw new PolicyError(`${field.label} must be between ${field.min} and ${field.max}.`)
    if (field.unit === "count" || field.unit === "months" || field.unit === "cents") {
      if (!Number.isInteger(v)) throw new PolicyError(`${field.label} must be a whole number.`)
    }
  }
}

function prepareProposal(
  log: AuditLog,
  p: Omit<PolicyProposal, "request" | "impact" | "diff" | "id">,
  current: InstitutionConfig,
  cases: PolicyCase[],
  by: string,
  at: string,
  seq: number,
): PolicyProposal {
  const diff = diffThresholds(current, p.proposed)
  if (diff.length === 0) throw new PolicyError("Nothing would change: the proposed thresholds match the current version.")
  if (p.why.trim().length < 10) throw new PolicyError("Say why, in a sentence, so the checker and the audit trail have it.")
  const impact = impactOf(p.mode, current, p.proposed, cases)
  const id = `apv_policy-${MODE_META[p.mode].institutionId}-v${p.proposed.version}-${seq}`
  const changed = impact.byLender[p.mode]
  log.append({
    at,
    actor: { kind: "user", id: by },
    action: p.kind === "rollback" ? "policy.rollback_proposed" : "policy.change_proposed",
    subject: policySubject(p.mode),
    before: { version: current.version, ...Object.fromEntries(diff.map((d) => [d.key, d.from])) },
    after: { version: p.proposed.version, ...Object.fromEntries(diff.map((d) => [d.key, d.to])) },
    reason: `${p.why.trim()} Impact: ${changed.cast.length} cast and ${changed.planted.length} planted-case decisions would change.`,
  })
  const request = prepare(log, { id, kind: "policy_change", subject: policySubject(p.mode), amountCents: 0, summary: `${MODE_META[p.mode].institution} policy v${p.proposed.version}`, preparedBy: by, at, minimumRole: POLICY_APPROVER })
  return { ...p, id, diff, impact, request, why: p.why.trim() }
}

/** Prepares a threshold change: version current + 1, with its impact preview. */
export function proposeChange(
  log: AuditLog,
  input: { mode: Mode; current: InstitutionConfig; values: Record<string, number>; why: string; by: string; at: string; cases: PolicyCase[]; seq?: number },
): PolicyProposal {
  validate(input.mode, input.values)
  const proposed = InstitutionConfig.parse({
    ...input.current,
    version: input.current.version + 1,
    effectiveFrom: input.at.slice(0, 10),
    changeNote: input.why.trim(),
    thresholds: { ...input.current.thresholds, ...input.values },
  })
  return prepareProposal(log, { mode: input.mode, kind: "change", baseVersion: input.current.version, why: input.why, proposed }, input.current, input.cases, input.by, input.at, input.seq ?? 0)
}

/** Prepares a rollback: a new version that copies an earlier one's thresholds. History is never rewritten. */
export function proposeRollback(
  log: AuditLog,
  input: { mode: Mode; current: InstitutionConfig; target: PolicyVersionRecord; why: string; by: string; at: string; cases: PolicyCase[]; seq?: number },
): PolicyProposal {
  if (input.target.version >= input.current.version) throw new PolicyError("You can only roll back to an earlier version.")
  const proposed = InstitutionConfig.parse({
    ...input.target.config,
    version: input.current.version + 1,
    effectiveFrom: input.at.slice(0, 10),
    changeNote: `Rollback to v${input.target.version}: ${input.why.trim()}`,
  })
  return prepareProposal(
    log,
    { mode: input.mode, kind: "rollback", baseVersion: input.current.version, rollbackTo: input.target.version, why: input.why, proposed },
    input.current,
    input.cases,
    input.by,
    input.at,
    input.seq ?? 0,
  )
}

/**
 * Approve or reject a proposal. Approval needs the checker to have reviewed
 * the impact, the proposal to still be against the current version, and a
 * different person from the preparer with enough authority (else escalates).
 */
export function decideProposal(
  log: AuditLog,
  p: PolicyProposal,
  input: { checker: string; at: string; verdict: "approve" | "reject"; currentVersion: number; impactReviewed: boolean; reason?: string },
): { proposal: PolicyProposal; activated: boolean } {
  if (input.verdict === "reject") return { proposal: { ...p, request: reject(log, p.request, input.checker, input.at, input.reason || "Rejected.") }, activated: false }
  if (!input.impactReviewed) throw new PolicyError("Review the impact on decisions before approving.")
  if (p.baseVersion !== input.currentVersion)
    throw new PolicyError(`This was prepared against v${p.baseVersion}, but the policy is now v${input.currentVersion}. Prepare it again so the impact is current.`)
  const request = approve(log, p.request, input.checker, input.at)
  const activated = request.status === "approved"
  if (activated) {
    log.append({
      at: input.at,
      actor: { kind: "user", id: input.checker },
      action: p.kind === "rollback" ? "policy.rolled_back" : "policy.activated",
      subject: policySubject(p.mode),
      before: { version: p.baseVersion },
      after: { version: p.proposed.version, ...(p.rollbackTo ? { copiesVersion: p.rollbackTo } : {}) },
      reason: p.why,
    })
  }
  return { proposal: { ...p, request }, activated }
}

/** The version history: the published version plus every approved proposal, in order. */
export function versionHistory(mode: Mode, published: InstitutionConfig, proposals: PolicyProposal[]): PolicyVersionRecord[] {
  const out: PolicyVersionRecord[] = [{ mode, version: published.version, config: published, kind: "initial", diff: [], why: published.changeNote }]
  for (const p of proposals.filter((x) => x.mode === mode && x.request.status === "approved")) {
    out.push({
      mode,
      version: p.proposed.version,
      config: p.proposed,
      kind: p.kind,
      rollbackTo: p.rollbackTo,
      diff: p.diff,
      why: p.why,
      preparedBy: p.request.preparedBy,
      checker: p.request.decidedBy,
      activatedAt: p.request.decidedAt,
    })
  }
  return out
}

export function formatThreshold(field: PolicyField | undefined, v: number): string {
  if (!field) return String(v)
  switch (field.unit) {
    case "x":
      return `${v.toFixed(2)}x`
    case "share":
      return v.toFixed(2)
    case "cents":
      return `$${(v / 100).toLocaleString("en-CA")}`
    case "months":
      return `${v} months`
    default:
      return String(v)
  }
}
