"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, Compass } from "lucide-react"
import { useLocationSearch } from "@/components/berry/url-state"
import { cn } from "@/lib/utils"
import { APP_SECTIONS, isCurrentPage, SECTION_ICON, sectionFor } from "./app-nav"


/** Desktop: the four sections down the left, each with its pages; How it works and the tour at the foot. */
export function AppSidebar() {
  const pathname = usePathname()
  const tab = new URLSearchParams(useLocationSearch()).get("tab")
  const current = sectionFor(pathname)
  return (
    <nav aria-label="Sections" className="sticky top-[var(--app-header-h,64px)] hidden h-[calc(100dvh-var(--app-header-h,64px))] w-[220px] shrink-0 flex-col overflow-y-auto border-r border-line bg-panel px-3 py-6 lg:flex">
      <ul className="space-y-5">
        {APP_SECTIONS.map((s) => {
          const Icon = SECTION_ICON[s.id]
          const on = current?.id === s.id
          return (
            <li key={s.id}>
              <Link href={s.href} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[15px] font-semibold", on ? "text-fg" : "text-fg-2 hover:text-fg")}>
                <Icon aria-hidden className={cn("size-4", on ? "text-green-ink" : "text-fg-3")} />
                {s.label}
              </Link>
              <ul className="mt-1 space-y-0.5 border-l border-line pl-3 ml-[19px]">
                {s.pages.map((p) => {
                  const here = isCurrentPage(p, pathname, tab) || (p.href === s.href && s.pages.length === 1 && on)
                  return (
                    <li key={p.href}>
                      <Link
                        href={p.href}
                        aria-current={here ? "page" : undefined}
                        className={cn("block rounded-md px-2 py-1.5 text-sm", here ? "bg-field font-medium text-fg" : "text-fg-3 hover:text-fg")}
                      >
                        {p.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ul>
      <ul className="mt-auto space-y-1 border-t border-line pt-4 text-sm">
        <li>
          <Link href="/how-it-works" aria-current={pathname === "/how-it-works" ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-1.5", pathname === "/how-it-works" ? "font-medium text-fg" : "text-fg-2 hover:text-fg")}>
            <BookOpen aria-hidden className="size-4 text-fg-3" />
            How it works
          </Link>
        </li>
        <li>
          <Link href="/demo" aria-current={pathname === "/demo" ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-1.5", pathname === "/demo" ? "font-medium text-fg" : "text-fg-2 hover:text-fg")}>
            <Compass aria-hidden className="size-4 text-fg-3" />
            Demo start and tour
          </Link>
        </li>
      </ul>
    </nav>
  )
}

/** Phones and tablets: the four sections as a tab bar fixed to the bottom of the screen. */
export function AppTabBar() {
  const current = sectionFor(usePathname())
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/96 pb-[env(safe-area-inset-bottom)] backdrop-blur-[10px] md:hidden">
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {APP_SECTIONS.map((s) => {
          const Icon = SECTION_ICON[s.id]
          const on = current?.id === s.id
          return (
            <li key={s.id}>
              <Link
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-medium", on ? "text-fg" : "text-fg-3 hover:text-fg")}
              >
                <Icon aria-hidden className={cn("size-5", on && "text-green-ink")} />
                {s.short}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
