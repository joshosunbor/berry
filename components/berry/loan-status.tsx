import { Ban, CircleCheck, CircleDot, Clock3, HeartHandshake } from "lucide-react"
import { Pill } from "@/components/ui/pill"
import type { LoanStatus } from "@/lib/servicing/simulate"

// Green paid off, amber past due, red charged off; colour always with an icon and a word.
const STATUS: Record<LoanStatus, { label: string; icon: typeof CircleCheck; tone: "ok" | "warn" | "neutral" | "bad" | "info" }> = {
  active: { label: "Active", icon: CircleDot, tone: "neutral" },
  delinquent: { label: "Past due", icon: Clock3, tone: "warn" },
  hardship: { label: "Hardship", icon: HeartHandshake, tone: "info" },
  paid_off: { label: "Paid off", icon: CircleCheck, tone: "ok" },
  charged_off: { label: "Charged off", icon: Ban, tone: "bad" },
}

export const loanStatusLabel = (s: LoanStatus) => STATUS[s].label

export function LoanStatusChip({ status, className }: { status: LoanStatus; className?: string }) {
  const { label, icon: Icon, tone } = STATUS[status]
  return (
    <Pill tone={tone} className={className}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </Pill>
  )
}
