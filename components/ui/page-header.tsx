import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

/*
 * Page header for product pages: a breadcrumb, an optional eyebrow, the H1
 * (smaller than the landing hero), a lead paragraph and actions on the right.
 */
export function PageHeader({
  breadcrumb,
  eyebrow,
  title,
  lead,
  actions,
  children,
  className,
}: {
  breadcrumb?: { label: string; href?: string }[]
  eyebrow?: React.ReactNode
  title: React.ReactNode
  lead?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("pb-8 pt-10 sm:pt-14", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-5">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-fg-3">
            {breadcrumb.map((b, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight aria-hidden className="size-3.5" />}
                {b.href && i < breadcrumb.length - 1 ? (
                  <Link href={b.href} className="text-fg-3 hover:text-fg">
                    {b.label}
                  </Link>
                ) : (
                  <span aria-current={i === breadcrumb.length - 1 ? "page" : undefined} className="text-fg-2">
                    {b.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          {eyebrow && <div className="mb-2 font-mono text-xs uppercase tracking-wide text-green-ink">{eyebrow}</div>}
          <h1 className="text-[clamp(32px,4.5vw,52px)] font-bold leading-[1.05] tracking-[-0.03em] text-fg">{title}</h1>
          {lead && <div className="mt-3.5 max-w-[60ch] text-lg leading-normal text-fg-2">{lead}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
