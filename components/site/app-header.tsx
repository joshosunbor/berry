"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { ModeSwitcher } from "@/components/berry/mode-context"
import { TourBar } from "@/components/tour/tour-bar"
import { cn } from "@/lib/utils"
import { APP_SECTIONS, sectionFor } from "./app-nav"
import { LogoMark } from "./logo"
import { ThemeToggle } from "./theme-toggle"

/*
 * The header on every product page: the Berry mark (to the demo start), the
 * four sections, the lender switcher (remembered across pages), the theme
 * toggle and a way back to the landing page. The guided tour's bar sits
 * underneath while a tour is running. On phones the switcher gets its own
 * row and the sections move to the tab bar at the bottom.
 */
export function AppHeader() {
  const pathname = usePathname()
  const current = sectionFor(pathname)
  // The header's height (it grows with the tour bar and on phones) for sticky offsets and anchor scrolling.
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Phones: the header scrolls away, so sticky things sit at the top of the screen.
    const set = () => document.documentElement.style.setProperty("--app-header-h", `${getComputedStyle(el).position === "sticky" ? el.offsetHeight : 0}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <header ref={ref} className="relative z-30 border-b border-navy-line bg-navy/96 backdrop-blur-[10px] md:sticky md:top-0">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2.5 px-[clamp(16px,3vw,32px)] py-2.5">
        <Link href="/demo" className="mr-auto flex items-center gap-[9px] text-white hover:text-white md:mr-0">
          <LogoMark />
          <span className="text-[19px] font-bold tracking-[-0.02em]">Berry</span>
          <span className="sr-only">: demo start</span>
        </Link>
        <nav aria-label="App sections" className="hidden flex-1 md:block">
          <ul className="flex gap-5 text-[15px] font-medium">
            {APP_SECTIONS.map((s) => {
              const on = current?.id === s.id
              return (
                <li key={s.id}>
                  <Link
                    href={s.href}
                    aria-current={on ? "page" : undefined}
                    className={cn("hover:text-white", on ? "text-white underline decoration-green-bright decoration-2 underline-offset-[10px]" : "text-on-navy")}
                  >
                    {s.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <ModeSwitcher className="order-last w-full sm:order-none sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none" onNavy />
        <ThemeToggle className="text-white" />
        <Link href="/" aria-label="Back to site" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-on-navy hover:text-white">
          <ArrowLeft aria-hidden className="size-4" />
          <span aria-hidden className="md:hidden xl:inline">Back to site</span>
        </Link>
      </div>
      <TourBar />
    </header>
  )
}
