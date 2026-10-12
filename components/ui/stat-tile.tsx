import { cn } from "@/lib/utils"
import { Card } from "./card"

/**
 * A single figure with its label and an optional line beneath (dashboards,
 * summaries). Inside a <dl>, pass `term` so the label and value are a
 * dt/dd pair.
 */
export function StatTile({
  label,
  value,
  sub,
  extra,
  term = false,
  size = "lg",
  className,
  as = "div",
}: {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  extra?: React.ReactNode
  term?: boolean
  size?: "lg" | "md"
  className?: string
  as?: "div" | "li" | "article"
}) {
  const L = term ? "dt" : "div"
  const V = term ? "dd" : "div"
  return (
    <Card as={as} pad="md" className={cn("flex min-w-0 flex-col", className)}>
      <L className="text-sm text-fg-3">{label}</L>
      <V className={cn("mt-1 font-semibold leading-tight tracking-[-0.02em] text-fg tabular-nums", size === "lg" ? "text-[28px]" : "text-lg")}>{value}</V>
      {sub && <div className="mt-1 text-sm text-fg-2">{sub}</div>}
      {extra}
    </Card>
  )
}
