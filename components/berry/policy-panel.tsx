"use client"

import { useMemo, useState } from "react"
import { History, ShieldCheck } from "lucide-react"
import { InlineError } from "@/components/berry/inline-error"
import { Illustrative } from "@/components/berry/illustrative"
import { OutcomeChip } from "@/components/berry/outcome-chip"
import { CONFIGS } from "@/lib/engine/config"
import { PRODUCT_LABELS } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODE_META, MODES, type Mode } from "@/lib/modes"
import { member, type Role } from "@/lib/ops/config"
import {
  decideProposal,
  formatThreshold,
  impactOf,
  POLICY_APPROVER,
  POLICY_FIELDS,
  proposeChange,
  proposeRollback,
  versionHistory,
  type DecisionChange,
  type Impact,
  type PolicyCase,
  type PolicyProposal,
} from "@/lib/ops/policy"
import { policyAction, proposalsFrom, type ActionResult, type UserAction } from "@/lib/ops/view"
import { InstitutionConfig } from "@/lib/schemas"
import { cn } from "@/lib/utils"

/*
 * Policy changes in the operations console: edit a lender's thresholds,
 * see which decisions would change before anyone can approve, approve with
 * maker-checker, and roll back to any earlier version (also maker-checker).
 * Simulation only: versions apply inside this preview.
 */

const ROLE_LABEL: Record<Role, string> = { analyst: "Analyst", lead: "Lead", branch_manager: "Branch manager", credit_committee: "Credit Committee" }
const button = "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
const personName = (id?: string) => (id ? (member(id)?.name ?? id) : "—")
const when = (t?: string) => (t ? `${new Date(`${t}:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}, ${t.slice(11, 16)}` : "")
const fieldFor = (mode: Mode, key: string) => POLICY_FIELDS[mode].find((f) => f.key === key)
const labelFor = (mode: Mode, key: string) => fieldFor(mode, key)?.label ?? key

type ErrorState = { scope: string; text: string } | null

export function PolicyPanel({ cases, actions, actor, now, record }: { cases: PolicyCase[]; actions: UserAction[]; actor: string; now: string; record: (r: ActionResult) => void }) {
  const [mode, setMode] = useState<Mode>("bank")
  const [error, setError] = useState<ErrorState>(null)
  const proposals = useMemo(() => proposalsFrom(actions, now), [actions, now])
  const history = useMemo(() => versionHistory(mode, CONFIGS[mode], proposals), [mode, proposals])
  const current = history.at(-1)!.config
  const pending = proposals.filter((p) => p.mode === mode && p.request.status === "pending")
  const seq = proposals.length

  function run(scope: string, result: ActionResult) {
    if (result.action.events.length > 0) record(result)
    setError(result.error ? { scope, text: result.error } : null)
    return !result.error
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Lender" className="inline-flex rounded-lg border border-rule bg-surface p-1">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => (setMode(m), setError(null))}
              className={cn("rounded-md px-3 py-1 text-sm", mode === m ? "bg-ink text-background" : "text-muted-ink hover:text-ink")}
            >
              {MODE_META[m].institution}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-ink">
          Current: <span className="font-medium text-ink">v{current.version}</span> · effective {current.effectiveFrom}
        </p>
      </div>
      <p className="mt-2 text-xs text-muted-ink">
        Simulation only: an approved version applies inside this preview. Decisions elsewhere on the site use the published policy (v{CONFIGS[mode].version}). Changes need a{" "}
        {ROLE_LABEL[POLICY_APPROVER].toLowerCase()} or above, and the person who prepares a change can&apos;t approve it.{" "}
        <Illustrative why="Thresholds, roles and the team are illustrative; real policy governance varies by lender." />
      </p>

      <ChangeForm key={`${mode}-${current.version}-${seq}`} mode={mode} current={current} cases={cases} actor={actor} now={now} seq={seq} run={run} error={error?.scope === "new" ? error.text : null} />

      <section className="mt-8" aria-label="Waiting for approval">
        <h3 className="font-semibold">Waiting for approval</h3>
        {pending.length === 0 && <p className="mt-2 text-sm text-muted-ink">No changes waiting for {MODE_META[mode].institution}.</p>}
        <div className="mt-3 space-y-4">
          {pending.map((p) => (
            <ProposalCard key={p.id} p={p} currentVersion={current.version} actor={actor} now={now} run={run} error={error?.scope === p.id ? error.text : null} />
          ))}
        </div>
      </section>

      <section className="mt-8" aria-label="Version history">
        <h3 className="flex items-center gap-2 font-semibold">
          <History aria-hidden className="size-4" /> Version history
        </h3>
        <ol className="mt-3 space-y-3">
          {[...history].reverse().map((v) => (
            <li key={v.version} className="rounded-lg border border-rule bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  v{v.version}
                  {v.version === current.version && <span className="ml-2 rounded-full bg-approve-soft px-2 py-0.5 text-xs text-approve">Current</span>}
                  <span className="ml-2 text-sm font-normal text-muted-ink">
                    {v.kind === "initial" ? "Published policy" : v.kind === "rollback" ? `Rollback to v${v.rollbackTo}` : "Change"}
                  </span>
                </p>
                {v.kind !== "initial" && (
                  <p className="text-xs text-muted-ink">
                    Prepared by {personName(v.preparedBy)} · checker: {personName(v.checker)} · {when(v.activatedAt)}
                  </p>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-ink">{v.why}</p>
              {v.diff.length > 0 && <DiffList mode={mode} diff={v.diff} />}
              {v.version < current.version && (
                <RollbackForm
                  label={`Roll back to v${v.version}`}
                  error={error?.scope === `rollback-${v.version}` ? error.text : null}
                  onSubmit={(why) =>
                    run(
                      `rollback-${v.version}`,
                      policyAction(actor, now, "policy_proposed", (log) => proposeRollback(log, { mode, current, target: v, why, by: actor, at: now, cases, seq })),
                    )
                  }
                />
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function ChangeForm({
  mode,
  current,
  cases,
  actor,
  now,
  seq,
  run,
  error,
}: {
  mode: Mode
  current: InstitutionConfig
  cases: PolicyCase[]
  actor: string
  now: string
  seq: number
  run: (scope: string, r: ActionResult) => boolean
  error: string | null
}) {
  const fields = POLICY_FIELDS[mode]
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, String(current.thresholds[f.key])])))
  const [why, setWhy] = useState("")
  const parsed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)]))
  const changed = Object.fromEntries(Object.entries(parsed).filter(([k, v]) => v !== current.thresholds[k]))
  const valid = fields.every((f) => {
    const v = parsed[f.key]
    return Number.isFinite(v) && v >= f.min && v <= f.max
  })

  const changedKey = JSON.stringify(changed)
  const preview: Impact | null = useMemo(() => {
    const delta = JSON.parse(changedKey) as Record<string, number>
    if (!valid || Object.keys(delta).length === 0) return null
    try {
      const proposed = InstitutionConfig.parse({ ...current, version: current.version + 1, thresholds: { ...current.thresholds, ...delta } })
      return impactOf(mode, current, proposed, cases)
    } catch {
      return null
    }
  }, [mode, current, cases, valid, changedKey])

  return (
    <section className="mt-6 rounded-lg border border-rule bg-surface p-5" aria-label="Propose a change">
      <h3 className="font-semibold">Propose a change to {MODE_META[mode].institution}&apos;s thresholds</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="text-sm">
            <span className="block text-muted-ink">{f.label}</span>
            <span className="mt-1 flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step={f.unit === "cents" ? f.step / 100 : f.step}
                min={f.unit === "cents" ? f.min / 100 : f.min}
                max={f.unit === "cents" ? f.max / 100 : f.max}
                value={f.unit === "cents" ? String(Number(values[f.key]) / 100) : values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: f.unit === "cents" ? String(Math.round(Number(e.target.value) * 100)) : e.target.value }))}
                className={cn("num w-28 rounded-md border bg-surface px-2 py-1.5", changed[f.key] !== undefined ? "border-ink" : "border-rule")}
              />
              <span className="text-xs text-muted-ink">
                {f.unit === "cents" ? "dollars" : f.unit === "x" ? "times" : f.unit}
                {changed[f.key] !== undefined && <> · now {formatThreshold(f, current.thresholds[f.key])}</>}
              </span>
            </span>
          </label>
        ))}
      </div>
      <label className="mt-4 block text-sm">
        <span className="block text-muted-ink">Why (shown to the checker and kept in the audit trail)</span>
        <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-rule bg-surface px-2 py-1.5" />
      </label>

      <div className="mt-4">
        <h4 className="text-sm font-semibold">Impact preview</h4>
        {preview ? <ImpactView impact={preview} mode={mode} /> : <p className="mt-1 text-sm text-muted-ink">Change a threshold to see which decisions would change.</p>}
      </div>

      {error && <InlineError text={error} />}
      <button
        type="button"
        disabled={!preview}
        onClick={() => run("new", policyAction(actor, now, "policy_proposed", (log) => proposeChange(log, { mode, current, values: changed, why, by: actor, at: now, cases, seq })))}
        className={cn(button, "mt-4 bg-ink text-background")}
      >
        Prepare v{current.version + 1} as {personName(actor)}
      </button>
    </section>
  )
}

function ProposalCard({
  p,
  currentVersion,
  actor,
  now,
  run,
  error,
}: {
  p: PolicyProposal
  currentVersion: number
  actor: string
  now: string
  run: (scope: string, r: ActionResult) => boolean
  error: string | null
}) {
  const [reviewed, setReviewed] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const total = p.impact.byLender[p.mode].cast.length + p.impact.byLender[p.mode].planted.length
  const stale = p.baseVersion !== currentVersion
  const act = (verdict: "approve" | "reject") =>
    run(p.id, policyAction(actor, now, "policy_decided", (log) => decideProposal(log, p, { checker: actor, at: now, verdict, currentVersion, impactReviewed: reviewed, reason }).proposal))

  return (
    <article className="rounded-lg border border-rule bg-surface p-5" aria-label={`${MODE_META[p.mode].institution} policy v${p.proposed.version}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold">
          {MODE_META[p.mode].institution} v{p.proposed.version} · {p.kind === "rollback" ? `rollback to v${p.rollbackTo}` : "change"}
        </h4>
        <p className="text-xs text-muted-ink">
          Prepared by {personName(p.request.preparedBy)}, {when(p.request.preparedAt)}
        </p>
      </div>
      <p className="mt-1 text-sm">{p.why}</p>
      <DiffList mode={p.mode} diff={p.diff} />
      <div className="mt-4">
        <h5 className="text-sm font-semibold">Impact on decisions</h5>
        <ImpactView impact={p.impact} mode={p.mode} />
      </div>
      <p className="mt-3 text-sm">
        Needs: {ROLE_LABEL[p.request.requiredRole]} or above
        {p.request.escalations.map((e, i) => (
          <span key={i} className="block text-xs text-muted-ink">
            Escalated by {personName(e.by)} ({ROLE_LABEL[e.from]}) to {ROLE_LABEL[e.to]}, {when(e.at)}
          </span>
        ))}
      </p>
      {stale && (
        <p className="mt-3 rounded-md bg-conditions-soft px-3 py-2 text-sm text-conditions">
          Prepared against v{p.baseVersion}; the policy is now v{currentVersion}. It can&apos;t be approved; prepare it again so the impact is current.
        </p>
      )}
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-0.5 size-4" />
        I&apos;ve reviewed the impact: {total} decision{total === 1 ? "" : "s"} would change.
      </label>
      {error && <InlineError text={error} />}
      {!rejecting ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!reviewed || stale} onClick={() => act("approve")} className={cn(button, "bg-ink text-background")}>
            Approve as {personName(actor)}
          </button>
          <button type="button" onClick={() => setRejecting(true)} className={cn(button, "border border-rule")}>
            Reject…
          </button>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (act("reject")) setRejecting(false)
          }}
        >
          <label className="min-w-0 flex-1 text-sm">
            <span className="block text-xs text-muted-ink">Why are you rejecting it?</span>
            <input required value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-md border border-rule bg-surface px-2 py-1.5" />
          </label>
          <button type="submit" className={cn(button, "bg-decline text-background")}>
            Reject as {personName(actor)}
          </button>
          <button type="button" onClick={() => setRejecting(false)} className={cn(button, "border border-rule")}>
            Cancel
          </button>
        </form>
      )}
    </article>
  )
}

function RollbackForm({ label, onSubmit, error }: { label: string; onSubmit: (why: string) => boolean; error: string | null }) {
  const [open, setOpen] = useState(false)
  const [why, setWhy] = useState("")
  if (!open)
    return (
      <>
        {error && <InlineError text={error} />}
        <button type="button" onClick={() => setOpen(true)} className={cn(button, "mt-3 border border-rule")}>
          {label}…
        </button>
      </>
    )
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (onSubmit(why)) setOpen(false)
      }}
    >
      <label className="min-w-0 flex-1 text-sm">
        <span className="block text-xs text-muted-ink">Why roll back?</span>
        <input required value={why} onChange={(e) => setWhy(e.target.value)} className="mt-1 w-full rounded-md border border-rule bg-surface px-2 py-1.5" />
      </label>
      <button type="submit" className={cn(button, "bg-ink text-background")}>
        Prepare rollback
      </button>
      <button type="button" onClick={() => setOpen(false)} className={cn(button, "border border-rule")}>
        Cancel
      </button>
      {error && <InlineError text={error} />}
    </form>
  )
}

function DiffList({ mode, diff }: { mode: Mode; diff: PolicyProposal["diff"] }) {
  return (
    <ul className="mt-2 space-y-0.5 text-sm">
      {diff.map((d) => (
        <li key={d.key}>
          <span className="text-muted-ink">{labelFor(mode, d.key)}: </span>
          <span className="num">
            {formatThreshold(fieldFor(mode, d.key), d.from)} → <span className="font-medium">{formatThreshold(fieldFor(mode, d.key), d.to)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

const snapText = (s: DecisionChange["from"]) => (s.limitCents > 0 ? `${PRODUCT_LABELS[s.product]}, ${formatCents(s.limitCents, { whole: true })}` : PRODUCT_LABELS[s.product])

function ImpactView({ impact, mode }: { impact: Impact; mode: Mode }) {
  const changes = [...impact.byLender[mode].cast, ...impact.byLender[mode].planted]
  return (
    <div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="text-xs text-muted-ink">
            <tr>
              <th className="py-1 pr-3 font-medium">Lender</th>
              <th className="py-1 pr-3 font-medium">Cast decisions changing</th>
              <th className="py-1 font-medium">Planted-case decisions changing</th>
            </tr>
          </thead>
          <tbody>
            {MODES.map((m) => {
              const l = impact.byLender[m]
              return (
                <tr key={m} className="border-t border-rule">
                  <td className="py-1.5 pr-3">{MODE_META[m].institution}</td>
                  <td className="num py-1.5 pr-3">
                    {l.cast.length} of {l.casesChecked.cast}
                  </td>
                  <td className="num py-1.5">
                    {l.planted.length} of {l.casesChecked.planted}
                    {m !== mode && <span className="ml-2 text-xs text-muted-ink">(not affected)</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {changes.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-ink">
          <ShieldCheck aria-hidden className="size-4" /> No decisions would change.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm" aria-label="Decisions that would change">
          {changes.map((c) => (
            <li key={c.slug} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-ink">{c.group === "cast" ? "cast" : "planted case"}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <OutcomeChip outcome={c.from.outcome} short />
                <span className="text-xs text-muted-ink">{snapText(c.from)}</span>
                <span aria-hidden>→</span>
                <span className="sr-only">would become</span>
                <OutcomeChip outcome={c.to.outcome} short />
                <span className="text-xs text-muted-ink">{snapText(c.to)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
