"use client"

import { Accordion } from "@base-ui/react/accordion"
import { Plus } from "lucide-react"
import { FAQ } from "@/content/landing"

/** Common questions, one open at a time. */
export function Faq() {
  return (
    <Accordion.Root className="min-w-0 flex-[2_1_480px] border-t border-lp-line-strong">
      {FAQ.items.map((f) => (
        <Accordion.Item key={f.q} className="border-b border-lp-line-strong">
          <Accordion.Header className="m-0">
            <Accordion.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-4 py-[18px] text-left text-lg font-semibold tracking-[-0.01em]">
              {f.q}
              <Plus aria-hidden className="size-5 shrink-0 text-lp-text-3 transition-transform group-data-[panel-open]:rotate-45" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className="max-w-[62ch] pb-5 text-lp-text-2">{f.a}</Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}
