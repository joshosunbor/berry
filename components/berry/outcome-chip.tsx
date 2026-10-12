import { CircleCheck, CircleAlert, CircleHelp, CircleX } from "lucide-react"
import { Pill } from "@/components/ui/pill"

import type { Outcome } from "@/lib/schemas"
export type { Outcome }

// Colour is always paired with an icon and a label, never used alone.
// Green approved, amber approved with conditions, neutral referred, red declined.
const OUTCOMES: Record<Outcome, { label: string; short: string; icon: typeof CircleCheck; tone: "ok" | "warn" | "neutral" | "bad" }> = {
  approve: { label: "Approved", short: "Approved", icon: CircleCheck, tone: "ok" },
  approve_with_conditions: { label: "Approved with conditions", short: "Conditions", icon: CircleAlert, tone: "warn" },
  refer: { label: "Referred", short: "Referred", icon: CircleHelp, tone: "neutral" },
  decline: { label: "Declined", short: "Declined", icon: CircleX, tone: "bad" },
}

export const outcomeLabel = (o: Outcome) => OUTCOMES[o].label

export function OutcomeChip({ outcome, short = false, className }: { outcome: Outcome; short?: boolean; className?: string }) {
  const { label: full, short: brief, icon: Icon, tone } = OUTCOMES[outcome]
  const label = short ? brief : full
  return (
    <Pill tone={tone} className={className}>
      <Icon aria-hidden className="size-3.5" />
      {label}
      {short && brief !== full && <span className="sr-only"> ({full})</span>}
    </Pill>
  )
}
