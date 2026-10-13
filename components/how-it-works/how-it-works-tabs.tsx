"use client"

import { useEffect } from "react"
import { useLocationHash, useUrlTab } from "@/components/berry/url-state"
import { cn } from "@/lib/utils"
import { tabClass, tabListClass, useTabs } from "@/components/ui/tabs"

export const HOW_IT_WORKS_TABS = [
  { id: "how-it-decides", label: "How it decides", short: "Decisions" },
  { id: "test-results", label: "Test results", short: "Tests" },
  { id: "canadian-rules", label: "Canadian rules", short: "Rules" },
] as const

type TabId = (typeof HOW_IT_WORKS_TABS)[number]["id"]
const IDS = HOW_IT_WORKS_TABS.map((t) => t.id)

/** Which tab holds an anchor: old /methodology and /accuracy links keep working. */
export function tabForHash(hash: string): TabId | null {
  const id = hash.replace(/^#/, "")
  if (!id) return null
  if (id === "regulatory-status" || id.startsWith("status-")) return "canadian-rules"
  if (["score", "what", "debatable", "by-mode", "misses", "cases"].includes(id) || id.startsWith("edge-")) return "test-results"
  return "how-it-decides"
}

/** The three tabs of How it works. Every panel is in the server HTML; the URL picks which one shows. */
export function HowItWorksTabs({ panels }: { panels: Record<TabId, React.ReactNode> }) {
  const [urlTab, select] = useUrlTab(IDS)
  const hash = useLocationHash()
  const tab = tabForHash(hash) ?? urlTab
  const i = IDS.indexOf(tab)
  const t = useTabs(IDS.length, i, (n) => {
    // Choosing a tab drops any anchor that pointed into another one.
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search)
    select(IDS[n])
  })

  // After a hash switches the tab, bring its anchor into view.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }))
  }, [hash, tab])

  return (
    <div>
      <div className="sticky top-[var(--app-header-h,64px)] z-10 bg-page py-2">
        {/* Phones show short labels so all three fit; the accessible name is the full label at every size. */}
        <div {...t.list} aria-label="How it works" className={cn(tabListClass("segmented"), "w-full flex-nowrap sm:w-max")}>
          {HOW_IT_WORKS_TABS.map((x, n) => (
            <button key={x.id} {...t.tab(n)} className={cn(tabClass("segmented", i === n), "flex-1 whitespace-nowrap px-3 sm:flex-none sm:px-4")}>
              <span aria-hidden className="sm:hidden">
                {x.short}
              </span>
              <span className="sr-only sm:not-sr-only">{x.label}</span>
            </button>
          ))}
        </div>
      </div>
      {HOW_IT_WORKS_TABS.map((x, n) => (
        <div key={x.id} {...t.panel(n)} className="mt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
          {panels[x.id]}
        </div>
      ))}
    </div>
  )
}
