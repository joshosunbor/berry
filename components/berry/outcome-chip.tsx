import { CircleCheck, CircleAlert, CircleHelp, CircleX } from "lucide-react"
import { cn } from "@/lib/utils"

export type Outcome = "approve" | "approve_with_conditions" | "refer" | "decline"

// Colour is always paired with an icon and a label, never used alone.
const OUTCOMES: Record<Outcome, { label: string; icon: typeof CircleCheck; className: string }> = {
  approve: { label: "Approved", icon: CircleCheck, className: "bg-approve-soft text-approve" },
  approve_with_conditions: { label: "Approved with conditions", icon: CircleAlert, className: "bg-conditions-soft text-conditions" },
  refer: { label: "Referred", icon: CircleHelp, className: "bg-refer-soft text-refer" },
  decline: { label: "Declined", icon: CircleX, className: "bg-decline-soft text-decline" },
}

export function OutcomeChip({ outcome, className }: { outcome: Outcome; className?: string }) {
  const { label, icon: Icon, className: tone } = OUTCOMES[outcome]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tone, className)}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  )
}
