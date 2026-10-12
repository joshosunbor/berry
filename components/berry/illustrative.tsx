import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { pillVariants } from "@/components/ui/pill"
import { cn } from "@/lib/utils"

/** Marks anything not confirmed from an official source. Always shows the word, not just an icon. */
export function Illustrative({ why, className, label = "Illustrative" }: { why?: string; className?: string; label?: string }) {
  const badge = (
    <span className={cn(pillVariants({ tone: "neutral", size: "sm" }), "relative gap-1 font-medium", className)}>
      <Info aria-hidden className="size-3" />
      {label}
      {why && <span className="sr-only">: {why}</span>}
    </span>
  )
  if (!why) return badge
  return (
    <Tooltip>
      <TooltipTrigger className="rounded-full">{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{why}</TooltipContent>
    </Tooltip>
  )
}

/** A source link shown next to a rule. */
export function Source({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-xs text-fg-3 underline underline-offset-2 hover:text-fg">
      {children}
    </a>
  )
}
