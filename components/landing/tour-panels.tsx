import Link from "next/link"
import { TOUR } from "@/content/landing"
import type { LandingData } from "@/lib/landing/data"
import { formatCents } from "@/lib/money"
import { MODE_META, type Mode } from "@/lib/modes"
import { cn } from "@/lib/utils"
import { MODE_DOT } from "./comparison"

/* The product tour's panels, drawn from the real applicant file, comparison and loan ledger. */

const ORDER: Mode[] = ["bank", "fintech", "credit_union"]
const plain = (c: number) => (c / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = (c: number) => (c < 0 ? `−${plain(-c)}` : plain(c))
const dateText = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })

function Facts({ rows }: { rows: { k: string; v: React.ReactNode; tone?: "green" }[] }) {
  return (
    <dl className="border-t border-lp-line text-sm">
      {rows.map((r) => (
        <div key={r.k} className="flex justify-between gap-3 border-b border-lp-line py-[9px]">
          <dt className="text-lp-text-3">{r.k}</dt>
          <dd className={cn("text-right font-semibold", r.tone === "green" && "text-lp-green-ink")}>{r.v}</dd>
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
      <div className="flex flex-[1_1_220px] flex-col gap-4 border-r border-lp-line p-6">
        <div>
          <p className="text-xl font-semibold tracking-[-0.01em]">{d.applicant.name}</p>
          <p className="mt-0.5 text-sm text-lp-text-3">{d.applicant.tourLine}</p>
        </div>
        <p className="text-sm leading-normal text-lp-text-2">{d.applicant.story}</p>
        <Facts rows={d.features} />
      </div>

      <div className="min-w-0 flex-[3_1_380px] border-r border-lp-line p-6">
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm">
          <span className="font-semibold">{TOUR.chartTitle}</span>
          <span className="flex gap-3.5 text-lp-text-3">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-xs bg-lp-green-bright" />
              {TOUR.legendIn}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-xs bg-lp-chart-out" />
              {TOUR.legendOut}
            </span>
          </span>
        </div>
        <div role="img" aria-label={d.chartSummary.chart} className="relative mt-[18px] grid h-[220px] grid-cols-12 items-end gap-1.5 pt-[26px]">
          {d.months.map((m, i) =>
            m.peak ? (
              <div key={`band-${m.month}`} aria-hidden className="absolute bottom-0 top-0 rounded-md bg-lp-green-tint-2" style={{ left: `calc(${i} / 12 * 100%)`, width: "calc(100% / 12)" }} />
            ) : null,
          )}
          {d.months.some((m) => m.peak) && (
            <span aria-hidden className="absolute top-1.5 font-mono text-[11px] text-lp-green-ink" style={{ left: `calc(${d.months.findIndex((m) => m.peak)} / 12 * 100% + 4px)` }}>
              {TOUR.harvest}
            </span>
          )}
          {d.months.map((m) => (
            <div key={m.month} className="relative flex h-full items-end justify-center gap-0.5">
              <span className="w-[42%] rounded-t-[3px] bg-lp-green-bright" style={{ height: pct(m.inCents) }} />
              <span className="w-[42%] rounded-t-[3px] bg-lp-chart-out" style={{ height: pct(m.outCents) }} />
            </div>
          ))}
        </div>
        <div aria-hidden className="mt-2 grid grid-cols-12 gap-1.5 text-center font-mono text-[11px] text-lp-text-3">
          {d.months.map((m) => (
            <span key={m.month}>{m.label[0]}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-[1.4_1_260px] flex-col gap-3.5 bg-lp-surface-alt p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden className="size-[9px] rounded-full bg-lp-green-bright" />
            Northgate decision
          </span>
          <span className="rounded-full bg-lp-green-tint px-2.5 py-[3px] text-xs font-semibold text-lp-green-ink">{p.outcomeLabel}</span>
        </div>
        <div>
          <p className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em]">{p.limit}</p>
          <p className="mt-0.5 text-sm text-lp-text-2">{p.product}</p>
        </div>
        <ol className="flex list-decimal flex-col gap-1.5 pl-[18px] text-sm leading-normal">
          {p.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
        {p.signOff && (
          <div className="rounded-[10px] bg-lp-field px-3.5 py-3 text-[13px] leading-[1.45] text-lp-text-2">
            <strong className="font-semibold text-lp-navy">Needs {p.signOff.title.toLowerCase()} sign-off.</strong>
            {p.signOff.belowTitle && p.signOff.belowLimit && ` Above the ${p.signOff.belowTitle.toLowerCase()}'s ${p.signOff.belowLimit} authority.`}
          </div>
        )}
        <Link
          href="/compare/hollis-family-farm"
          className="mt-auto inline-flex min-h-10 items-center justify-center rounded-lg bg-lp-green text-sm font-semibold text-white hover:bg-lp-green-hover hover:text-white"
        >
          {TOUR.compareButton}
        </Link>
      </div>
    </div>
  )
}

export function ComparePanel({ d }: { d: LandingData }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-lp-surface-alt">
              <th scope="col" className="w-[22%] border-b border-lp-line px-6 py-[18px] font-medium text-lp-text-3">
                {d.applicant.name}
              </th>
              {ORDER.map((m) => (
                <th key={m} scope="col" className="border-b border-lp-line px-6 py-[18px]">
                  <span className="inline-flex items-center gap-2 text-[15px] font-semibold">
                    <span aria-hidden className={cn("size-[9px] rounded-full", MODE_DOT[m])} />
                    {MODE_META[m].institution}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.compare.map((r) => (
              <tr key={r.k}>
                <th scope="row" className="border-b border-lp-line px-6 py-3.5 align-top font-medium text-lp-text-3">
                  {r.k}
                </th>
                {ORDER.map((m) => (
                  <td key={m} className={cn("border-b border-lp-line px-6 py-3.5 align-top", r.differs ? "bg-lp-cyan-tint-2" : "bg-lp-surface", r.bold && "font-semibold")}>
                    {r.cells[m]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="bg-lp-surface-alt px-6 py-3.5 text-[13px] text-lp-text-3">{TOUR.compareNote}</p>
    </>
  )
}

export function ServicingPanel({ d }: { d: LandingData }) {
  const s = d.servicing
  const repaid = s.finalBalanceCents === 0 && s.paidOffOn
  return (
    <div className="flex flex-wrap">
      <div className="flex flex-[1_1_240px] flex-col gap-4 border-r border-lp-line p-6">
        <div>
          <p className="text-sm text-lp-text-3">{d.applicant.name} · operating line</p>
          <p className="mt-1 text-[32px] font-semibold leading-[1.1] tracking-[-0.025em]">{formatCents(s.finalBalanceCents)}</p>
          <p className="mt-0.5 text-sm font-semibold text-lp-green-ink">
            {repaid ? `Repaid in full · final payment ${dateText(s.finalPaymentOn!)}` : `Final payment scheduled ${dateText(s.finalPaymentOn!)}`}
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
      <div className="min-w-0 flex-[3_1_440px] overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="bg-lp-surface-alt text-left text-lp-text-3">
              <th scope="col" className="border-b border-lp-line px-6 py-3.5 font-medium">Date</th>
              <th scope="col" className="border-b border-lp-line px-6 py-3.5 font-medium">Entry</th>
              <th scope="col" className="border-b border-lp-line px-6 py-3.5 text-right font-medium">Amount</th>
              <th scope="col" className="border-b border-lp-line px-6 py-3.5 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {d.ledger.map((e, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap border-b border-lp-line-soft px-6 py-[11px] font-mono text-[13px] text-lp-text-3">{e.date}</td>
                <td className="border-b border-lp-line-soft px-6 py-[11px]">
                  {e.entry}
                  {e.scheduled && <span className="ml-1 text-xs text-lp-text-3">(scheduled)</span>}
                </td>
                <td className={cn("border-b border-lp-line-soft px-6 py-[11px] text-right font-mono text-[13px]", e.payment ? "text-lp-green-ink" : "text-lp-navy")}>{signed(e.amountCents)}</td>
                <td className="border-b border-lp-line-soft px-6 py-[11px] text-right font-mono text-[13px]">{plain(e.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
