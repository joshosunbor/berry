"use client"

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react"
import { MODES, MODE_META, type Mode } from "@/lib/modes"
import { cn } from "@/lib/utils"

/*
 * The selected lender, remembered per browser (a convenience only). Server
 * render and first paint use the default; the stored choice applies after
 * hydration.
 */

const KEY = "berry.mode"
const DEFAULT: Mode = "credit_union"
const listeners = new Set<() => void>()

function read(): Mode {
  try {
    const v = localStorage.getItem(KEY)
    return (MODES as readonly string[]).includes(v ?? "") ? (v as Mode) : DEFAULT
  } catch {
    return DEFAULT
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

const ModeContext = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: DEFAULT, setMode: () => {} })

export function ModeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, read, () => DEFAULT)
  const setMode = useCallback((m: Mode) => {
    try {
      localStorage.setItem(KEY, m)
    } catch {
      /* storage unavailable: selection lasts for this page only */
    }
    listeners.forEach((l) => l())
  }, [])
  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>
}

export const useMode = () => useContext(ModeContext)

/** Segmented control for choosing a lender. Arrow keys move between options. */
export function ModeSwitcher({ className }: { className?: string }) {
  const { mode, setMode } = useMode()
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    const i = MODES.indexOf(mode)
    const next = MODES[(i + (e.key === "ArrowRight" ? 1 : MODES.length - 1)) % MODES.length]
    setMode(next)
    ;(e.currentTarget.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Lender" onKeyDown={onKey} className={cn("inline-flex rounded-lg border border-rule bg-surface p-1", className)}>
      {MODES.map((m) => {
        const meta = MODE_META[m]
        const active = m === mode
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-mode={m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? cn(meta.classes.solid, meta.classes.on) : "text-muted-ink hover:text-ink",
            )}
          >
            <span className="sm:hidden">{meta.institution.split(" ")[0]}</span>
            <span className="hidden sm:inline">{meta.institution}</span>
          </button>
        )
      })}
    </div>
  )
}
