import { cva, type VariantProps } from "class-variance-authority"
import Link from "next/link"
import { cn } from "@/lib/utils"

/* Cards: 14px radius, a 1px line drawn as a shadow (design handoff). */
export const cardVariants = cva("rounded-[14px]", {
  variants: {
    tone: {
      default: "bg-panel shadow-card",
      alt: "bg-panel-alt shadow-card",
      /** Raised panel inside a navy section. */
      navy: "bg-navy-raised text-on-navy shadow-navy-card",
      /** The large comparison card in the hero. */
      hero: "bg-panel shadow-hero",
      /** A framed window (product tour). */
      frame: "bg-panel shadow-tour",
      /** Dashed outline for placeholders and drafts. */
      dashed: "border border-dashed border-line-strong bg-transparent",
    },
    pad: { none: "", sm: "p-4", md: "p-5", lg: "p-6", xl: "p-[clamp(24px,4vw,40px)]" },
  },
  defaultVariants: { tone: "default", pad: "md" },
})

type CardProps = React.HTMLAttributes<HTMLElement> & VariantProps<typeof cardVariants> & { as?: "div" | "section" | "article" | "li" | "aside" }

export function Card({ tone, pad, as: Tag = "div", className, ...props }: CardProps) {
  return <Tag className={cn(cardVariants({ tone, pad }), className)} {...props} />
}

/** A whole-card link that lifts on hover. */
export function CardLink({ className, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "flex flex-col gap-3.5 rounded-[14px] bg-panel p-7 text-fg shadow-card transition-[transform,box-shadow] duration-[180ms] ease-out hover:-translate-y-1 hover:text-fg hover:shadow-lift",
        className,
      )}
      {...props}
    />
  )
}
