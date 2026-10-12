"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Download, Info, RotateCcw, ShieldCheck, ShieldAlert, XCircle } from "lucide-react"
import { Illustrative } from "@/components/berry/illustrative"
import { MomentPicker } from "@/components/berry/ops-moment"
import { InlineError } from "@/components/berry/inline-error"
import { LazyPolicyPanel } from "@/components/berry/policy-panel-lazy"
import { ModeChip } from "@/components/berry/mode-chip"
import { addOpsAction, resetOpsActions, setActor, useActor, useOpsActions, useOpsMoment } from "@/components/berry/ops-store"
import { tabClass, tabListClass, useTabs } from "@/components/ui/tabs"
import { formatCents } from "@/lib/money"
import { BROWSER_ONLY_NOTICE, BROWSER_ONLY_SHORT } from "@/lib/ops/copy"
import { messageFor } from "@/lib/ops/communications"
import { requiredRoleFor } from "@/lib/ops/approvals"
import { OPS, member, type Role } from "@/lib/ops/config"
import { OPS_MOMENTS } from "@/lib/ops/moments"
import { PLAYBOOKS } from "@/lib/ops/playbooks"
import type { OpsItem, SlaState } from "@/lib/ops/queues"
import { assign, auditAt, browserItems, complete, decide, itemAt, messageSent, prepareItem, suggestOwner, workload, type ActionResult, type ItemState } from "@/lib/ops/view"
import type { AuditEvent, QueueName } from "@/lib/schemas"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Table, Td, Th, THead } from "@/components/ui/table"
import { fieldClass } from "@/components/ui/field"
import { buttonVariants } from "@/components/ui/button"

/*
 * The operations console (CLAUDE.md §5C). Queue items come from real open
 * items; the fictional team's work is simulated. Pick a moment and who you
 * are acting as, then assign, prepare, approve or send messages. Maker-
 * checker and delegated authority are enforced by the same functions the
 * tests use. Your actions stay in this browser.
 */

const QUEUES = Object.keys(OPS.queues) as QueueName[]
const TEAM_IDS = OPS.team.map((m) => m.id)

export const ROLE_LABEL: Record<Role, string> = { analyst: "Analyst", lead: "Lead", branch_manager: "Branch manager", credit_committee: "Credit Committee" }

const SLA_META: Record<SlaState, { label: string; className: string; Icon: typeof Clock }> = {
  on_time: { label: "On time", className: "bg-green-tint text-green-ink", Icon: Clock },
  at_risk: { label: "At risk", className: "bg-warn-tint text-warn", Icon: AlertTriangle },
  breached: { label: "Breached", className: "bg-bad-tint text-bad", Icon: XCircle },
  met: { label: "Met", className: "bg-green-tint text-green-ink", Icon: CheckCircle2 },
  missed: { label: "Missed", className: "bg-bad-tint text-bad", Icon: XCircle },
}

const SLA_ORDER: SlaState[] = ["breached", "at_risk", "on_time", "missed", "met"]

export function SlaChip({ state }: { state: SlaState }) {
  const m = SLA_META[state]
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", m.className)}>
      <m.Icon aria-hidden className="size-3" />
      {m.label}
    </span>
  )
}

const when = (t: string) => {
  const d = new Date(`${t}:00Z`)
  return `${d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: t.slice(0, 4) === "2026" ? undefined : "numeric", timeZone: "UTC" })}, ${t.slice(11, 16)}`
}
const personName = (id: string | null | undefined) => (id ? (member(id)?.name ?? id) : "Unassigned")
const limitLabel = (r: Role) => {
  const l = OPS.authority[r].limitCents
  return l === null ? "no limit" : `up to ${formatCents(l, { whole: true })}`
}


export interface OpsConsoleProps {
  items: OpsItem[]
  events: readonly AuditEvent[]
  eventItems: readonly (string | null)[]
}

export function OpsConsole({ items: simulated, events, eventItems }: OpsConsoleProps) {
  const now = useOpsMoment()
  const actions = useOpsActions()
  // Items from the simulation plus any created in this browser (e.g. over-limit requests from a stress test).
  const items = useMemo(() => [...simulated, ...browserItems(actions, "9999-12-31T00:00")], [simulated, actions])
  const actor = useActor(TEAM_IDS)
  const [tab, setTab] = useState<string>("verification")
  const [selected, setSelected] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const states = useMemo(() => new Map(items.map((i) => [i.id, itemAt(i, now, actions)])), [items, now, actions])
  const log = useMemo(() => auditAt(events, eventItems, items, actions, now), [events, eventItems, items, actions, now])
  const load = useMemo(() => workload(items, states), [items, states])

  const momentIndex = OPS_MOMENTS.findIndex((m) => m.at === now)
  const moment = OPS_MOMENTS[momentIndex]
  const openIn = (q: QueueName) => items.filter((i) => i.queue === q && states.get(i.id)!.status === "open")
  const breachedIn = (q: QueueName) => openIn(q).filter((i) => states.get(i.id)!.sla === "breached").length

  function run(result: ActionResult) {
    if (result.action.events.length > 0) addOpsAction(result.action)
    setError(result.error)
  }

  function autoAssign() {
    const working = load.map((l) => ({ ...l }))
    for (const i of items) {
      const s = states.get(i.id)!
      if (s.status !== "open" || s.ownerId) continue
      const to = suggestOwner(i, working)
      if (!to) continue
      run(assign(i, s, to, actor, now, true))
      working.find((w) => w.id === to)!.minutes += OPS.queues[i.queue].minutesPerItem
    }
  }

  const TAB_IDS = [...QUEUES, "team", "policy", "audit"]
  const tabIndex = Math.max(0, TAB_IDS.indexOf(tab))
  const t = useTabs(TAB_IDS.length, tabIndex, (n) => (setTab(TAB_IDS[n]), setSelected(null), setError(null)))
  // Only the active panel's content is mounted (the Policy tab loads its data when it opens).
  const panel = (id: string, className: string, content: () => React.ReactNode) => (
    <div {...t.panel(TAB_IDS.indexOf(id))} className={className}>
      {tab === id && content()}
    </div>
  )

  const unassigned = items.filter((i) => states.get(i.id)!.status === "open" && !states.get(i.id)!.ownerId).length

  return (
    <div>
      <div className="flex flex-col gap-4 rounded-[14px] bg-panel shadow-card p-4 lg:flex-row lg:items-end lg:justify-between">
        <MomentPicker />
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <div className="min-w-0 max-w-full">
            <label htmlFor="ops-actor" className="text-xs font-medium text-fg-3">
              Acting as
            </label>
            <select id="ops-actor" value={actor} onChange={(e) => setActor(e.target.value)} className={cn(fieldClass, "mt-1 block w-full max-w-full")}>
              {OPS.team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {ROLE_LABEL[m.role]} ({limitLabel(m.role)})
                </option>
              ))}
            </select>
          </div>
          {actions.length > 0 && (
            <button type="button" onClick={() => (resetOpsActions(), setError(null))} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <RotateCcw aria-hidden className="size-4" />
              Reset my {actions.length} action{actions.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-fg-3">{moment?.note}. Fictional team, simulated work.</p>
      <p role="note" className="mt-2 flex gap-2 rounded-[10px] bg-field p-3 text-sm text-fg-2">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-3" />
        <span>{BROWSER_ONLY_NOTICE}</span>
      </p>

      <div className="mt-6">
        <div className="-mx-4 overflow-x-auto px-4 pb-1">
          <div {...t.list} aria-label="Operations queues" className={cn(tabListClass("segmented"), "w-max flex-nowrap")}>
            {QUEUES.map((q) => {
              const open = openIn(q).length
              const breached = breachedIn(q)
              return (
                <button key={q} {...t.tab(TAB_IDS.indexOf(q))} className={cn(tabClass("segmented", tab === q), "whitespace-nowrap px-3.5 text-sm")}>
                  {OPS.queues[q].label}
                  <span className={cn("num ml-1.5 rounded-full px-1.5 text-xs", tab === q ? "bg-tab-on-fg/15 text-tab-on-fg" : breached ? "bg-bad-tint text-bad" : "bg-field text-fg-3")}>
                    {open}
                    <span className="sr-only"> open{breached ? `, ${breached} breached` : ""}</span>
                  </span>
                </button>
              )
            })}
            {(["team", "policy", "audit"] as const).map((id) => (
              <button key={id} {...t.tab(TAB_IDS.indexOf(id))} className={cn(tabClass("segmented", tab === id), "whitespace-nowrap px-3.5 text-sm")}>
                {id === "team" ? "Team" : id === "policy" ? "Policy" : "Audit trail"}
              </button>
            ))}
          </div>
        </div>

        {QUEUES.map((q) => {
          const list = items
            .filter((i) => i.queue === q)
            .map((i) => ({ i, s: states.get(i.id)! }))
            .filter(({ s }) => s.status === "open" || (showDone && s.status === "done"))
            .sort((a, b) => SLA_ORDER.indexOf(a.s.sla) - SLA_ORDER.indexOf(b.s.sla) || a.i.slaDueAt.localeCompare(b.i.slaDueAt))
          // The selected item stays open in the panel after it's done, so you can see the outcome.
          const pick = items.find((i) => i.queue === q && i.id === selected)
          const current = pick && states.get(pick.id)!.status !== "not_yet" ? { i: pick, s: states.get(pick.id)! } : null
          return (
            <div key={q} {...t.panel(TAB_IDS.indexOf(q))} className="mt-4 min-w-0">
              {tab === q && (
              <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-fg-3">
                  Service level: <span className="num font-medium text-fg">{OPS.queues[q].slaBusinessHours} business hours</span> · about {OPS.queues[q].minutesPerItem} minutes per item
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="size-4 accent-current" />
                  Show done items
                </label>
              </div>
              <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <ul className="min-w-0 space-y-2" aria-label={`${OPS.queues[q].label} items`}>
                  {list.length === 0 && <li className="rounded-[14px] border border-dashed border-line-strong p-6 text-center text-sm text-fg-3">Nothing open in this queue right now.</li>}
                  {list.map(({ i, s }) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => (setSelected(i.id), setError(null))}
                        aria-pressed={selected === i.id}
                        className={cn("w-full rounded-[14px] bg-panel p-4 text-left shadow-card transition-[box-shadow]", selected === i.id ? "shadow-[0_0_0_2px_var(--ds-fg)]" : "hover:shadow-lift")}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0 font-medium">{i.title}</span>
                          <SlaChip state={s.sla} />
                        </span>
                        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-3">
                          <span className={cn(i.priority !== "normal" && "font-medium text-fg")}>{i.priority === "urgent" ? "Urgent" : i.priority === "high" ? "High priority" : "Normal"}</span>
                          <span className="num">Due {when(i.slaDueAt)}</span>
                          <span>{personName(s.ownerId)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="min-w-0">
                  {current ? (
                    <ItemPanel item={current.i} state={current.s} actor={actor} now={now} run={run} error={error} />
                  ) : (
                    <p className="rounded-[14px] border border-dashed border-line-strong p-6 text-sm text-fg-3">Choose an item to see its playbook, history and actions.</p>
                  )}
                </div>
              </div>
              </>
              )}
            </div>
          )
        })}

        {panel("team", "mt-4 min-w-0", () => (
          <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-3">Open work owned by each person, against a day&apos;s capacity.</p>
            <button type="button" onClick={autoAssign} disabled={unassigned === 0} className={buttonVariants({ size: "sm" })}>
              Auto-assign {unassigned} unassigned by skill
            </button>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {OPS.team.map((m) => {
              const l = load.find((x) => x.id === m.id)!
              const pct = Math.min(100, Math.round((l.minutes / l.capacity) * 100))
              return (
                <li key={m.id} className="rounded-[14px] bg-panel shadow-card p-4">
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-fg-3">
                    {ROLE_LABEL[m.role]} · {OPS.authority[m.role].limitCents === null ? "no approval limit" : `approves ${limitLabel(m.role)}`}
                  </p>
                  <div className="mt-3 h-2 rounded-full bg-field" role="meter" aria-valuemin={0} aria-valuemax={l.capacity} aria-valuenow={l.minutes} aria-label={`${m.name}: ${l.minutes} of ${l.capacity} minutes`}>
                    <div className={cn("h-2 rounded-full", pct >= 100 ? "bg-bad" : pct >= 75 ? "bg-warn" : "bg-green-ink")} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="num mt-1 text-xs text-fg-3">
                    {l.open} open · {l.minutes} of {l.capacity} min
                  </p>
                  <p className="mt-2 text-xs text-fg-3">Skills: {m.skills.map((s) => OPS.queues[s].label).join(", ")}</p>
                </li>
              )
            })}
          </ul>
          </>
        ))}

        {panel("policy", "mt-4 min-w-0", () => (
          <LazyPolicyPanel actions={actions} actor={actor} now={now} record={(r) => addOpsAction(r.action)} />
        ))}

        {panel("audit", "mt-4 min-w-0", () => (
          <AuditView log={log.all} verified={log.verify() === null} csv={() => log.toCSV()} json={() => log.toJSON()} now={now} />
        ))}
      </div>
    </div>
  )
}

function ItemPanel({ item, state, actor, now, run, error }: { item: OpsItem; state: ItemState; actor: string; now: string; run: (r: ActionResult) => void; error: string | null }) {
  const [assignee, setAssignee] = useState<string>("")
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const playbook = PLAYBOOKS[item.queue]
  const msg = messageFor(item)
  const open = state.status === "open"
  const req = state.request
  const me = member(actor)!
  const skilled = OPS.team.filter((m) => m.skills.includes(OPS.queues[item.queue].skill))

  return (
    <article className="rounded-[14px] bg-panel shadow-card p-5" aria-label={item.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{item.title}</h3>
        <SlaChip state={state.sla} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {item.mode && <ModeChip mode={item.mode} />}
        <Link href={item.href} className="text-sm underline underline-offset-4">
          Open the file
        </Link>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-fg-3">Opened</dt>
          <dd className="num">{when(item.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">Due</dt>
          <dd className="num">{when(item.slaDueAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">Owner</dt>
          <dd>{personName(state.ownerId)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">Status</dt>
          <dd>{state.status === "done" ? `Done ${when(state.completedAt!)}` : "Open"}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm">{item.detail}</p>
      {item.blockedReason && open && <p className="mt-3 rounded-[10px] bg-warn-tint px-3 py-2 text-sm text-warn">{item.blockedReason}</p>}
      <p className="mt-3 text-sm">
        <span className="text-fg-3">Next action: </span>
        {item.nextAction}
      </p>

      {open && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-xs text-fg-3">Assign to</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={cn(fieldClass, "mt-1")}>
              <option value="">Choose…</option>
              {skilled.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({ROLE_LABEL[m.role]})
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!assignee || assignee === state.ownerId} onClick={() => run(assign(item, state, assignee, actor, now))} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Assign
          </button>
          {!item.approval && (
            <button type="button" onClick={() => run(complete(item, actor, now))} className={buttonVariants({ size: "sm" })}>
              Mark done as {me.name}
            </button>
          )}
        </div>
      )}

      {item.approval && (
        <section className="mt-5 rounded-[10px] border border-line p-4" aria-label="Approval">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck aria-hidden className="size-4" />
            Maker-checker
          </h4>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="inline text-fg-3">Amount: </dt>
              <dd className="num inline">{formatCents(item.approval.amountCents, { whole: item.approval.amountCents % 100 === 0 })}</dd>
            </div>
            <div>
              <dt className="inline text-fg-3">Needs: </dt>
              <dd className="inline">{ROLE_LABEL[req?.requiredRole ?? requiredRoleFor(item.approval.amountCents, item.approval.minimumRole)]} or above</dd>
            </div>
            <div>
              <dt className="inline text-fg-3">Prepared by: </dt>
              <dd className="inline">{req ? personName(req.preparedBy) : "Not yet prepared"}</dd>
            </div>
            <div>
              <dt className="inline text-fg-3">Status: </dt>
              <dd className="inline">{req ? (req.status === "pending" ? "Waiting for approval" : `${req.status === "approved" ? "Approved" : "Rejected"} · checker: ${personName(req.decidedBy)}`) : "—"}</dd>
            </div>
          </dl>
          {req && req.escalations.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-fg-3">
              {req.escalations.map((e, i) => (
                <li key={i}>
                  Escalated by {personName(e.by)} ({ROLE_LABEL[e.from]}) to {ROLE_LABEL[e.to]}, {when(e.at)}
                </li>
              ))}
            </ul>
          )}
          {error && <InlineError text={error} />}
          {open && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!req && (
                <button type="button" onClick={() => run(prepareItem(item, actor, now))} className={buttonVariants({ size: "sm" })}>
                  Prepare as {me.name}
                </button>
              )}
              {req?.status === "pending" && !rejecting && (
                <>
                  <button type="button" onClick={() => run(decide(item, req, actor, now, "approve"))} className={buttonVariants({ size: "sm" })}>
                    Approve as {me.name}
                  </button>
                  <button type="button" onClick={() => setRejecting(true)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Reject…
                  </button>
                  <span className="text-xs text-fg-3">{BROWSER_ONLY_SHORT}</span>
                </>
              )}
              {req?.status === "pending" && rejecting && (
                <form
                  className="flex w-full flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    run(decide(item, req, actor, now, "reject", reason.trim()))
                    setRejecting(false)
                    setReason("")
                  }}
                >
                  <label className="min-w-0 flex-1 text-sm">
                    <span className="block text-xs text-fg-3">Why are you rejecting it?</span>
                    <input required value={reason} onChange={(e) => setReason(e.target.value)} className={cn(fieldClass, "mt-1 w-full")} />
                  </label>
                  <button type="submit" className={buttonVariants({ variant: "danger", size: "sm" })}>
                    Reject as {me.name}
                  </button>
                  <button type="button" onClick={() => setRejecting(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Cancel
                  </button>
                </form>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-fg-3">
            The person who prepares an action can&apos;t approve it. Above the approver&apos;s delegated authority, it escalates. <Illustrative why="Roles, limits and the fictional team are illustrative; real authority tiers vary by lender." />
          </p>
        </section>
      )}

      <section className="mt-5" aria-label="Playbook">
        <h4 className="text-sm font-semibold">Playbook: {playbook.title}</h4>
        <ol className="mt-2 space-y-1.5 text-sm">
          {playbook.steps.map((s, i) => (
            <li key={i}>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={checked[i] ?? false} onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))} className="mt-1 size-4 shrink-0" />
                <span className={cn(checked[i] && "text-fg-3 line-through")}>{s}</span>
              </label>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-5" aria-label="Customer message">
        <h4 className="text-sm font-semibold">Customer message</h4>
        {"none" in msg ? (
          <p className="mt-1 text-sm text-fg-3">{msg.none}</p>
        ) : (
          <div className="mt-2 rounded-[10px] border border-dashed border-line p-3 text-sm">
            <p className="font-medium">{msg.message.subject}</p>
            <p className="mt-1 text-fg-3">{msg.message.body}</p>
            <button type="button" onClick={() => run(messageSent(item, msg.message.subject, actor, now))} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-3")}>
              Send (simulated)
            </button>
          </div>
        )}
      </section>

      <section className="mt-5" aria-label="History">
        <h4 className="text-sm font-semibold">History</h4>
        <ol className="mt-2 space-y-1 text-sm">
          {state.history.map((h, i) => (
            <li key={i} className="flex gap-3">
              <span className="num w-28 shrink-0 text-xs text-fg-3">{when(h.at)}</span>
              <span className="min-w-0">
                <span className="font-medium">{h.who}</span> {h.text}
                {h.mine && <span className="ml-1 text-xs text-fg-3">(you, this browser)</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </article>
  )
}

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const actorLabel = (e: AuditEvent) => (e.actor.kind === "user" ? personName(e.actor.id) : `System (${e.actor.id})`)

function AuditView({ log, verified, csv, json, now }: { log: readonly AuditEvent[]; verified: boolean; csv: () => string; json: () => string; now: string }) {
  const [action, setAction] = useState("")
  const [who, setWho] = useState("")
  const [q, setQ] = useState("")
  const actionsList = [...new Set(log.map((e) => e.action))].sort()
  const people = [...new Set(log.map(actorLabel))].sort()
  const rows = log.filter(
    (e) =>
      (!action || e.action === action) &&
      (!who || actorLabel(e) === who) &&
      (!q || `${e.subject.id} ${e.reason ?? ""} ${JSON.stringify(e.after ?? "")}`.toLowerCase().includes(q.toLowerCase())),
  )
  const stamp = now.replace(/[:T]/g, "-")

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cn("flex items-center gap-2 text-sm", verified ? "text-green-ink" : "text-bad")}>
          {verified ? <ShieldCheck aria-hidden className="size-4" /> : <ShieldAlert aria-hidden className="size-4" />}
          {verified ? `Hash chain verified: ${log.length} events, none edited, removed or reordered.` : "Hash chain broken: an event was changed."}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => download(`berry-audit-${stamp}.csv`, "text/csv", csv())} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Download aria-hidden className="size-4" /> CSV
          </button>
          <button type="button" onClick={() => download(`berry-audit-${stamp}.json`, "application/json", json())} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Download aria-hidden className="size-4" /> JSON
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <label>
          <span className="block text-xs text-fg-3">Action</span>
          <select value={action} onChange={(e) => setAction(e.target.value)} className={cn(fieldClass, "mt-1")}>
            <option value="">All</option>
            {actionsList.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs text-fg-3">Who</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className={cn(fieldClass, "mt-1")}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1">
          <span className="block text-xs text-fg-3">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Subject, reason…" className={cn(fieldClass, "mt-1 w-full")} />
        </label>
      </div>
      <p className="mt-3 text-xs text-fg-3">
        Showing {rows.length} of {log.length}. Append-only: each event carries the previous event&apos;s hash. Times are the lender&apos;s local time.
      </p>
      <Card pad="none" className="mt-2 overflow-hidden">
        <Table minWidth={720} caption="Audit trail">
          <THead>
            <tr>
              <Th className="px-4 py-2.5">#</Th>
              <Th className="px-4 py-2.5">When</Th>
              <Th className="px-4 py-2.5">Who</Th>
              <Th className="px-4 py-2.5">What</Th>
              <Th className="px-4 py-2.5">Subject</Th>
              <Th className="px-4 py-2.5">Before → after</Th>
            </tr>
          </THead>
          <tbody>
            {rows
              .slice()
              .reverse()
              .map((e) => (
                <tr key={e.id}>
                  <Td className="num px-4 text-fg-3">{e.seq + 1}</Td>
                  <Td className="num whitespace-nowrap px-4">{when(e.at)}</Td>
                  <Td className="whitespace-nowrap px-4">{actorLabel(e)}</Td>
                  <Td className="px-4">
                    <code className="font-mono text-xs">{e.action}</code>
                    {e.reason && <p className="mt-0.5 text-xs text-fg-3">{e.reason}</p>}
                  </Td>
                  <Td className="px-4 text-xs">{e.subject.id}</Td>
                  <Td className="px-4 text-xs text-fg-3">
                    <Change before={e.before} after={e.after} />
                  </Td>
                </tr>
              ))}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}

function Change({ before, after }: { before: unknown; after: unknown }) {
  const show = (v: unknown) =>
    v && typeof v === "object"
      ? Object.entries(v as Record<string, unknown>)
          .map(([k, x]) => `${k}: ${x === null ? "—" : String(x)}`)
          .join(", ")
      : v === undefined
        ? ""
        : String(v)
  if (before === undefined && after === undefined) return <CircleDashed aria-label="No change recorded" className="size-3" />
  return (
    <span>
      {before !== undefined && <span>{show(before)}</span>}
      {before !== undefined && after !== undefined && <span aria-hidden> → </span>}
      {after !== undefined && <span className="text-fg">{show(after)}</span>}
    </span>
  )
}
