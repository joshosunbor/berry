"use client"

import { useState } from "react"
import { Tabs } from "@base-ui/react/tabs"
import { TOUR } from "@/content/landing"
import { cn } from "@/lib/utils"

/** The product tour: a tab strip over a window frame; the panels are rendered on the server and passed in. */
export function Tour({ panels }: { panels: React.ReactNode[] }) {
  const [tab, setTab] = useState(0)
  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(Number(v))}>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div>
          <h2 id="tour-h" className="max-w-[16ch] text-[clamp(32px,4vw,48px)] font-bold leading-[1.05] tracking-[-0.03em]">
            {TOUR.title}
          </h2>
          <p aria-live="polite" className="mt-3.5 max-w-[48ch] text-lp-text-2">
            {TOUR.tabs[tab].cap}
          </p>
        </div>
        <Tabs.List activateOnFocus aria-label="Product tour" className="inline-flex flex-wrap rounded-[10px] bg-lp-surface p-1 shadow-[inset_0_0_0_1px_var(--color-lp-line)]">
          {TOUR.tabs.map((t, i) => (
            <Tabs.Tab
              key={t.label}
              value={i}
              className={cn("min-h-10 cursor-pointer rounded-[7px] px-4 text-[15px] font-semibold", tab === i ? "bg-lp-navy text-white" : "bg-transparent text-lp-text-2")}
            >
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </div>
      <div className="mt-7 overflow-hidden rounded-[14px] bg-lp-surface shadow-lp-tour">
        <div className="flex items-center gap-3.5 border-b border-lp-line bg-lp-page px-[18px] py-3 text-[13px] text-lp-text-3">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-lp-line-strong" />
            <span className="size-2.5 rounded-full bg-lp-line-strong" />
            <span className="size-2.5 rounded-full bg-lp-line-strong" />
          </span>
          <span className="font-mono">{TOUR.tabs[tab].path}</span>
        </div>
        {panels.map((p, i) => (
          <Tabs.Panel key={TOUR.tabs[i].label} value={i}>
            {p}
          </Tabs.Panel>
        ))}
      </div>
    </Tabs.Root>
  )
}
