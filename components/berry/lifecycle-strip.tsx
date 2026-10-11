"use client"

import { useId, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

/*
 * The whole loan, end to end (landing page). Each step opens to one plain
 * sentence on hover, focus or tap. The connector draws once when the strip
 * scrolls into view; nothing changes on its own after that, and with
 * reduced motion it's drawn from the start.
 */

export const LIFECYCLE = [
  { step: "Consent", text: "Before any data is read, the applicant sees what is shared, why, for how long and who receives it, and can revoke it later." },
  { step: "Verify", text: "Identity and business checks clear most applicants automatically; anything unclear goes to a person." },
  { step: "Decide", text: "Each lender's rules read the same cash flow, and every answer comes with reasons in plain language." },
  { step: "Fund (AFT or instant)", text: "Money goes out by next-day AFT file or an instant rail, after the name on the account is checked." },
  { step: "Collect (PAD)", text: "Pre-authorized debits follow the repayment plan: monthly, on payday, or after harvest." },
  { step: "Recover", text: "A returned payment is retried once, on payday and outside the borrower's NSF fee window; then a person reaches out." },
  { step: "Reconcile", text: "Every collection and return is matched to the bank statement; anything that doesn't match goes to a queue." },
] as const

export function LifecycleStrip() {
  const [active, setActive] = useState(0)
  const reduce = useReducedMotion()
  const panel = useId()

  return (
    <div>
      <ol className="relative grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <motion.span
          aria-hidden
          className="absolute left-0 top-5 hidden h-px origin-left bg-ink/30 lg:block"
          style={{ width: "100%" }}
          initial={reduce ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
        {LIFECYCLE.map((s, i) => (
          <li key={s.step} className="relative h-full">
            <button
              type="button"
              aria-expanded={active === i}
              aria-controls={panel}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              className={cn(
                "flex h-full w-full items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-left text-sm font-medium transition-colors",
                active === i ? "border-ink text-ink" : "border-rule text-muted-ink hover:text-ink",
              )}
            >
              <span className={cn("num flex size-6 shrink-0 items-center justify-center rounded-full text-xs", active === i ? "bg-ink text-background" : "bg-muted")}>{i + 1}</span>
              {s.step}
            </button>
          </li>
        ))}
      </ol>
      <p id={panel} aria-live="polite" className="mt-4 min-h-[3.5rem] max-w-3xl text-base leading-7">
        <span className="font-medium">{LIFECYCLE[active].step}.</span> {LIFECYCLE[active].text}
      </p>
    </div>
  )
}
