import { CircleCheck, CircleAlert, CircleHelp, CircleX } from "lucide-react"
import { cn } from "@/lib/utils"

import type { Outcome } from "@/lib/schemas"
export type { Outcome }

// Colour is always paired with an icon and a label, never used alone.
const OUTCOMES: Record<Outcome, { label: string; short: string; icon: typeof CircleCheck; className: string }> = {
  approve: { label: "Approved", short: "Approved", icon: CircleCheck, className: "bg-approve-soft text-approve" },
  approve_with_conditions: { label: "Approved with conditions", short: "Conditions", icon: CircleAlert, className: "bg-conditions-soft text-conditions" },
  refer: { label: "Referred", short: "Referred", icon: CircleHelp, className: "bg-refer-soft text-refer" },
  decline: { label: "Declined", short: "Declined", icon: CircleX, className: "bg-decline-soft text-decline" },
}

export const outcomeLabel = (o: Outcome) => OUTCOMES[o].label

export function OutcomeChip({ outcome, short = false, className }: { outcome: Outcome; short?: boolean; className?: string }) {
  const { label: full, short: brief, icon: Icon, className: tone } = OUTCOMES[outcome]
  const label = short ? brief : full
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tone, className)}>
      <Icon aria-hidden className="size-3.5" />
      {label}
      {short && brief !== full && <span className="sr-only"> ({full})</span>}
    </span>
  )
}
