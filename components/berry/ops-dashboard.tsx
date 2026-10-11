"use client"

import { useState } from "react"
import { Lightbulb } from "lucide-react"
import { Illustrative } from "@/components/berry/illustrative"
import { asOfText, MomentPicker } from "@/components/berry/ops-moment"
import { useOpsMoment } from "@/components/berry/ops-store"
import { MODE_META, MODES } from "@/lib/modes"
import type { Kpi, LenderFilter } from "@/lib/ops/metrics"
import { OPS_MOMENTS } from "@/lib/ops/moments"
import { cn } from "@/lib/utils"

/*
 * The operations dashboard (CLAUDE.md §5D). Every KPI is computed on the
 * server from the ledger, the simulator, the reconciliation report and the
 * queue engine, for each moment and lender; this component only picks
 * which to show.
 */

export interface DashboardData {
  /** [filter][moment] → KPIs and the bottleneck. */
  snapshots: Record<LenderFilter, Record<string, { kpis: Kpi[]; bottleneck: string | null }>>
}

const FILTERS: { id: LenderFilter; label: string }[] = [{ id: "all", label: "All lenders" }, ...MODES.map((m) => ({ id: m as LenderFilter, label: MODE_META[m].institution }))]
const GROUPS: { id: Kpi["group"]; label: string }[] = [
  { id: "front", label: "Front end" },
  { id: "funding", label: "Funding" },
  { id: "servicing", label: "Servicing" },
  { id: "operations", label: "Operations" },
]

export function OpsDashboard({ data }: { data: DashboardData }) {
  const at = useOpsMoment()
  const [filter, setFilter] = useState<LenderFilter>("all")
  const snap = data.snapshots[filter][at]
  const series = (id: string) => OPS_MOMENTS.map((m) => data.snapshots[filter][m.at].kpis.find((k) => k.id === id)?.raw ?? null)

  return (
    <div>
      <div className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-4 lg:flex-row lg:items-end lg:justify-between">
        <MomentPicker className="lg:w-[28rem]" />
        <div role="radiogroup" aria-label="Lender" className="flex flex-wrap gap-1 rounded-lg border border-rule p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn("rounded-md px-3 py-1 text-sm", filter === f.id ? "bg-ink text-background" : "text-muted-ink hover:text-ink")}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-ink">
        As of <span className="num font-medium text-ink">{asOfText(at)}</span> (simulated). Computed from the simulated history; actions you take in the console are kept in your
        browser and aren&apos;t included.
      </p>

      {snap.bottleneck && (
        <section aria-label="What I'd improve next" className="mt-6 flex gap-3 rounded-lg border border-rule bg-surface p-4">
          <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-conditions" />
          <div>
            <h2 className="font-semibold">What I&apos;d improve next</h2>
            <p className="mt-1 text-sm">{snap.bottleneck}</p>
          </div>
        </section>
      )}

      {GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={`kpi-${g.id}`} className="mt-8">
          <h2 id={`kpi-${g.id}`} className="text-lg font-semibold">
            {g.label}
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {snap.kpis
              .filter((k) => k.group === g.id)
              .map((k) => (
                <li key={k.id} className="min-w-0">
                  <Tile kpi={k} at={at} series={series(k.id)} />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Tile({ kpi, at, series }: { kpi: Kpi; at: string; series: (number | null)[] }) {
  return (
    <article aria-label={kpi.label} className="flex h-full flex-col rounded-lg border border-rule bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-ink">{kpi.label}</h3>
        {kpi.illustrative && <Illustrative why={kpi.illustrative} />}
      </div>
      <p className="num mt-1 text-2xl font-semibold tracking-tight">{kpi.value}</p>
      <p className="mt-1 text-sm text-muted-ink">{kpi.definition}</p>
      <Sparkline values={series} current={OPS_MOMENTS.findIndex((m) => m.at === at)} label={kpi.label} />
      <p className="num mt-1 text-xs text-muted-ink">As of {asOfText(at)} (simulated)</p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted-ink hover:text-ink">How it&apos;s computed</summary>
        <p className="mt-2">{kpi.how}</p>
        {kpi.illustrative && <p className="mt-2 text-xs text-muted-ink">Illustrative: {kpi.illustrative}</p>}
        {kpi.breakdown && kpi.breakdown.length > 0 && (
          <dl className="mt-2 space-y-1">
            {kpi.breakdown.map((b) => (
              <div key={b.label} className="flex justify-between gap-3 text-xs">
                <dt className="min-w-0 text-muted-ink">{b.label}</dt>
                <dd className="num shrink-0 text-right">{b.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </details>
    </article>
  )
}

/** A small line across the simulation's moments; the current one is marked. */
function Sparkline({ values, current, label }: { values: (number | null)[]; current: number; label: string }) {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length < 2) return <div className="mt-3 h-8" aria-hidden />
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const W = 200
  const H = 32
  const x = (i: number) => (i / (values.length - 1)) * (W - 8) + 4
  const y = (v: number) => (max === min ? H / 2 : H - 4 - ((v - min) / (max - min)) * (H - 8))
  const pts = values.flatMap((v, i) => (v === null ? [] : [`${x(i)},${y(v)}`]))
  const cur = values[current]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-8 w-full text-muted-ink" role="img" aria-label={`${label} across the ${values.length} moments in the simulation; the marked point is the selected moment.`}>
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {cur !== null && cur !== undefined && <circle cx={x(current)} cy={y(cur)} r="3" className="fill-ink" />}
    </svg>
  )
}
