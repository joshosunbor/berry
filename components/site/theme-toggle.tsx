"use client"

import { useSyncExternalStore } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

/*
 * Theme: follows the system setting by default; the toggle cycles System →
 * Light → Dark. The choice is remembered in this browser and applied as
 * <html data-theme> (THEME_SCRIPT applies it before first paint).
 */

export const THEME_KEY = "berry.theme.v1"
type Theme = "system" | "light" | "dark"
const ORDER: Theme[] = ["system", "light", "dark"]
const listeners = new Set<() => void>()

function read(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === "light" || v === "dark" ? v : "system"
  } catch {
    return "system"
  }
}

function apply(t: Theme) {
  try {
    if (t === "system") localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, t)
  } catch {
    /* storage unavailable: the choice lasts for this page view */
  }
  if (t === "system") delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

/** Inline script for <head>: applies a saved light/dark choice before the page paints. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`

const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" }
const ICON = { system: Monitor, light: Sun, dark: Moon }

/** The toggle: an icon button in the header bar, or a labelled row inside the mobile menu. */
export function ThemeToggle({ withLabel = false, className }: { withLabel?: boolean; className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme)
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
  const Icon = ICON[theme]
  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next].toLowerCase()}.`}
      title={`Theme: ${LABEL[theme]}`}
      className={cn(
        withLabel
          ? "flex min-h-11 w-full cursor-pointer items-center gap-2.5 border-t border-navy-line py-3 text-left text-[17px] font-medium text-white"
          : "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-white shadow-inset-navy hover:bg-navy-raised",
        className,
      )}
    >
      <Icon aria-hidden className="size-[18px]" />
      {withLabel && <span>Theme: {LABEL[theme]}</span>}
    </button>
  )
}
