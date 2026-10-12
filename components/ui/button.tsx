import Link from "next/link"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/*
 * Buttons (design handoff: 8px radius, 600 weight, 48px tall; 44px in the
 * header; 40px compact). Use ButtonLink for navigation and Button for
 * actions; both share the same variants.
 */
export const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[8px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        /** Green: the primary action. */
        primary: "bg-green text-white hover:bg-green-hover hover:text-white",
        /** Outlined, on the page or a card. */
        secondary: "bg-transparent text-fg shadow-inset-line-strong hover:bg-field hover:text-fg",
        /** Outlined, on a navy section. */
        "navy-outline": "bg-transparent text-white shadow-inset-navy hover:bg-navy-raised hover:text-white",
        /** White, on a navy section. */
        white: "bg-white text-navy hover:bg-on-navy hover:text-navy",
        /** Destructive confirmation (e.g. Reject). */
        danger: "bg-bad text-white hover:opacity-90 hover:text-white",
        /** Text-only link button. */
        link: "h-auto bg-transparent p-0 text-cyan-ink hover:text-cyan-ink-hover",
      },
      size: {
        /** Inherits the surrounding font size (17px on the landing page). */
        lg: "min-h-12 px-[22px]",
        md: "min-h-11 px-4 text-[15px]",
        sm: "min-h-10 px-3.5 text-sm",
        xs: "min-h-8 px-2.5 text-[13px]",
      },
    },
    compoundVariants: [{ variant: "link", className: "min-h-0 px-0" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
)

type Variants = VariantProps<typeof buttonVariants>

export function Button({ variant, size, className, type = "button", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & Variants) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export function ButtonLink({ variant, size, className, external, children, ...props }: React.ComponentProps<typeof Link> & Variants & { external?: boolean }) {
  if (external)
    return (
      <a href={String(props.href)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant, size }), className)}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  return (
    <Link className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </Link>
  )
}
