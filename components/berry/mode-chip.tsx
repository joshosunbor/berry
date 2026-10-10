import { Building2, Landmark, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { MODE_META, type Mode } from "@/lib/modes"

const ICONS = { credit_union: Landmark, fintech: Zap, bank: Building2 } as const

export function ModeChip({ mode, className }: { mode: Mode; className?: string }) {
  const meta = MODE_META[mode]
  const Icon = ICONS[mode]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.classes.soft,
        meta.classes.fg,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {meta.institution}
    </span>
  )
}
