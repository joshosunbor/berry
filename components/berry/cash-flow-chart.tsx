"use client"

import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { MonthTotals } from "@/lib/engine/ledger-view"
import { formatCents } from "@/lib/money"

/*
 * Twelve months of money in vs money out. Colours come from the theme
 * tokens (chart-in / chart-out, 3:1 against the card in light and dark), so
 * the chart switches with the theme; peak-season months are shaded and
 * named in the legend, so nothing relies on colour alone.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

interface Row {
  label: string
  month: string
  in: number
  out: number
  net: number
  peak: boolean
}

const compact = (cents: number) => {
  const d = cents / 100
  if (Math.abs(d) >= 1000) return `$${Math.round(d / 1000)}k`
  return `$${Math.round(d)}`
}

function TooltipBody({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="rounded-[10px] bg-panel px-3 py-2 text-sm shadow-lift">
      <p className="font-medium">
        {r.month}
        {r.peak && <span className="ml-2 text-xs font-normal text-fg-3">peak season</span>}
      </p>
      <dl className="num mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
        <dt className="flex items-center gap-1.5 text-fg-3">
          <span aria-hidden className="size-2.5 rounded-sm bg-chart-in" />
          Money in
        </dt>
        <dd className="text-right">{formatCents(r.in, { whole: true })}</dd>
        <dt className="flex items-center gap-1.5 text-fg-3">
          <span aria-hidden className="size-2.5 rounded-sm bg-chart-out" />
          Money out
        </dt>
        <dd className="text-right">{formatCents(r.out, { whole: true })}</dd>
        <dt className="text-fg-3">Left over</dt>
        <dd className="text-right font-medium">{formatCents(r.net, { whole: true })}</dd>
      </dl>
    </div>
  )
}

export function CashFlowChart({ months, peakMonths, seasonal }: { months: MonthTotals[]; peakMonths: number[]; seasonal: boolean }) {
  const rows: Row[] = months.map((m) => {
    const cal = Number(m.month.slice(5, 7))
    return {
      label: MONTHS[cal - 1],
      month: `${MONTHS[cal - 1]} ${m.month.slice(0, 4)}`,
      in: m.inflowCents,
      out: m.outflowCents,
      net: m.netCents,
      peak: seasonal && peakMonths.includes(cal),
    }
  })

  return (
    <figure>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-3">
        <span className="font-semibold text-fg">Cash flow, last {months.length} months</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-chart-in" />
          Money in
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-chart-out" />
          Money out
        </span>
        {seasonal && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm border border-line-strong bg-green-tint-2" />
            Peak season
          </span>
        )}
      </figcaption>
      <div className="mt-3 h-64" role="img" aria-label={`Bar chart of money in and money out for each of the last ${months.length} months. A table view follows.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--ds-line)" />
            {rows.filter((r) => r.peak).map((r) => (
              <ReferenceArea key={r.label} x1={r.label} x2={r.label} fill="var(--ds-green-tint-2)" fillOpacity={1} strokeOpacity={0} ifOverflow="extendDomain" />
            ))}
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--ds-line-strong)" }} tick={{ fill: "var(--ds-fg-3)", fontSize: 12 }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickFormatter={compact} tickLine={false} axisLine={false} tick={{ fill: "var(--ds-fg-3)", fontSize: 12 }} width={48} />
            <Tooltip content={<TooltipBody />} cursor={{ fill: "var(--ds-field)", opacity: 0.7 }} />
            <Bar dataKey="in" name="Money in" fill="var(--ds-chart-in)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <Bar dataKey="out" name="Money out" fill="var(--ds-chart-out)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-fg-3 hover:text-fg">Show as table</summary>
        <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Cash flow by month (scrolls sideways)">
          <table className="w-full min-w-[360px] text-left">
            <thead className="text-fg-3">
              <tr>
                <th scope="col" className="py-1 pr-4 font-medium">Month</th>
                <th scope="col" className="py-1 pr-4 text-right font-medium">Money in</th>
                <th scope="col" className="py-1 pr-4 text-right font-medium">Money out</th>
                <th scope="col" className="py-1 text-right font-medium">Left over</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.month}>
                  <th scope="row" className="py-1 pr-4 font-normal">
                    {r.month}
                    {r.peak && <span className="ml-1 text-xs text-fg-3">(peak)</span>}
                  </th>
                  <td className="py-1 pr-4 text-right">{formatCents(r.in, { whole: true })}</td>
                  <td className="py-1 pr-4 text-right">{formatCents(r.out, { whole: true })}</td>
                  <td className="py-1 text-right">{formatCents(r.net, { whole: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
