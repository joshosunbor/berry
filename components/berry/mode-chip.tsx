import { Building2, Landmark, Zap } from "lucide-react"
import { pillVariants } from "@/components/ui/pill"
import { cn } from "@/lib/utils"
import { MODE_META, type Mode } from "@/lib/modes"

const ICONS = { credit_union: Landmark, fintech: Zap, bank: Building2 } as const

/** A lender's name in its colour: Northgate green, Kite cyan, Aspen slate. */
export function ModeChip({ mode, className }: { mode: Mode; className?: string }) {
  const meta = MODE_META[mode]
  const Icon = ICONS[mode]
  return (
    <span className={cn(pillVariants(), meta.classes.soft, meta.classes.fg, "font-medium", className)}>
      <Icon aria-hidden className="size-3.5" />
      {meta.institution}
    </span>
  )
}
