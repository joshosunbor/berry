"use client"

import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatCents } from "@/lib/money"

/* The Recharts plot inside CashFlowChart, loaded after the page so the chart library isn't in the first download. */

export interface Row {
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

export default function CashFlowPlot({ rows }: { rows: Row[] }) {
  return (
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
  )
}
