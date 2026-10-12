import { TOUR } from "@/content/landing"
import type { LandingData } from "@/lib/landing/data"
import { formatCents } from "@/lib/money"
import { MODE_META, type Mode } from "@/lib/modes"
import { cn } from "@/lib/utils"
import { ButtonLink } from "@/components/ui/button"
import { LenderDot, Pill } from "@/components/ui/pill"
import { Table, Td, Th, THead } from "@/components/ui/table"

/* The product tour's panels, drawn from the real applicant file, comparison and loan ledger. */

const ORDER: Mode[] = ["bank", "fintech", "credit_union"]
const plain = (c: number) => (c / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = (c: number) => (c < 0 ? `−${plain(-c)}` : plain(c))
const dateText = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })

function Facts({ rows }: { rows: { k: string; v: React.ReactNode; tone?: "green" }[] }) {
  return (
    <dl className="border-t border-line text-sm">
      {rows.map((r) => (
        <div key={r.k} className="flex justify-between gap-3 border-b border-line py-[9px]">
          <dt className="text-fg-3">{r.k}</dt>
          <dd className={cn("text-right font-semibold", r.tone === "green" && "text-green-ink")}>{r.v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ApplicantFilePanel({ d }: { d: LandingData }) {
  const max = Math.max(...d.months.flatMap((m) => [m.inCents, m.outCents]))
  const pct = (c: number) => `${Math.max(2, Math.round((c / max) * 100))}%`
  const p = d.decisionPanel
  return (
    <div className="flex flex-wrap">
      <div className="flex flex-[1_1_220px] flex-col gap-4 border-r border-line p-6">
        <div>
          <p className="text-xl font-semibold tracking-[-0.01em]">{d.applicant.name}</p>
          <p className="mt-0.5 text-sm text-fg-3">{d.applicant.tourLine}</p>
        </div>
        <p className="text-sm leading-normal text-fg-2">{d.applicant.story}</p>
        <Facts rows={d.features} />
      </div>

      <div className="min-w-0 flex-[3_1_380px] border-r border-line p-6">
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm">
          <span className="font-semibold">{TOUR.chartTitle}</span>
          <span className="flex gap-3.5 text-fg-3">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-xs bg-chart-in" />
              {TOUR.legendIn}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-xs bg-chart-out" />
              {TOUR.legendOut}
            </span>
          </span>
        </div>
        <div role="img" aria-label={d.chartSummary.chart} className="relative mt-[18px] grid h-[220px] grid-cols-12 items-end gap-1.5 pt-[26px]">
          {d.months.map((m, i) =>
            m.peak ? (
              <div key={`band-${m.month}`} aria-hidden className="absolute bottom-0 top-0 rounded-md bg-green-tint-2" style={{ left: `calc(${i} / 12 * 100%)`, width: "calc(100% / 12)" }} />
            ) : null,
          )}
          {d.months.some((m) => m.peak) && (
            <span aria-hidden className="absolute top-1.5 font-mono text-[11px] text-green-ink" style={{ left: `calc(${d.months.findIndex((m) => m.peak)} / 12 * 100% + 4px)` }}>
              {TOUR.harvest}
            </span>
          )}
          {d.months.map((m) => (
            <div key={m.month} className="relative flex h-full items-end justify-center gap-0.5">
              <span className="w-[42%] rounded-t-[3px] bg-chart-in" style={{ height: pct(m.inCents) }} />
              <span className="w-[42%] rounded-t-[3px] bg-chart-out" style={{ height: pct(m.outCents) }} />
            </div>
          ))}
        </div>
        <div aria-hidden className="mt-2 grid grid-cols-12 gap-1.5 text-center font-mono text-[11px] text-fg-3">
          {d.months.map((m) => (
            <span key={m.month}>{m.label[0]}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-[1.4_1_260px] flex-col gap-3.5 bg-panel-alt p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden className="size-[9px] rounded-full bg-northgate" />
            Northgate decision
          </span>
          <Pill tone="ok">{p.outcomeLabel}</Pill>
        </div>
        <div>
          <p className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em]">{p.limit}</p>
          <p className="mt-0.5 text-sm text-fg-2">{p.product}</p>
        </div>
        <ol className="flex list-decimal flex-col gap-1.5 pl-[18px] text-sm leading-normal">
          {p.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
        {p.signOff && (
          <div className="rounded-[10px] bg-field px-3.5 py-3 text-[13px] leading-[1.45] text-fg-2">
            <strong className="font-semibold text-fg">Needs {p.signOff.title.toLowerCase()} sign-off.</strong>
            {p.signOff.belowTitle && p.signOff.belowLimit && ` Above the ${p.signOff.belowTitle.toLowerCase()}'s ${p.signOff.belowLimit} authority.`}
          </div>
        )}
        <ButtonLink href="/compare/hollis-family-farm" size="sm" className="mt-auto">
          {TOUR.compareButton}
        </ButtonLink>
      </div>
    </div>
  )
}

export function ComparePanel({ d }: { d: LandingData }) {
  return (
    <>
      <Table minWidth={680} label="Three lenders compared (scrolls sideways)">
        <THead>
          <tr>
            <Th scope="col" className="w-[22%] py-[18px]">
              {d.applicant.name}
            </Th>
            {ORDER.map((m) => (
              <Th key={m} scope="col" className="py-[18px] text-fg">
                <span className="inline-flex items-center gap-2 text-[15px] font-semibold">
                  <LenderDot mode={m} className="size-[9px]" />
                  {MODE_META[m].institution}
                </span>
              </Th>
            ))}
          </tr>
        </THead>
        <tbody>
          {d.compare.map((r) => (
            <tr key={r.k}>
              <Th scope="row" className="bg-panel font-medium text-fg-3">
                {r.k}
              </Th>
              {ORDER.map((m) => (
                <Td key={m} className={cn("border-line py-3.5", r.differs ? "bg-cyan-tint-2" : "bg-panel", r.bold && "font-semibold")}>
                  {r.cells[m]}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="bg-panel-alt px-6 py-3.5 text-[13px] text-fg-3">{TOUR.compareNote}</p>
    </>
  )
}

export function ServicingPanel({ d }: { d: LandingData }) {
  const s = d.servicing
  const repaid = s.finalBalanceCents === 0 && s.paidOffOn
  return (
    <div className="flex flex-wrap">
      <div className="flex flex-[1_1_240px] flex-col gap-4 border-r border-line p-6">
        <div>
          <p className="text-sm text-fg-3">{d.applicant.name} · operating line</p>
          <p className="mt-1 text-[32px] font-semibold leading-[1.1] tracking-[-0.025em]">{formatCents(s.finalBalanceCents)}</p>
          <p className="mt-0.5 text-sm font-semibold text-green-ink">
            {repaid ? `Repaid in full · final payment ${dateText(s.finalPaymentOn!)} (simulated)` : `Final payment scheduled ${dateText(s.finalPaymentOn!)} (simulated)`}
          </p>
        </div>
        <Facts
          rows={[
            { k: "Limit", v: formatCents(s.limitCents) },
            { k: "Peak drawn", v: formatCents(s.peakDrawnCents) },
            { k: "Season interest", v: formatCents(s.seasonInterestCents) },
            { k: "Repayment", v: s.repayment },
            ...(s.balanced ? [{ k: "Ledger", v: "Balanced", tone: "green" as const }] : []),
          ]}
        />
      </div>
      <div className="min-w-0 flex-[3_1_440px]">
        <Table minWidth={520} label="Loan ledger (scrolls sideways)">
          <THead>
            <tr>
              <Th scope="col">Date</Th>
              <Th scope="col">Entry</Th>
              <Th scope="col" numeric>
                Amount
              </Th>
              <Th scope="col" numeric>
                Balance
              </Th>
            </tr>
          </THead>
          <tbody>
            {d.ledger.map((e, i) => (
              <tr key={i}>
                <Td mono className="whitespace-nowrap text-fg-3">
                  {e.date}
                </Td>
                <Td>
                  {e.entry}
                  {e.scheduled && <span className="ml-1 text-xs text-fg-3">(scheduled)</span>}
                </Td>
                <Td numeric className={e.payment ? "text-green-ink" : "text-fg"}>
                  {signed(e.amountCents)}
                </Td>
                <Td numeric>{plain(e.balanceCents)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  )
}
