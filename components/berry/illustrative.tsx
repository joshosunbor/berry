import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Marks anything not confirmed from an official source. Always shows the word, not just an icon. */
export function Illustrative({ why, className, label = "Illustrative" }: { why?: string; className?: string; label?: string }) {
  const badge = (
    <span className={cn("relative inline-flex items-center gap-1 whitespace-nowrap rounded border border-rule bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-ink", className)}>
      <Info aria-hidden className="size-3" />
      {label}
      {why && <span className="sr-only">: {why}</span>}
    </span>
  )
  if (!why) return badge
  return (
    <Tooltip>
      <TooltipTrigger className="rounded">{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{why}</TooltipContent>
    </Tooltip>
  )
}

/** A source link shown next to a rule. */
export function Source({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-xs text-muted-ink underline underline-offset-2 hover:text-ink">
      {children}
    </a>
  )
}
