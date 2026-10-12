"use client"

import { cn } from "@/lib/utils"

/*
 * Segmented control: a small set of mutually exclusive options. "pressed"
 * renders toggle buttons (aria-pressed), "radio" a radio group; both look
 * the same: a field-coloured track with the chosen option raised.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  kind = "pressed",
  size = "md",
  className,
}: {
  label: string
  options: { value: T; label: React.ReactNode }[]
  value: T
  onChange: (v: T) => void
  kind?: "pressed" | "radio"
  size?: "md" | "sm"
  className?: string
}) {
  // Radio groups: one tab stop, and the arrow keys move and select (ARIA radio group pattern).
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (kind !== "radio" || !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return
    e.preventDefault()
    const i = options.findIndex((o) => o.value === value)
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1
    const next = options[(i + step + options.length) % options.length].value
    onChange(next)
    ;(e.currentTarget.querySelector(`[data-value="${CSS.escape(next)}"]`) as HTMLElement | null)?.focus()
  }
  return (
    <div
      role={kind === "radio" ? "radiogroup" : "group"}
      aria-label={label}
      onKeyDown={onKey}
      className={cn("inline-flex flex-wrap rounded-[9px] bg-field p-[3px] shadow-inset-line", className)}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            data-value={o.value}
            {...(kind === "radio" ? { role: "radio", "aria-checked": on, tabIndex: on ? 0 : -1 } : { "aria-pressed": on })}
            onClick={() => onChange(o.value)}
            className={cn(
              "cursor-pointer rounded-[7px] font-medium",
              size === "md" ? "min-h-[34px] px-3 text-sm" : "min-h-8 px-2.5 text-[13px]",
              on ? "bg-panel text-fg shadow-segment-on" : "text-fg-3 hover:text-fg",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
