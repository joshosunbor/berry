"use client"

import { useId, useRef } from "react"
import { cn } from "@/lib/utils"

/*
 * Tabs: the ARIA tabs pattern without a library. Roving tabindex;
 * Left/Right and Home/End move between tabs; selection follows focus; each
 * tab controls its panel. Two looks: "underline" (a rule with a green bar on
 * the active tab) and "segmented" (a pill strip with a navy active tab).
 */
export function useTabs(count: number, value: number, onChange: (i: number) => void) {
  const base = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const tabId = (i: number) => `${base}-tab-${i}`
  const panelId = (i: number) => `${base}-panel-${i}`
  const move = (i: number) => {
    const next = (i + count) % count
    onChange(next)
    refs.current[next]?.focus()
  }
  return {
    list: { role: "tablist" as const },
    tab: (i: number) => ({
      ref: (el: HTMLButtonElement | null) => {
        refs.current[i] = el
      },
      id: tabId(i),
      role: "tab" as const,
      type: "button" as const,
      "aria-selected": value === i,
      "aria-controls": panelId(i),
      tabIndex: value === i ? 0 : -1,
      onClick: () => onChange(i),
      onKeyDown: (e: React.KeyboardEvent) => {
        const k = { ArrowRight: value + 1, ArrowLeft: value - 1, Home: 0, End: count - 1 }[e.key]
        if (k === undefined) return
        e.preventDefault()
        move(k)
      },
    }),
    panel: (i: number) => ({ id: panelId(i), role: "tabpanel" as const, "aria-labelledby": tabId(i), tabIndex: 0, hidden: value !== i }),
  }
}

export { tabClass, tabListClass, type TabsVariant } from "./tab-styles"
import { tabClass, tabListClass, type TabsVariant } from "./tab-styles"

/** A simple tab strip with text labels; render panels with `tabs.panel(i)`. */
export function TabStrip({
  label,
  items,
  value,
  onChange,
  variant = "segmented",
  className,
}: {
  label: string
  items: React.ReactNode[]
  value: number
  onChange: (i: number) => void
  variant?: TabsVariant
  className?: string
}) {
  const t = useTabs(items.length, value, onChange)
  return (
    <div {...t.list} aria-label={label} className={cn(tabListClass(variant), className)}>
      {items.map((it, i) => (
        <button key={i} {...t.tab(i)} className={tabClass(variant, value === i)}>
          {it}
        </button>
      ))}
    </div>
  )
}
