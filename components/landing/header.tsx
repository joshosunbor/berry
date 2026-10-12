"use client"

import { useState } from "react"
import Link from "next/link"
import { LIVE_DEMO, NAV } from "@/content/landing"
import { LogoMark } from "./logo"

/** Sticky navy header. Below 860px the links fold into a menu; tapping a link closes it. */
export function LandingHeader() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-10 border-b border-lp-navy-line bg-lp-navy/96 backdrop-blur-[10px]">
      <nav aria-label="Main" className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-x-2.5 gap-y-2.5 wide:gap-x-7 px-[clamp(20px,4vw,40px)] py-3.5">
        <Link href="#top" className="mr-auto flex items-center gap-[9px] text-white">
          <LogoMark />
          <span className="text-[19px] font-bold tracking-[-0.02em]">Berry</span>
        </Link>
        <div className="hidden gap-6 text-[15px] font-medium wide:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-lp-on-navy hover:text-white">
              {n.label}
            </Link>
          ))}
        </div>
        <Link
          href={LIVE_DEMO.href}
          className="inline-flex min-h-11 items-center rounded-lg bg-lp-green px-4 text-[15px] font-semibold text-white transition-colors hover:bg-lp-green-hover"
        >
          {LIVE_DEMO.label}
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
          className="min-h-11 min-w-11 cursor-pointer rounded-lg px-3 text-[15px] font-semibold text-white shadow-[inset_0_0_0_1px_var(--color-lp-navy-line-strong)] wide:hidden"
        >
          {open ? "Close" : "Menu"}
        </button>
      </nav>
      {open && (
        <div id="mobile-menu" className="flex flex-col px-[clamp(20px,4vw,40px)] pb-4 pt-1 text-[17px] font-medium wide:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="border-t border-lp-navy-line py-3 text-white">
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
