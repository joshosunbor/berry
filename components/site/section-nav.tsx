"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLocationSearch } from "@/components/berry/url-state"
import { cn } from "@/lib/utils"
import { tabClass, tabListClass } from "@/components/ui/tab-styles"
import { APP_SECTIONS, isCurrentPage, type AppSection } from "./app-nav"

/** A section's pages as a row of links styled like segmented tabs (e.g. Operations: Queues, Team, Policy, Audit, Dashboard). */
export function SectionNav({ section, className }: { section: AppSection["id"]; className?: string }) {
  const s = APP_SECTIONS.find((x) => x.id === section)!
  const pathname = usePathname()
  const tab = new URLSearchParams(useLocationSearch()).get("tab")
  return (
    <nav aria-label={`${s.label} sections`} className={cn("mt-6 -mx-4 overflow-x-auto px-4 pb-1", className)}>
      <ul className={cn(tabListClass("segmented"), "w-max flex-nowrap gap-0")}>
        {s.pages.map((p) => {
          const on = isCurrentPage(p, pathname, tab)
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={on ? "page" : undefined}
                className={cn(tabClass("segmented", on), "inline-flex items-center whitespace-nowrap hover:text-fg", on && "hover:text-tab-on-fg")}
              >
                {p.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
