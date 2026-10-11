"use client"

import { useState, useSyncExternalStore } from "react"
import { CheckCircle2, FileText, Loader2 } from "lucide-react"
import { Illustrative } from "@/components/berry/illustrative"
import { useMode } from "@/components/berry/mode-context"
import { MODE_META, type Mode } from "@/lib/modes"
import { cn } from "@/lib/utils"

/*
 * The credit memo tab (CLAUDE.md §6). The memo is drafted on demand by
 * /api/memo for the selected lender and shown as a draft. A person marks it
 * reviewed, then approves it under a fictional reviewer's name. Approvals
 * live only in this browser's localStorage (a demo convenience).
 */

const REVIEWERS = ["Analyst A. Rivera", "Analyst J. Okafor", "Lead K. Moreau"] as const
const KEY = "berry.memoApprovals.v1"

interface MemoResponse {
  source: "template" | "claude"
  text: string
  problems?: string[]
}

interface Approval {
  reviewer: string
  at: string
  source: MemoResponse["source"]
}

type Slot = { status: "loading" } | { status: "ready"; memo: MemoResponse } | { status: "error"; message: string }

const listeners = new Set<() => void>()

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function parse(raw: string | null): Record<string, Approval> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === "object" ? (v as Record<string, Approval>) : {}
  } catch {
    return {}
  }
}

function saveApproval(id: string, approval: Approval) {
  try {
    const all = parse(readRaw())
    all[id] = approval
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable: the approval lasts for this page view only */
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

const SOURCE_LABEL = { template: "Template memo", claude: "Drafted by Claude" } as const

function MemoText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (!bullets.length) return
    const items = bullets
    blocks.push(
      <ul key={`ul${blocks.length}`} className="mt-2 list-disc space-y-1 pl-5">
        {items.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>,
    )
    bullets = []
  }
  for (const line of text.split("\n")) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith("#")) {
      flush()
      blocks.push(
        <h4 key={`h${blocks.length}`} className="mt-5 font-semibold first:mt-0">
          {t.replace(/^#+\s*/, "")}
        </h4>,
      )
    } else if (/^[-*•]\s/.test(t)) bullets.push(t.replace(/^[-*•]\s*/, ""))
    else {
      flush()
      blocks.push(
        <p key={`p${blocks.length}`} className="mt-2">
          {t}
        </p>,
      )
    }
  }
  flush()
  return <div className="num text-sm leading-6">{blocks}</div>
}

export function MemoTab({ slug }: { slug: string }) {
  const { mode } = useMode()
  const institution = MODE_META[mode].institution
  const [slots, setSlots] = useState<Partial<Record<Mode, Slot>>>({})
  const [reviewed, setReviewed] = useState<Partial<Record<Mode, boolean>>>({})
  const [reviewer, setReviewer] = useState<string>("")
  const raw = useSyncExternalStore(subscribe, readRaw, () => null)
  const id = `${slug}:${mode}`
  const approval = parse(raw)[id]
  const slot = slots[mode]

  async function draft() {
    const m = mode
    setSlots((s) => ({ ...s, [m]: { status: "loading" } }))
    setReviewed((r) => ({ ...r, [m]: false }))
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, mode: m }),
      })
      if (!res.ok) throw new Error(`The memo service returned ${res.status}.`)
      const memo = (await res.json()) as MemoResponse
      setSlots((s) => ({ ...s, [m]: { status: "ready", memo } }))
    } catch (e) {
      setSlots((s) => ({ ...s, [m]: { status: "error", message: e instanceof Error ? e.message : "The memo could not be drafted." } }))
    }
  }

  function approve(memo: MemoResponse) {
    if (!reviewer) return
    saveApproval(id, { reviewer, at: new Date().toISOString(), source: memo.source })
  }

  const button = "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <div className="min-w-0 rounded-lg border border-rule bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Credit memo for {institution}</h3>
        <button type="button" onClick={draft} disabled={slot?.status === "loading"} className={cn(button, "bg-ink text-background")}>
          {slot?.status === "loading" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FileText aria-hidden className="size-4" />}
          {slot?.status === "ready" ? "Draft again" : "Draft memo"}
        </button>
      </div>
      <p className="mt-2 text-sm text-muted-ink">AI drafts the memo. The engine and a human make the decision.</p>

      {approval && (
        <p className="mt-4 flex items-center gap-2 rounded-md bg-approve-soft px-3 py-2 text-sm text-approve">
          <CheckCircle2 aria-hidden className="size-4 shrink-0" />
          <span>
            Memo approved. Reviewer: <span className="font-medium">{approval.reviewer}</span> ·{" "}
            <span className="num">{new Date(approval.at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</span> ·{" "}
            {SOURCE_LABEL[approval.source].toLowerCase()} · saved in this browser only
          </span>
        </p>
      )}

      {!slot && <p className="mt-4 text-sm text-muted-ink">Draft a memo from this lender&apos;s decision. Only the engine&apos;s structured output is used: no transactions and no personal details.</p>}
      {slot?.status === "error" && (
        <p role="alert" className="mt-4 text-sm text-decline">
          {slot.message}
        </p>
      )}

      {slot?.status === "ready" && (
        <div className="mt-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-conditions px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-conditions">DRAFT</span>
            <span className="text-xs text-muted-ink">{SOURCE_LABEL[slot.memo.source]}</span>
            <Illustrative why="Synthetic applicant, fictional lender. Rates, limits and authority tiers are illustrative." />
          </div>
          {slot.memo.source === "template" && (
            <p className="mt-3 text-sm text-muted-ink">
              {slot.memo.problems?.length
                ? "Claude's draft didn't pass the checks against the engine's figures, so this is the template memo instead."
                : "No Claude API key is set on this server, so this is the template memo, built directly from the engine's output."}
            </p>
          )}
          {slot.memo.problems && slot.memo.problems.length > 0 && (
            <details className="mt-2 text-xs text-muted-ink">
              <summary className="cursor-pointer">Why the draft was set aside</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {slot.memo.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-4 rounded-md border border-dashed border-rule p-4">
            <MemoText text={slot.memo.text} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setReviewed((r) => ({ ...r, [mode]: true }))}
              disabled={reviewed[mode]}
              aria-pressed={reviewed[mode] ?? false}
              className={cn(button, "border border-rule")}
            >
              {reviewed[mode] && <CheckCircle2 aria-hidden className="size-4" />}
              Reviewed
            </button>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-ink">Reviewer</span>
              <select value={reviewer} onChange={(e) => setReviewer(e.target.value)} disabled={!reviewed[mode]} className="rounded-md border border-rule bg-surface px-2 py-1.5 disabled:opacity-50">
                <option value="">Choose…</option>
                {REVIEWERS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => approve(slot.memo)} disabled={!reviewed[mode] || !reviewer} className={cn(button, "bg-ink text-background")}>
              Approve memo
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-ink">Approving the memo signs off the write-up only. It does not change the decision, limit or rate.</p>
        </div>
      )}
    </div>
  )
}
