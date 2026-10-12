import { cn } from "@/lib/utils"
import { Card } from "./card"

/** A single figure with its label and an optional line beneath (dashboards, summaries). */
export function StatTile({ label, value, sub, extra, className, as = "div" }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; extra?: React.ReactNode; className?: string; as?: "div" | "li" | "article" }) {
  return (
    <Card as={as} pad="md" className={cn("flex min-w-0 flex-col", className)}>
      <div className="text-sm text-fg-3">{label}</div>
      <div className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-fg tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-sm text-fg-2">{sub}</div>}
      {extra}
    </Card>
  )
}
