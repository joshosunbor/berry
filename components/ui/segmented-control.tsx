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
  return (
    <div role={kind === "radio" ? "radiogroup" : "group"} aria-label={label} className={cn("inline-flex flex-wrap rounded-[9px] bg-field p-[3px] shadow-inset-line", className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            {...(kind === "radio" ? { role: "radio", "aria-checked": on } : { "aria-pressed": on })}
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
