import { CircleCheck, CircleDashed, FileClock, Rocket } from "lucide-react"
import { REGULATORY_STATUS, type RegulatoryRow } from "@/lib/regulatory/status"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Pill } from "@/components/ui/pill"
import { h3Class } from "@/components/ui/section-header"
import { longDate, Section } from "./section"

const STATUS_STYLE: Record<RegulatoryRow["status"], { icon: typeof CircleCheck; tone: "ok" | "warn" | "info" | "neutral" }> = {
  Live: { icon: CircleCheck, tone: "ok" },
  "Enacted, not in force": { icon: FileClock, tone: "warn" },
  "In draft": { icon: FileClock, tone: "warn" },
  Launching: { icon: Rocket, tone: "info" },
  Illustrative: { icon: CircleDashed, tone: "neutral" },
}

function StatusBadge({ status }: { status: RegulatoryRow["status"] }) {
  const { icon: Icon, tone } = STATUS_STYLE[status]
  return (
    <Pill tone={tone} className="gap-1">
      <Icon aria-hidden className="size-3.5" />
      {status}
    </Pill>
  )
}

/** How it works, third tab: the dated regulatory status panel, one row per rule or system Berry touches. */
export function CanadianRules() {
  const status = REGULATORY_STATUS
  return (
    <div>
        <Section id="regulatory-status" title="Regulatory status">
          <p>
            Status as of <span className="font-semibold text-fg">{longDate(status.asOf)}</span>. Each row links to its source and shows when it was last checked. Sources that aren&apos;t a regulator, government body or Payments
            Canada are marked as such. <span className="font-semibold text-fg">Live</span> means in force; <span className="font-semibold text-fg">Enacted, not in force</span> means passed into law
            but not yet in effect; <span className="font-semibold text-fg">In draft</span> means proposed; <span className="font-semibold text-fg">Launching</span> means announced and rolling out; <span className="font-semibold text-fg">Illustrative</span>{" "}
            means Berry could not confirm it from an official source.
          </p>
          <ul className="space-y-3">
            {status.rows.map((r) => (
              <Card as="li" key={r.id} id={`status-${r.id}`} className="scroll-mt-20">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className={cn(h3Class, "text-lg text-fg")}>{r.name}</h3>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1.5 text-sm leading-6">{r.summary}</p>
                {r.effective && <p className="mt-1 text-sm text-fg-3">{r.effective}</p>}
                <p className="mt-2 text-sm leading-6">
                  <span className="font-semibold text-fg">In Berry ({r.berryUse.toLowerCase()}):</span> <span className="text-fg-2">{r.inBerry}</span>
                </p>
                {r.note && <p className="mt-1 text-sm text-fg-3">Note: {r.note}</p>}
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-3">
                  <a href={r.source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center text-fg-2 underline underline-offset-2 hover:text-fg">
                    Source: {r.source.name}
                  </a>
                  {r.source.kind !== "official" && <span>Not an official source ({r.source.kind})</span>}
                  {r.moreSources?.map((m) => (
                    <a key={m.url} href={m.url} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center text-fg-2 underline underline-offset-2 hover:text-fg">
                      Also: {m.name}
                    </a>
                  ))}
                  <span>Checked {longDate(r.asOf)}</span>
                </p>
              </Card>
            ))}
          </ul>
        </Section>
    </div>
  )
}
