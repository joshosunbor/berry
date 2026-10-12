import { cva, type VariantProps } from "class-variance-authority"
import type { Mode } from "@/lib/modes"
import { cn } from "@/lib/utils"

/*
 * Pills and badges. Colour always comes with a word (and often an icon),
 * never alone. Green = approved / on time / yes; amber = at risk or
 * conditional; red = breached or declined; cyan = informational.
 */
export const pillVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold", {
  variants: {
    tone: {
      ok: "bg-green-tint text-green-ink",
      warn: "bg-warn-tint text-warn",
      bad: "bg-bad-tint text-bad",
      info: "bg-cyan-tint text-cyan-ink",
      neutral: "bg-field text-fg-2",
    },
    size: {
      md: "px-2.5 py-[3px] text-xs",
      sm: "px-2 py-0.5 text-[11px]",
    },
    /** A small mono label ("Concept", "Designed for"). */
    label: { true: "font-mono font-normal", false: "" },
  },
  compoundVariants: [{ label: true, size: "md", className: "py-0.5" }],
  defaultVariants: { tone: "neutral", size: "md", label: false },
})

export function Pill({ tone, size, label, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof pillVariants>) {
  return <span className={cn(pillVariants({ tone, size, label }), className)} {...props} />
}

/** Lender colours: Northgate green, Kite cyan, Aspen slate. */
export const LENDER_DOT: Record<Mode, string> = { credit_union: "bg-northgate", fintech: "bg-kite", bank: "bg-aspen" }
export const LENDER_TEXT: Record<Mode, string> = { credit_union: "text-northgate", fintech: "text-kite", bank: "text-aspen" }

export function LenderDot({ mode, className }: { mode: Mode; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", LENDER_DOT[mode], className)} />
}
