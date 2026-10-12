"use client"

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react"
import { MODES, MODE_META, type Mode } from "@/lib/modes"
import { LenderDot } from "@/components/ui/pill"
import { SegmentedControl } from "@/components/ui/segmented-control"

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

/** Choosing a lender: a radio-style segmented control with each lender's colour dot. Arrow keys move between options. */
export function ModeSwitcher({ className }: { className?: string }) {
  const { mode, setMode } = useMode()
  return (
    <SegmentedControl
      kind="radio"
      label="Lender"
      value={mode}
      onChange={setMode}
      className={className}
      options={MODES.map((m) => ({
        value: m,
        label: (
          <span className="inline-flex items-center gap-2">
            <LenderDot mode={m} />
            <span className="sm:hidden">{MODE_META[m].institution.split(" ")[0]}</span>
            <span className="hidden sm:inline">{MODE_META[m].institution}</span>
          </span>
        ),
      }))}
    />
  )
}
