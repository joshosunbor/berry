"use client"

import { useId, useState } from "react"
import { Plus } from "lucide-react"
import { FAQ } from "@/content/landing"

/** Common questions, one open at a time (ARIA accordion: buttons that expand labelled regions). */
export function Faq() {
  const [open, setOpen] = useState<number | null>(null)
  const base = useId()
  return (
    <div className="min-w-0 flex-[2_1_480px] border-t border-lp-line-strong">
      {FAQ.items.map((f, i) => (
        <div key={f.q} className="border-b border-lp-line-strong">
          <h3 className="m-0">
            <button
              type="button"
              id={`${base}-q${i}`}
              aria-expanded={open === i}
              aria-controls={`${base}-a${i}`}
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full cursor-pointer items-center justify-between gap-4 py-[18px] text-left text-lg font-semibold tracking-[-0.01em]"
            >
              {f.q}
              <Plus aria-hidden className={`size-5 shrink-0 text-lp-text-3 transition-transform ${open === i ? "rotate-45" : ""}`} />
            </button>
          </h3>
          <div id={`${base}-a${i}`} role="region" aria-labelledby={`${base}-q${i}`} hidden={open !== i} className="max-w-[62ch] pb-5 text-lp-text-2">
            {f.a}
          </div>
        </div>
      ))}
    </div>
  )
}
