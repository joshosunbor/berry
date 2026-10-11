import { Ban, CircleCheck, CircleDot, Clock3, HeartHandshake } from "lucide-react"
import type { LoanStatus } from "@/lib/servicing/simulate"
import { cn } from "@/lib/utils"

const STATUS: Record<LoanStatus, { label: string; icon: typeof CircleCheck; className: string }> = {
  active: { label: "Active", icon: CircleDot, className: "bg-muted text-ink" },
  delinquent: { label: "Past due", icon: Clock3, className: "bg-conditions-soft text-conditions" },
  hardship: { label: "Hardship", icon: HeartHandshake, className: "bg-refer-soft text-refer" },
  paid_off: { label: "Paid off", icon: CircleCheck, className: "bg-approve-soft text-approve" },
  charged_off: { label: "Charged off", icon: Ban, className: "bg-decline-soft text-decline" },
}

export const loanStatusLabel = (s: LoanStatus) => STATUS[s].label

export function LoanStatusChip({ status, className }: { status: LoanStatus; className?: string }) {
  const { label, icon: Icon, className: tone } = STATUS[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", tone, className)}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  )
}
