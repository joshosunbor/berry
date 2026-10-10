import { cn } from "@/lib/utils"
import { formatCents } from "@/lib/money"

/** Renders an amount stored in integer cents, with tabular numerals. */
export function Money({ cents, whole = false, className }: { cents: number; whole?: boolean; className?: string }) {
  return <span className={cn("num", className)}>{formatCents(cents, { whole })}</span>
}
