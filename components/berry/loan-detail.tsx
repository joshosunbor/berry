"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, Ban, Bell, CheckCircle2, CircleDollarSign, Clock3, HeartHandshake, Landmark, PhoneCall, RotateCcw, Send, Undo2 } from "lucide-react"
import { useClock } from "@/components/berry/clock"
import { Illustrative } from "@/components/berry/illustrative"
import { LoanStatusChip } from "@/components/berry/loan-status"
import { allocateWholeDollars, formatCents } from "@/lib/money"
import { RETURN_CODES } from "@/lib/schemas"
import { formatTimeToFund, RAILS } from "@/lib/servicing/funding"
import type { LoanEventType } from "@/lib/servicing/simulate"
import { daysPastDueAsOf, lineAsOf, outstandingAsOf, statusAsOf, type LoanView } from "@/lib/servicing/views"
import { cn } from "@/lib/utils"

const card = "min-w-0 rounded-lg border border-rule bg-surface p-5"

const ACCOUNT_LABEL: Record<string, string> = {
  principal: "Principal receivable",
  interest: "Interest receivable",
  settlement: "Settlement account",
  clearing: "Clearing (debits in transit)",
  interest_income: "Interest income",
  credit_loss: "Credit losses",
}
const accountLabel = (a: string) => ACCOUNT_LABEL[a.split(":")[0]] ?? a

const EVENT_ICON: Partial<Record<LoanEventType, typeof Send>> = {
  funded: Landmark,
  line_opened: Landmark,
  drawn: Landmark,
  debit_sent: Send,
  debit_settled: CheckCircle2,
  debit_returned: Undo2,
  borrower_fee: CircleDollarSign,
  borrower_notified: Bell,
  retry_scheduled: RotateCcw,
  outreach_task: PhoneCall,
  banking_details_requested: PhoneCall,
  borrower_contacted: PhoneCall,
  debits_resumed: RotateCcw,
  hardship_offered: HeartHandshake,
  payments_deferred: HeartHandshake,
  cured: CheckCircle2,
  charged_off: Ban,
  paid_off: CheckCircle2,
  status_changed: Clock3,
}

export function LoanDetail({ loan }: { loan: LoanView }) {
  const date = useClock()
  const [showRoutine, setShowRoutine] = useState(false)
  const status = statusAsOf(loan, date)
  const owed = outstandingAsOf(loan, date)
  const dpd = daysPastDueAsOf(loan, date)
  const line = lineAsOf(loan, date)
  const entries = loan.entries.filter((e) => e.date <= date)
  const routine = new Set<LoanEventType>(["interest_accrued", "debit_sent", "debit_settled", "status_changed"])
  const events = loan.events.filter((e) => e.date <= date && (showRoutine || !routine.has(e.type))).reverse()
  const fees = loan.borrowerFees.filter((f) => f.date <= date)
  const breaks = loan.breaks.filter((b) => b.firstSeen <= date)
  const debits = entries.reduce((t, e) => t + e.lines.reduce((s, l) => s + l.debitCents, 0), 0)
  const credits = entries.reduce((t, e) => t + e.lines.reduce((s, l) => s + l.creditCents, 0), 0)

  const owedDelta = (e: (typeof entries)[number]) =>
    e.lines.reduce((t, l) => t + (l.account === `principal:${loan.id}` || l.account === `interest:${loan.id}` ? l.debitCents - l.creditCents : 0), 0)
  const rows = entries.reduce<{ e: (typeof entries)[number]; owedAfter: number }[]>((acc, e) => [...acc, { e, owedAfter: (acc.at(-1)?.owedAfter ?? 0) + owedDelta(e) }], [])

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-rule bg-surface p-4">
          <dt className="text-xs text-muted-ink">Status</dt>
          <dd className="mt-1.5"><LoanStatusChip status={status} /></dd>
        </div>
        <div className="rounded-lg border border-rule bg-surface p-4">
          <dt className="text-xs text-muted-ink">Owed</dt>
          <dd className="num mt-1 text-lg font-semibold">{formatCents(owed)}</dd>
        </div>
        <div className="rounded-lg border border-rule bg-surface p-4">
          <dt className="text-xs text-muted-ink">Days past due</dt>
          <dd className="num mt-1 text-lg font-semibold">{dpd || "None"}</dd>
        </div>
        <div className="rounded-lg border border-rule bg-surface p-4">
          <dt className="text-xs text-muted-ink">{line ? "Line opened" : "Funded"}</dt>
          <dd className="mt-1 text-sm">
            {line ? `${formatCents(loan.principalCents, { whole: true })} limit; draws by` : `${formatCents(loan.principalCents, { whole: true })} by`} {RAILS[loan.funding.rail].name}
            {loan.funding.label && <Illustrative className="ml-1.5" label={loan.funding.label} />}
            <span className="num block text-xs text-muted-ink">
              {loan.funding.fundedOn} · {formatTimeToFund(loan.funding.timeToFundMinutes).toLowerCase()} to fund
            </span>
          </dd>
        </div>
      </dl>
      {line && (
        <section aria-labelledby="line" className={card}>
          <h2 id="line" className="font-semibold">Operating line</h2>
          <dl className="num mt-3 grid grid-cols-3 gap-4 text-sm">
            <div><dt className="text-xs text-muted-ink">Limit</dt><dd className="text-lg font-semibold">{formatCents(line.limitCents)}</dd></div>
            <div><dt className="text-xs text-muted-ink">Drawn (owed principal)</dt><dd className="text-lg font-semibold">{formatCents(line.drawnCents)}</dd></div>
            <div><dt className="text-xs text-muted-ink">Available</dt><dd className="text-lg font-semibold">{formatCents(line.availableCents)}</dd></div>
          </dl>
          <div className="mt-3 h-2 rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-ink" style={{ width: `${(line.drawnCents / line.limitCents) * 100}%` }} />
          </div>
          <div className="mt-4 space-y-2 text-sm leading-6">
            <p>
              <span className="font-medium">Draws keep one month&apos;s average spending in the account</span>
              {loan.operatingReserveCents !== null && <span className="num"> ({formatCents(loan.operatingReserveCents, { whole: true })} for this borrower)</span>}. The borrower uses its
              own cash first; the line covers only the gap, based on its past year. Interest is charged only on what&apos;s drawn.{" "}
              <Illustrative why="The one-month reserve is an illustrative setting (operatingReserveMonthsOfSpending)." />
            </p>
            {loan.draws!.length > 0 ? (
              <p className="text-muted-ink">
                Draws:{" "}
                {(() => {
                  const shown = allocateWholeDollars(loan.draws!.map((d) => d.amountCents))
                  return loan.draws!.map((d, i) => `$${shown[i].toLocaleString("en-CA")} on ${d.date}`).join(", ")
                })()}
                <span className="num">
                  {" "}
                  · total ${allocateWholeDollars(loan.draws!.map((d) => d.amountCents)).reduce((t, x) => t + x, 0).toLocaleString("en-CA")}
                </span>
              </p>
            ) : (
              <p className="text-muted-ink">Nothing is drawn: the borrower&apos;s own cash covers the season.</p>
            )}
            <p className="text-muted-ink">
              The rest of the limit is headroom: room to draw more after a poor harvest or a drop in prices, without asking for a new loan.
            </p>
          </div>
        </section>
      )}
      <p className="text-sm text-muted-ink">
        The borrower&apos;s account is at a {loan.borrowerBank === "bank" ? "bank" : "provincially regulated credit union"}.{" "}
        <Link href={`/workbench/${loan.applicantSlug}`} className="underline underline-offset-2 hover:text-ink">Open {loan.applicantName}&apos;s application file</Link>
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="timeline" className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="timeline" className="font-semibold">Timeline</h2>
            <label className="flex items-center gap-2 text-xs text-muted-ink">
              <input type="checkbox" checked={showRoutine} onChange={(e) => setShowRoutine(e.target.checked)} className="size-3.5" />
              Show routine debits and interest
            </label>
          </div>
          <ol className="mt-3 space-y-3">
            {events.map((e, i) => {
              const Icon = EVENT_ICON[e.type] ?? Clock3
              const bad = e.type === "debit_returned" || e.type === "charged_off"
              return (
                <li key={`${e.date}-${e.type}-${i}`} className="flex gap-3 text-sm">
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", bad ? "text-decline" : e.type === "cured" || e.type === "paid_off" ? "text-approve" : "text-muted-ink")} />
                  <div className="min-w-0">
                    <p>
                      <span className="num text-xs text-muted-ink">{e.date}</span>{" "}
                      {e.code ? (
                        <>
                          Debit returned: <span className="font-medium">{e.code} {RETURN_CODES[e.code].label}</span> ({e.stage === "clearing" ? "before settlement" : "after settlement"})
                        </>
                      ) : (
                        e.text
                      )}
                      {e.amountCents !== undefined && e.type !== "borrower_fee" && <span className="num text-muted-ink"> · {formatCents(e.amountCents)}</span>}
                    </p>
                    {e.fee?.label && <Illustrative className="mt-1" label={e.fee.label} />}
                  </div>
                </li>
              )
            })}
            {events.length === 0 && <li className="text-sm text-muted-ink">Nothing yet. Fast-forward to see collections.</li>}
          </ol>
        </section>

        <div className="space-y-6">
          {fees.length > 0 && (
            <section aria-labelledby="fees" className={card}>
              <h2 id="fees" className="font-semibold">Borrower&apos;s bank fees</h2>
              <p className="mt-1 text-sm text-muted-ink">The lender charges no fee for a returned payment. This is what the borrower&apos;s own bank charged.</p>
              <ul className="mt-3 space-y-2 text-sm">
                {fees.map((f) => (
                  <li key={f.date}>
                    <span className="num font-medium">{formatCents(f.fee.feeCents)}</span> <span className="num text-xs text-muted-ink">{f.date}</span>
                    {f.fee.label && <Illustrative className="ml-1.5" label={f.fee.label} />}
                    <span className="block text-muted-ink">{f.fee.explanation}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {breaks.length > 0 && (
            <section aria-labelledby="recon" className={cn(card, "border-conditions/50")}>
              <h2 id="recon" className="flex items-center gap-2 font-semibold">
                <AlertTriangle aria-hidden className="size-4 text-conditions" />
                Reconciliation
              </h2>
              <ul className="mt-2 space-y-2 text-sm">
                {breaks.map((b) => (
                  <li key={b.kind + b.reference}>
                    <span className="font-medium">{b.kind === "returned_pad_not_applied" ? "Returned PAD not applied" : b.kind === "timing_difference" ? "Timing difference" : b.kind.replaceAll("_", " ")}</span>{" "}
                    <span className="text-xs text-muted-ink">found at the {b.firstSeen} cut-off{b.resolvedBy && b.resolvedBy <= date ? `, cleared by ${b.resolvedBy}` : ", open"}</span>
                    <span className="block text-muted-ink">{b.action}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="schedule" className={card}>
            <h2 id="schedule" className="font-semibold">Schedule</h2>
            <ul className="mt-2 divide-y divide-rule text-sm">
              {loan.schedule.slice(0, 12).map((d) => (
                <li key={d.n} className="flex justify-between gap-3 py-1.5">
                  <span className="num">{d.date}</span>
                  <span className="num">{formatCents(d.amountCents)}</span>
                </li>
              ))}
            </ul>
            {loan.schedule.length > 12 && <p className="mt-1 text-xs text-muted-ink">First 12 of {loan.schedule.length} debits.</p>}
          </section>
        </div>
      </div>

      <section aria-labelledby="ledger" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ledger" className="font-semibold">Ledger (double entry)</h2>
          <p className={cn("num text-sm font-medium", debits === credits ? "text-approve" : "text-decline")} role="status">
            Debits {formatCents(debits)} = credits {formatCents(credits)} {debits === credits ? "✓" : "✗"}
          </p>
        </div>
        <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Ledger entries (scrolls sideways)">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Journal entries for this loan up to {date}</caption>
            <thead className="text-xs text-muted-ink">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">Date</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Entry · account</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Debit</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Credit</th>
                <th scope="col" className="py-1.5 text-right font-medium">Owed after</th>
              </tr>
            </thead>
            {rows.slice(-40).map(({ e, owedAfter }) => (
              <tbody key={e.id} className="border-t border-rule">
                <tr>
                  <td className="num py-1.5 pr-3 align-top text-muted-ink" rowSpan={e.lines.length + 1}>{e.date}</td>
                  <td className="py-1.5 pr-3 font-medium" colSpan={3}>{e.memo}</td>
                  <td className="num py-1.5 text-right align-top" rowSpan={e.lines.length + 1}>{formatCents(owedAfter)}</td>
                </tr>
                {e.lines.map((l, i) => (
                  <tr key={i} className="text-muted-ink">
                    <td className={cn("py-0.5 pr-3", l.creditCents > 0 && "pl-4")}>{accountLabel(l.account)}</td>
                    <td className="num py-0.5 pr-3 text-right">{l.debitCents ? formatCents(l.debitCents) : ""}</td>
                    <td className="num py-0.5 pr-3 text-right">{l.creditCents ? formatCents(l.creditCents) : ""}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        {rows.length > 40 && <p className="mt-2 text-xs text-muted-ink">Latest 40 of {rows.length} entries shown; the totals cover all of them.</p>}
        <p className="mt-3 text-xs text-muted-ink">Interest and timings are illustrative. Entries are never edited; corrections are reversing entries.</p>
      </section>
    </div>
  )
}
