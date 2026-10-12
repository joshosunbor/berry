import Link from "next/link"
import { cn } from "@/lib/utils"
import { tabClass, tabListClass } from "./tab-styles"

/** Links between sibling pages (e.g. Console, Dashboard, Loan book), styled like the segmented tabs. */
export function SubNav({ label, items, current, className }: { label: string; items: { label: string; href: string }[]; current: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("mt-6", className)}>
      <ul className={cn(tabListClass("segmented"), "gap-0")}>
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={it.href === current ? "page" : undefined}
              className={cn(tabClass("segmented", it.href === current), "inline-flex items-center hover:text-fg", it.href === current && "hover:text-tab-on-fg")}
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export const OPS_NAV = [
  { label: "Console", href: "/ops" },
  { label: "Dashboard", href: "/ops/dashboard" },
  { label: "Loan book", href: "/ops/loans" },
]
