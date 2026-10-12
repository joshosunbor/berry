"use client"

import dynamic from "next/dynamic"
import type { Row } from "@/components/berry/cash-flow-plot"
import type { MonthTotals } from "@/lib/engine/ledger-view"
import { formatCents } from "@/lib/money"

/*
 * Twelve months of money in vs money out. Colours come from the theme
 * tokens (chart-in / chart-out, 3:1 against the card in light and dark), so
 * the chart switches with the theme; peak-season months are shaded and
 * named in the legend, so nothing relies on colour alone.
 */

// Client-only and loaded after the page; the placeholder fills the same fixed-height box, so nothing shifts.
const CashFlowPlot = dynamic(() => import("@/components/berry/cash-flow-plot"), {
  ssr: false,
  loading: () => <div aria-hidden className="h-full rounded-[10px] bg-field" />,
})

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

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
        <CashFlowPlot rows={rows} />
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
