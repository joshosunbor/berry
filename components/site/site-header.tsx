"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ButtonLink } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LogoMark } from "./logo"
import { ThemeToggle } from "./theme-toggle"

/*
 * The one header for every page: sticky navy bar, the Berry mark, links,
 * an optional call to action, the theme toggle, and below 860px a Menu that
 * folds the links away (tapping a link closes it).
 */

export interface NavLink {
  label: string
  href: string
}

export const APP_NAV: NavLink[] = [
  { label: "Workbench", href: "/workbench" },
  { label: "Compare", href: "/compare/hollis-family-farm" },
  { label: "Apply", href: "/apply" },
  { label: "Operations", href: "/ops" },
  { label: "Methodology", href: "/methodology" },
  { label: "Accuracy", href: "/accuracy" },
]

const section = (href: string) => "/" + href.split("/")[1]

export function SiteHeader({ nav = APP_NAV, cta, homeHref = "/" }: { nav?: NavLink[]; cta?: NavLink; homeHref?: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const current = (href: string) => !href.startsWith("#") && href !== "/" && section(pathname) === section(href)
  return (
    <header className="sticky top-0 z-30 border-b border-navy-line bg-navy/96 backdrop-blur-[10px]">
      <nav aria-label="Main" className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-x-2.5 gap-y-2.5 px-[clamp(20px,4vw,40px)] py-3.5 wide:gap-x-7">
        <Link href={homeHref} className="mr-auto flex items-center gap-[9px] text-white hover:text-white">
          <LogoMark />
          <span className="text-[19px] font-bold tracking-[-0.02em]">Berry</span>
        </Link>
        <div className="hidden gap-6 text-[15px] font-medium wide:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={current(n.href) ? "page" : undefined}
              className={cn("hover:text-white", current(n.href) ? "text-white underline decoration-green-bright decoration-2 underline-offset-[10px]" : "text-on-navy")}
            >
              {n.label}
            </Link>
          ))}
        </div>
        {cta && (
          <ButtonLink href={cta.href} size="md">
            {cta.label}
          </ButtonLink>
        )}
        <ThemeToggle className="hidden wide:inline-flex" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
          className="min-h-11 min-w-11 cursor-pointer rounded-lg px-3 text-[15px] font-semibold text-white shadow-inset-navy wide:hidden"
        >
          {open ? "Close" : "Menu"}
        </button>
      </nav>
      {open && (
        <div id="mobile-menu" className="flex flex-col px-[clamp(20px,4vw,40px)] pb-4 pt-1 text-[17px] font-medium wide:hidden">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={current(n.href) ? "page" : undefined}
              className="border-t border-navy-line py-3 text-white hover:text-white"
            >
              {n.label}
            </Link>
          ))}
          <ThemeToggle withLabel />
        </div>
      )}
    </header>
  )
}
