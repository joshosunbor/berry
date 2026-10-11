"use client"

import { motion, useReducedMotion } from "framer-motion"
import { ModeChip } from "@/components/berry/mode-chip"
import { OutcomeChip } from "@/components/berry/outcome-chip"
import { MODE_META, type Mode } from "@/lib/modes"
import type { Outcome } from "@/lib/schemas"
import { cn } from "@/lib/utils"

export interface HeroColumn {
  mode: Mode
  outcome: Outcome
  amount: string | null
  product: string | null
  reason: string
}

export function HeroComparison({ name, story, columns }: { name: string; story: string; columns: HeroColumn[] }) {
  const reduce = useReducedMotion()
  const enter = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const } }

  return (
    <div className="rounded-xl border border-rule bg-surface/70 p-4 shadow-soft backdrop-blur sm:p-6">
      <p className="text-sm text-muted-ink">
        <span className="font-medium text-ink">{name}</span> · {story}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {columns.map((c, i) => (
          <motion.article key={c.mode} {...enter(0.15 + i * 0.18)} className={cn("rounded-lg border-t-4 bg-surface p-5", MODE_META[c.mode].classes.border)} aria-label={`${MODE_META[c.mode].institution}: ${c.outcome.replaceAll("_", " ")}`}>
            <ModeChip mode={c.mode} />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <OutcomeChip outcome={c.outcome} />
            </div>
            <p className="num mt-3 text-3xl font-semibold tracking-tight">{c.amount ?? "No offer"}</p>
            {c.product && <p className="text-sm text-muted-ink">{c.product}</p>}
            <motion.p {...enter(0.7 + i * 0.18)} className="mt-4 border-t border-rule pt-4 text-sm leading-6 text-muted-ink">
              {c.reason}
            </motion.p>
          </motion.article>
        ))}
      </div>
    </div>
  )
}
