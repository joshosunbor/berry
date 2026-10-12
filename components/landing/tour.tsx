"use client"

import { useState } from "react"
import { TOUR } from "@/content/landing"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { h2Class } from "@/components/ui/section-header"
import { tabClass, tabListClass, useTabs } from "@/components/ui/tabs"

/** The product tour: a tab strip over a window frame; the panels are rendered on the server and passed in. */
export function Tour({ panels }: { panels: React.ReactNode[] }) {
  const [tab, setTab] = useState(0)
  const t = useTabs(TOUR.tabs.length, tab, setTab)
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div>
          <h2 id="tour-h" className={cn(h2Class, "max-w-[16ch]")}>
            {TOUR.title}
          </h2>
          <p aria-live="polite" className="mt-3.5 max-w-[48ch] text-fg-2">
            {TOUR.tabs[tab].cap}
          </p>
        </div>
        <div {...t.list} aria-label="Product tour" className={tabListClass("segmented")}>
          {TOUR.tabs.map((x, i) => (
            <button
              key={x.label}
              {...t.tab(i)}
              className={tabClass("segmented", tab === i)}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <Card tone="frame" pad="none" className="mt-7 overflow-hidden">
        <div className="flex items-center gap-3.5 border-b border-line bg-page px-[18px] py-3 text-[13px] text-fg-3">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
          </span>
          <span className="font-mono">{TOUR.tabs[tab].path}</span>
        </div>
        {panels.map((p, i) => (
          <div key={TOUR.tabs[i].label} {...t.panel(i)}>
            {p}
          </div>
        ))}
      </Card>
    </div>
  )
}
