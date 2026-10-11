"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react"
import { Illustrative } from "@/components/berry/illustrative"
import { addOpsAction, DEFAULT_ACTOR, useActor, useOpsActions, useOpsMoment } from "@/components/berry/ops-store"
import { formatCents } from "@/lib/money"
import type { Mode } from "@/lib/modes"
import { requiredRoleFor } from "@/lib/ops/approvals"
import { OPS, member } from "@/lib/ops/config"
import { overLimitRequest } from "@/lib/ops/view"
import type { SeasonResult, StressResult } from "@/lib/servicing/stress"
import { cn } from "@/lib/utils"

/*
 * Poor-harvest stress test on a seasonal operating line (illustrative):
 * the base season next to one where peak-season revenue is lower and costs
 * are unchanged. A shortfall is shown, never capped; it can be sent to the
 * Credit referrals and sign-offs queue as an over-limit request, which a
 * different person must approve. If the sweep falls short, the options a
 * lender would weigh are shown without picking one.
 */

const ROLE_LABEL = { analyst: "an analyst", lead: "a lead", branch_manager: "a branch manager", credit_committee: "the Credit Committee" } as const
const money = (c: number) => formatCents(c, { whole: true })
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`

export function StressTest({
  loanId,
  applicantName,
  mode,
  results,
  defaultPct,
}: {
  loanId: string
  applicantName: string
  mode: Mode
  results: Record<number, StressResult>
  defaultPct: number
}) {
  const [on, setOn] = useState(false)
  const [dropPct, setDropPct] = useState(defaultPct)
  const r = results[dropPct]
  const actions = useOpsActions()
  const actor = useActor(OPS.team.map((m) => m.id))
  const now = useOpsMoment()
  const [error, setError] = useState<string | null>(null)
  const requestId = `q_overlimit-${loanId.replace(/^loan_/, "")}-${dropPct}`
  const requested = actions.some((a) => a.itemId === requestId && a.kind === "item_created")
  const cols: { label: string; s: SeasonResult; stressed: boolean }[] = [
    { label: "Normal harvest", s: r.base, stressed: false },
    ...(on ? [{ label: `Harvest revenue ${dropPct}% lower`, s: r.stressed, stressed: true }] : []),
  ]

  const rows: { label: string; value: (s: SeasonResult, stressed: boolean) => React.ReactNode }[] = [
    { label: "Peak-season revenue", value: (_, st) => money(st ? r.peakRevenueCents - r.lostRevenueCents : r.peakRevenueCents) },
    { label: "Peak drawn this season", value: (s) => money(s.peakDrawnCents) },
    { label: "Peak utilization", value: (s) => pct(s.peakUtilization) },
    {
      label: "Season interest",
      value: (s) => (
        <>
          {formatCents(s.seasonInterestCents)}
          {s.carriedInterestCents > 0 && <span className="block text-xs text-muted-ink">incl. {formatCents(s.carriedInterestCents)} for a year on the carried balance</span>}
        </>
      ),
    },
    {
      label: "Post-harvest sweep",
      value: (s) =>
        s.sweepFullyRepays ? (
          <span className="inline-flex items-center gap-1 text-approve">
            <CheckCircle2 aria-hidden className="size-4" /> Repays in full
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-decline">
            <AlertTriangle aria-hidden className="size-4" /> Repays {money(s.sweepRepaidCents)} of {money(s.peakDrawnCents)}
          </span>
        ),
    },
    { label: "Carried into next season", value: (s) => money(s.carriedCents) },
    {
      label: "Next season's peak need",
      value: (s) => (
        <>
          {money(s.nextSeasonNeedCents)} <span className="block text-xs text-muted-ink">{pct(s.nextSeasonNeedCents / r.limitCents)} of the limit</span>
          {s.overLimitCents > 0 && <span className="block text-xs font-medium text-decline">{money(s.overLimitCents)} over the limit</span>}
        </>
      ),
    },
  ]

  return (
    <section aria-labelledby="stress" className="rounded-lg border border-rule bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="stress" className="flex items-center gap-2 font-semibold">
            Poor-harvest stress test <Illustrative why="Assumes the coming year looks like the past one by calendar month, with peak-season revenue lower and costs unchanged. The percentage is configurable." />
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-ink">
            What if the peak season brings in less? This season&apos;s draws happen before the harvest, so they don&apos;t change. The question is what the
            harvest can repay, and what next season then needs.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => (setOn(!on), setError(null))}
            className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-ink" : "bg-muted")}
          >
            <span className={cn("absolute left-0 top-0.5 size-5 rounded-full bg-surface shadow transition-transform", on ? "translate-x-[1.375rem]" : "translate-x-0.5")} />
          </button>
          Stress test
        </label>
      </div>

      {on && (
        <label className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-ink">Peak-season revenue lower by</span>
          <select value={dropPct} onChange={(e) => (setDropPct(Number(e.target.value)), setError(null))} className="rounded-md border border-rule bg-surface px-2 py-1">
            {Object.keys(results).map((p) => (
              <option key={p} value={p}>
                {p}%
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-ink">
            ({money(r.lostRevenueCents)} less; costs unchanged; reserve {money(r.reserveCents)})
          </span>
        </label>
      )}

      <div className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[34%]" />
            {cols.map((c) => (
              <col key={c.label} />
            ))}
          </colgroup>
          <thead className="text-xs text-muted-ink">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">
                <span className="sr-only">Measure</span>
              </th>
              {cols.map((c) => (
                <th key={c.label} scope="col" className={cn("py-2 pr-3 font-medium", c.stressed && "text-ink")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-rule align-top">
                <th scope="row" className="py-2 pr-3 font-normal text-muted-ink">
                  {row.label}
                </th>
                {cols.map((c) => (
                  <td key={c.label} className="num break-words py-2 pr-3">
                    {row.value(c.s, c.stressed)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {on && r.stressed.overLimitCents > 0 && (
        <div className="mt-4 rounded-md border border-decline/40 bg-decline-soft p-4 text-sm" role="status">
          <p className="font-medium text-decline">
            Next season would need {money(r.stressed.nextSeasonNeedCents)}: {money(r.stressed.overLimitCents)} over the {money(r.limitCents)} limit.
          </p>
          <p className="mt-1 text-ink">
            The line isn&apos;t capped quietly: a limit of {money(r.requestedLimitCents)} would cover it, and that needs {ROLE_LABEL[requiredRoleFor(r.requestedLimitCents, "lead")]} or
            above to approve. The person who raises the request can&apos;t approve it.
          </p>
          {requested ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-ink">
              <CheckCircle2 aria-hidden className="size-4 text-approve" /> Over-limit request is in Credit referrals and sign-offs.
              <Link href="/ops" className="inline-flex items-center gap-1 font-medium underline underline-offset-4">
                Open the console <ArrowRight aria-hidden className="size-4" />
              </Link>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                const res = overLimitRequest({
                  loanId,
                  applicantName,
                  mode,
                  limitCents: r.limitCents,
                  needCents: r.stressed.nextSeasonNeedCents,
                  requestedLimitCents: r.requestedLimitCents,
                  dropPct,
                  by: actor,
                  at: now,
                })
                if (res.action.events.length) addOpsAction(res.action)
                setError(res.error)
              }}
              className="mt-3 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-background"
            >
              Prepare an over-limit request as {member(actor)?.name ?? member(DEFAULT_ACTOR)!.name}
            </button>
          )}
          {error && (
            <p role="alert" className="mt-2 text-decline">
              {error}
            </p>
          )}
        </div>
      )}

      {on && r.options && (
        <div className="mt-4 rounded-md border border-rule p-4 text-sm">
          <p className="font-medium">The sweep leaves {money(r.stressed.carriedCents)} unpaid. Options a lender would weigh with the borrower:</p>
          <ul className="mt-2 space-y-2">
            <li>
              <span className="font-medium">Carry it over.</span> The balance stays on the line and is swept after next harvest; about {formatCents(r.options.carryOver.interestCents)} of
              interest over the year, and it counts against next season&apos;s limit.
            </li>
            <li>
              <span className="font-medium">Term out the remainder.</span> Move it to a {r.options.termOut.months}-month term loan: about {formatCents(r.options.termOut.paymentCents)} a month,
              which frees the full limit for next season.
            </li>
            <li>
              <span className="font-medium">Review the limit.</span> Raise it to about {money(r.options.limitReview.newLimitCents)} so next season&apos;s need fits, with a fresh look at
              the business&apos;s plans.
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted-ink">Berry doesn&apos;t pick one. A lender decides with the borrower.</p>
        </div>
      )}
    </section>
  )
}
