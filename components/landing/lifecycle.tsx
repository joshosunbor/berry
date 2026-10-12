"use client"

import { useState } from "react"
import Link from "next/link"
import { LIFECYCLE } from "@/content/landing"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { tabClass, tabListClass, useTabs } from "@/components/ui/tabs"

const pad = (i: number) => String(i + 1).padStart(2, "0")

/** The loan lifecycle as tabs (arrow keys move between steps). "Next" loops back to the start. */
export function Lifecycle() {
  const [step, setStep] = useState<number>(LIFECYCLE.defaultStep)
  const steps = LIFECYCLE.steps
  const last = steps.length - 1
  const t = useTabs(steps.length, step, setStep)
  return (
    <div>
      <div {...t.list} aria-label="Loan lifecycle" className={cn(tabListClass("underline"), "mt-11 grid grid-cols-2 gap-x-4 tablet:grid-cols-4 wide:grid-cols-7")}>
        {steps.map((s, i) => (
          <button
            key={s.name}
            {...t.tab(i)}
            className={tabClass("underline", step === i)}
          >
            <span className="block font-mono text-xs text-fg-3">{pad(i)}</span>
            <span className="mt-1 block text-[17px] font-semibold tracking-[-0.01em]">{s.name}</span>
            <span className="block text-[13px] text-fg-3">{s.rail}</span>
          </button>
        ))}
      </div>
      {steps.map((s, i) => (
        <Card
          key={s.name}
          {...t.panel(i)}
          pad="xl"
          className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-x-12 gap-y-6 [&[hidden]]:hidden"
        >
          <div>
            <p className="font-mono text-[13px] text-fg-3">{LIFECYCLE.stepOf.replace("{n}", pad(i))}</p>
            <h3 className="mt-1.5 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em]">{s.title}</h3>
          </div>
          <div>
            <p className="text-lg leading-[1.55] text-fg-2">{s.body}</p>
            <div className="mt-[18px] flex flex-wrap gap-x-5 gap-y-2 text-[15px] font-semibold">
              <Link href={s.href}>{LIFECYCLE.seeIt}</Link>
              <button type="button" onClick={() => setStep(i === last ? 0 : i + 1)} className="cursor-pointer bg-transparent p-0 font-semibold text-fg-2">
                {i === last ? LIFECYCLE.restart : LIFECYCLE.next.replace("{name}", steps[i + 1].name)}
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
