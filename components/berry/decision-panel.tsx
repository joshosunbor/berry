"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, ShieldAlert, UserCheck } from "lucide-react"
import { ModeChip } from "@/components/berry/mode-chip"
import { useMode } from "@/components/berry/mode-context"
import { OutcomeChip } from "@/components/berry/outcome-chip"
import { PRODUCT_LABELS, STRUCTURE_LABELS, pctFromBps } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODE_META, type Mode } from "@/lib/modes"
import type { Decision } from "@/lib/schemas"
import { cn } from "@/lib/utils"

export type Register = "customer" | "lender"

export function RegisterToggle({ value, onChange }: { value: Register; onChange: (r: Register) => void }) {
  return (
    <div role="radiogroup" aria-label="Explanation style" className="inline-flex rounded-md border border-rule p-0.5 text-xs">
      {(["customer", "lender"] as const).map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          onClick={() => onChange(r)}
          className={cn("rounded px-2 py-1", value === r ? "bg-ink text-background" : "text-muted-ink hover:text-ink")}
        >
          {r === "customer" ? "Plain language" : "Lender view"}
        </button>
      ))}
    </div>
  )
}

export function ReasonList({ decision, register, limit }: { decision: Decision; register: Register; limit?: number }) {
  const reasons = limit ? decision.reasons.slice(0, limit) : decision.reasons
  return (
    <ul className="space-y-2.5">
      {reasons.map((r) => (
        <li key={r.code} className="flex gap-2.5 text-sm leading-6">
          <span
            aria-hidden
            className={cn("mt-2 size-1.5 shrink-0 rounded-full", r.direction === "positive" ? "bg-approve" : r.direction === "negative" ? "bg-decline" : "bg-refer")}
          />
          <span>
            <span className="sr-only">{r.direction === "positive" ? "Strength: " : r.direction === "negative" ? "Concern: " : "Note: "}</span>
            {register === "customer" ? r.customerText : r.lenderText}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-ink">{label}</dt>
      <dd className="num mt-0.5 font-medium">{children}</dd>
    </div>
  )
}

export function DecisionPanel({ decisions, slug, requestedCents }: { decisions: Record<Mode, Decision>; slug: string; requestedCents: number }) {
  const { mode } = useMode()
  const [register, setRegister] = useState<Register>("customer")
  const d = decisions[mode]
  const meta = MODE_META[mode]
  const approved = d.outcome !== "decline" && d.outcome !== "refer"

  return (
    <section aria-labelledby="decision-heading" className={cn("rounded-lg border-t-4 bg-surface p-5 shadow-soft", meta.classes.border)}>
      <div>
        <ModeChip mode={mode} />
        <p className="mt-1.5 text-xs text-muted-ink">{meta.style}</p>
      </div>
      <h2 id="decision-heading" className="sr-only">
        {meta.institution} decision
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <OutcomeChip outcome={d.outcome} className="text-sm" />
        {approved && (
          <span className="num text-2xl font-semibold tracking-tight">
            {formatCents(d.limitCents, { whole: true })}
            {d.limitCents < requestedCents && <span className="ml-2 text-sm font-normal text-muted-ink">of {formatCents(requestedCents, { whole: true })} asked</span>}
          </span>
        )}
      </div>

      {approved && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Term label="Product">{PRODUCT_LABELS[d.product]}</Term>
          <Term label="Rate (illustrative)">{d.aprBps !== null ? pctFromBps(d.aprBps) : "—"}</Term>
          <Term label="Structure">{d.structure ? STRUCTURE_LABELS[d.structure] : "—"}</Term>
          <Term label={d.structure === "term" ? "Monthly payment" : "Assessed payment"}>
            {d.paymentCents !== null ? `${formatCents(d.paymentCents)}/mo` : "—"}
            {d.termMonths && d.structure === "term" ? <span className="font-normal text-muted-ink"> · {d.termMonths} months</span> : null}
          </Term>
        </dl>
      )}

      {d.approver && (
        <p className="mt-4 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <UserCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-ink" />
          <span>
            <span className="font-medium">Sign-off: {d.approver.title}.</span>{" "}
            <span className="text-muted-ink">Delegated authority tiers are illustrative.</span>
          </span>
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Why</h3>
        <RegisterToggle value={register} onChange={setRegister} />
      </div>
      <div className="mt-3">
        <ReasonList decision={d} register={register} limit={4} />
      </div>

      {d.counterfactuals.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold">What would change this</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-ink">
            {d.counterfactuals.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}

      {d.conditions && d.conditions.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold">Conditions</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-ink">
            {d.conditions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}

      {d.flags.map((f) => (
        <div key={f.type + f.windowStart} className="mt-5 flex gap-2 rounded-md border border-conditions/40 bg-conditions-soft p-3 text-sm">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-conditions" />
          <p>
            <span className="font-medium">FINTRAC review: </span>
            {f.summary}
          </p>
        </div>
      ))}

      <Link
        href={`/compare/${slug}`}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-background hover:bg-ink/90"
      >
        Compare all three lenders
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  )
}
