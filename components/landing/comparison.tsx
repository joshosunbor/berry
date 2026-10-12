"use client"

import { useState } from "react"
import Link from "next/link"
import { COMPARISON, LENDER_ORDER } from "@/content/landing"
import type { LandingData } from "@/lib/landing/data"
import { MODE_META, type Mode } from "@/lib/modes"
import { cn } from "@/lib/utils"

/*
 * One applicant, three rulebooks: each lender's real decision for the
 * landing applicant, with the engine's reasons in borrower or lender
 * wording. Columns fade up on load (CSS; off under reduced motion).
 */

export const MODE_DOT: Record<Mode, string> = { bank: "bg-lp-slate", fintech: "bg-lp-cyan", credit_union: "bg-lp-green-bright" }

export function Comparison({ data }: { data: Pick<LandingData, "applicant" | "lenders" | "months" | "chartSummary" | "otherApplicants"> }) {
  const [view, setView] = useState<"Borrower" | "Lender">("Lender")
  const max = Math.max(...data.months.map((m) => m.inCents))

  return (
    <div id="product" className="mt-12 scroll-mt-[90px] overflow-hidden rounded-[14px] bg-lp-surface shadow-lp-hero">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-[18px] border-b border-lp-line px-[26px] py-[22px]">
        <div>
          <p className="mb-1.5 font-mono text-xs text-lp-green-ink">{COMPARISON.eyebrow}</p>
          <p className="text-xl font-semibold tracking-[-0.01em]">{data.applicant.name}</p>
          <p className="mt-0.5 text-sm text-lp-text-3">{data.applicant.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-[18px]">
          <figure className="m-0 flex items-end gap-2.5">
            <svg role="img" aria-label={data.chartSummary.spark} width="168" height="40" viewBox="0 0 168 40">
              {data.months.map((m, i) => {
                const h = Math.max(4, Math.round((m.inCents / max) * 38))
                return <rect key={m.month} x={i * 14} y={40 - h} width="10" height={h} rx="2" className={m.peak ? "fill-lp-green-bright" : "fill-lp-spark"} />
              })}
            </svg>
            <figcaption className="max-w-[9ch] text-xs leading-[1.3] text-lp-text-3">{COMPARISON.sparkCaption}</figcaption>
          </figure>
          <span className="max-w-[18ch] text-[13px] leading-[1.35] text-lp-text-3">{COMPARISON.helper}</span>
          <div role="group" aria-label={COMPARISON.toggleLabel} className="inline-flex rounded-[9px] bg-lp-field p-[3px] shadow-[inset_0_0_0_1px_var(--color-lp-line)]">
            {(["Borrower", "Lender"] as const).map((v, i) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "min-h-[34px] cursor-pointer rounded-[7px] px-3 text-sm font-medium",
                  view === v ? "bg-lp-surface text-lp-navy shadow-[0_1px_2px_rgba(1,27,51,0.12),0_0_0_1px_var(--color-lp-line)]" : "text-lp-text-3",
                )}
              >
                {COMPARISON.views[i]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))]">
        {LENDER_ORDER.map(({ mode, kind }, i) => {
          const l = data.lenders[mode]
          return (
            <article
              key={mode}
              aria-label={`${MODE_META[mode].institution}: ${l.outcomeLabel}`}
              style={{ animationDelay: `${i * 160}ms` }}
              className={cn(
                "-mb-px -mr-px flex animate-[lp-fade-up_500ms_ease_both] flex-col gap-3.5 border-b border-r border-lp-line p-[26px]",
                mode === "credit_union" ? "bg-lp-green-tint-2" : "bg-lp-surface",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className={cn("size-2.5 rounded-full", MODE_DOT[mode])} />
                  {MODE_META[mode].institution}
                </span>
                <span className="text-[13px] text-lp-text-3">{kind}</span>
              </div>
              <div>
                <p className={cn("text-4xl font-semibold leading-[1.1] tracking-[-0.025em]", l.approved ? "text-lp-green-ink" : "text-lp-navy")}>{l.headline}</p>
                <p className="mt-1 text-[15px] text-lp-text-2">{l.product}</p>
              </div>
              <p className={cn("border-t border-dashed border-lp-line-strong pt-3.5 text-[15px] leading-[1.55]", view === "Lender" && "font-mono text-sm")}>
                {view === "Borrower" ? l.borrowerReason : l.lenderReason}
              </p>
            </article>
          )
        })}
      </div>

      <div className="flex flex-wrap justify-between gap-x-5 gap-y-2 border-t border-lp-line bg-lp-page px-[26px] py-4 text-[15px]">
        <span className="text-lp-text-2">{COMPARISON.footnote}</span>
        <Link href="/compare/hollis-family-farm" className="font-semibold">
          {COMPARISON.moreLink.replace("{n}", String(data.otherApplicants))}
        </Link>
      </div>
    </div>
  )
}
