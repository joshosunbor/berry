"use client"

import { useState } from "react"
import Link from "next/link"
import { Tabs } from "@base-ui/react/tabs"
import { LIFECYCLE } from "@/content/landing"
import { cn } from "@/lib/utils"

const pad = (i: number) => String(i + 1).padStart(2, "0")

/** The loan lifecycle as tabs (arrow keys move between steps). "Next" loops back to the start. */
export function Lifecycle() {
  const [step, setStep] = useState<number>(LIFECYCLE.defaultStep)
  const steps = LIFECYCLE.steps
  const last = step === steps.length - 1
  return (
    <Tabs.Root value={step} onValueChange={(v) => setStep(Number(v))}>
      <Tabs.List activateOnFocus aria-label="Loan lifecycle" className="mt-11 grid grid-cols-2 gap-x-4 border-t-2 border-lp-navy tablet:grid-cols-4 wide:grid-cols-7">
        {steps.map((s, i) => (
          <Tabs.Tab
            key={s.name}
            value={i}
            className={cn(
              "-mt-0.5 flex cursor-pointer flex-col justify-start border-t-[3px] bg-transparent pb-4 pl-0 pr-3.5 pt-3.5 text-left",
              step === i ? "border-lp-green text-lp-navy" : "border-transparent text-lp-text-2",
            )}
          >
            <span className="block font-mono text-xs text-lp-text-3">{pad(i)}</span>
            <span className="mt-1 block text-[17px] font-semibold tracking-[-0.01em]">{s.name}</span>
            <span className="block text-[13px] text-lp-text-3">{s.rail}</span>
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {steps.map((s, i) => (
        <Tabs.Panel
          key={s.name}
          value={i}
          className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-x-12 gap-y-6 rounded-[14px] bg-lp-surface p-[clamp(24px,4vw,40px)] shadow-lp-card"
        >
          <div>
            <p className="font-mono text-[13px] text-lp-text-3">{LIFECYCLE.stepOf.replace("{n}", pad(i))}</p>
            <h3 className="mt-1.5 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em]">{s.title}</h3>
          </div>
          <div>
            <p className="text-lg leading-[1.55] text-lp-text-2">{s.body}</p>
            <div className="mt-[18px] flex flex-wrap gap-x-5 gap-y-2 text-[15px] font-semibold">
              <Link href={s.href}>{LIFECYCLE.seeIt}</Link>
              <button type="button" onClick={() => setStep(last ? 0 : step + 1)} className="cursor-pointer bg-transparent p-0 font-semibold text-lp-text-2">
                {last ? LIFECYCLE.restart : LIFECYCLE.next.replace("{name}", steps[step + 1].name)}
              </button>
            </div>
          </div>
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  )
}
