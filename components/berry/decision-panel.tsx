"use client"

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
import { ButtonLink } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SegmentedControl } from "@/components/ui/segmented-control"

export type Register = "customer" | "lender"

export function RegisterToggle({ value, onChange }: { value: Register; onChange: (r: Register) => void }) {
  return (
    <SegmentedControl
      kind="radio"
      size="sm"
      label="Explanation style"
      value={value}
      onChange={onChange}
      options={[
        { value: "customer", label: "Plain language" },
        { value: "lender", label: "Lender view" },
      ]}
    />
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
            className={cn("mt-2 size-1.5 shrink-0 rounded-full", r.direction === "positive" ? "bg-green-ink" : r.direction === "negative" ? "bg-bad" : "bg-fg-3")}
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
      <dt className="text-xs text-fg-3">{label}</dt>
      <dd className="num mt-0.5 font-semibold">{children}</dd>
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
    <Card as="section" aria-labelledby="decision-heading" pad="lg" className={cn("border-t-4", meta.classes.border)}>
      <div>
        <ModeChip mode={mode} />
        <p className="mt-1.5 text-xs text-fg-3">{meta.style}</p>
      </div>
      <h2 id="decision-heading" className="sr-only">
        {meta.institution} decision
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <OutcomeChip outcome={d.outcome} className="text-sm" />
        {approved && (
          <span className="num text-[28px] font-semibold tracking-[-0.025em]">
            {formatCents(d.limitCents, { whole: true })}
            {d.limitCents < requestedCents && <span className="ml-2 text-sm font-normal text-fg-3">of {formatCents(requestedCents, { whole: true })} asked</span>}
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
            {d.termMonths && d.structure === "term" ? <span className="font-normal text-fg-3"> · {d.termMonths} months</span> : null}
          </Term>
        </dl>
      )}

      {d.approver && (
        <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-field px-3.5 py-3 text-sm">
          <UserCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-3" />
          <span>
            <span className="font-semibold">Sign-off: {d.approver.title}.</span>{" "}
            <span className="text-fg-2">Delegated authority tiers are illustrative.</span>
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
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-fg-2">
            {d.counterfactuals.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}

      {d.conditions && d.conditions.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold">Conditions</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-fg-2">
            {d.conditions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}

      {d.flags.map((f) => (
        <div key={f.type + f.windowStart} className="mt-5 flex gap-2 rounded-[10px] bg-warn-tint p-3 text-sm">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
          <p>
            <span className="font-medium">FINTRAC review: </span>
            {f.summary}
          </p>
        </div>
      ))}

      <ButtonLink href={`/applications/${slug}?tab=compare#file-tabs`} className="mt-6 w-full">
        Compare all three lenders
        <ArrowRight aria-hidden className="size-4" />
      </ButtonLink>
    </Card>
  )
}
