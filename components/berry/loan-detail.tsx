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
import { cardVariants } from "@/components/ui/card"
import { Table, Td, Th, THead } from "@/components/ui/table"

const card = cn(cardVariants({ pad: "lg" }), "min-w-0")

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
  hardship_approved: HeartHandshake,
  hardship_declined: HeartHandshake,
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
        <div className={cardVariants({ pad: "md" })}>
          <dt className="text-xs text-fg-3">Status</dt>
          <dd className="mt-1.5"><LoanStatusChip status={status} /></dd>
        </div>
        <div className={cardVariants({ pad: "md" })}>
          <dt className="text-xs text-fg-3">Owed</dt>
          <dd className="num mt-1 text-lg font-semibold">{formatCents(owed)}</dd>
        </div>
        <div className={cardVariants({ pad: "md" })}>
          <dt className="text-xs text-fg-3">Days past due</dt>
          <dd className="num mt-1 text-lg font-semibold">{dpd || "None"}</dd>
        </div>
        <div className={cardVariants({ pad: "md" })}>
          <dt className="text-xs text-fg-3">{line ? "Line opened" : "Funded"}</dt>
          <dd className="mt-1 text-sm">
            {line ? `${formatCents(loan.principalCents, { whole: true })} limit; draws by` : `${formatCents(loan.principalCents, { whole: true })} by`} {RAILS[loan.funding.rail].name}
            {loan.funding.label && <Illustrative className="ml-1.5" label={loan.funding.label} />}
            <span className="num block text-xs text-fg-3">
              {loan.funding.fundedOn} · {formatTimeToFund(loan.funding.timeToFundMinutes).toLowerCase()} to fund
            </span>
          </dd>
        </div>
      </dl>
      <section aria-labelledby="gate" className={card}>
        <h2 id="gate" className="font-semibold">Before funding</h2>
        {loan.gate.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {loan.gate.map((c) => (
              <li key={c.kind + c.label} className="flex gap-2">
                <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-green" />
                <span>
                  {c.label}
                  {c.simulated && <Illustrative className="ml-1.5" label="simulated" why="Documents arriving is simulated a set number of business days after the decision." />}
                  <span className="num block text-xs text-fg-3">Cleared {c.clearedAt!.replace("T", ", ")}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-fg-3">No pre-funding checks apply to this automated approval.</p>
        )}
        <p className="mt-3 text-xs text-fg-3">Funds are sent only after every check clears. This loan was ready at {loan.gateReadyAt.replace("T", ", ")}.</p>
      </section>
      {line && (
        <section aria-labelledby="line" className={card}>
          <h2 id="line" className="font-semibold">Operating line</h2>
          <dl className="num mt-3 grid grid-cols-3 gap-4 text-sm">
            <div><dt className="text-xs text-fg-3">Limit</dt><dd className="text-lg font-semibold">{formatCents(line.limitCents)}</dd></div>
            <div><dt className="text-xs text-fg-3">Drawn (owed principal)</dt><dd className="text-lg font-semibold">{formatCents(line.drawnCents)}</dd></div>
            <div><dt className="text-xs text-fg-3">Available</dt><dd className="text-lg font-semibold">{formatCents(line.availableCents)}</dd></div>
          </dl>
          <div className="mt-3 h-2 rounded-full bg-field" aria-hidden>
            <div className="h-full rounded-full bg-green" style={{ width: `${(line.drawnCents / line.limitCents) * 100}%` }} />
          </div>
          <div className="mt-4 space-y-2 text-sm leading-6">
            <p>
              <span className="font-medium">Draws keep one month&apos;s average spending in the account</span>
              {loan.operatingReserveCents !== null && <span className="num"> ({formatCents(loan.operatingReserveCents, { whole: true })} for this borrower)</span>}. The borrower uses its
              own cash first; the line covers only the gap, based on its past year. Interest is charged only on what&apos;s drawn.{" "}
              <Illustrative why="The one-month reserve is an illustrative setting (operatingReserveMonthsOfSpending)." />
            </p>
            {loan.draws!.length > 0 ? (
              <p className="text-fg-3">
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
              <p className="text-fg-3">Nothing is drawn: the borrower&apos;s own cash covers the season.</p>
            )}
            <p className="text-fg-3">
              The rest of the limit is headroom: room to draw more after a poor harvest or a drop in prices, without asking for a new loan.
            </p>
          </div>
        </section>
      )}
      <p className="text-sm text-fg-3">
        The borrower&apos;s account is at a {loan.borrowerBank === "bank" ? "bank" : "provincially regulated credit union"}.{" "}
        <Link href={`/workbench/${loan.applicantSlug}`} className="underline underline-offset-2 hover:text-fg">Open {loan.applicantName}&apos;s application file</Link>
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="timeline" className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="timeline" className="font-semibold">Timeline</h2>
            <label className="flex items-center gap-2 text-xs text-fg-3">
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
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", bad ? "text-bad" : e.type === "cured" || e.type === "paid_off" ? "text-green-ink" : "text-fg-3")} />
                  <div className="min-w-0">
                    <p>
                      <span className="num text-xs text-fg-3">{e.date}</span>{" "}
                      {e.code ? (
                        <>
                          Debit returned: <span className="font-medium">{e.code} {RETURN_CODES[e.code].label}</span> ({e.stage === "clearing" ? "before settlement" : "after settlement"})
                        </>
                      ) : (
                        e.text
                      )}
                      {e.amountCents !== undefined && e.type !== "borrower_fee" && <span className="num text-fg-3"> · {formatCents(e.amountCents)}</span>}
                    </p>
                    {e.fee?.label && <Illustrative className="mt-1" label={e.fee.label} />}
                  </div>
                </li>
              )
            })}
            {events.length === 0 && <li className="text-sm text-fg-3">Nothing yet. Fast-forward to see collections.</li>}
          </ol>
        </section>

        <div className="space-y-6">
          {fees.length > 0 && (
            <section aria-labelledby="fees" className={card}>
              <h2 id="fees" className="font-semibold">Borrower&apos;s bank fees</h2>
              <p className="mt-1 text-sm text-fg-3">The lender charges no fee for a returned payment. This is what the borrower&apos;s own bank charged.</p>
              <ul className="mt-3 space-y-2 text-sm">
                {fees.map((f) => (
                  <li key={f.date}>
                    <span className="num font-medium">{formatCents(f.fee.feeCents)}</span> <span className="num text-xs text-fg-3">{f.date}</span>
                    {f.fee.label && <Illustrative className="ml-1.5" label={f.fee.label} />}
                    <span className="block text-fg-3">{f.fee.explanation}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {breaks.length > 0 && (
            <section aria-labelledby="recon" className={cn(card, "border-t-4 border-warn")}>
              <h2 id="recon" className="flex items-center gap-2 font-semibold">
                <AlertTriangle aria-hidden className="size-4 text-warn" />
                Reconciliation
              </h2>
              <ul className="mt-2 space-y-2 text-sm">
                {breaks.map((b) => (
                  <li key={b.kind + b.reference}>
                    <span className="font-medium">{b.kind === "returned_pad_not_applied" ? "Returned PAD not applied" : b.kind === "timing_difference" ? "Timing difference" : b.kind.replaceAll("_", " ")}</span>{" "}
                    <span className="text-xs text-fg-3">found at the {b.firstSeen} cut-off{b.resolvedBy && b.resolvedBy <= date ? `, cleared by ${b.resolvedBy}` : ", open"}</span>
                    <span className="block text-fg-3">{b.action}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="schedule" className={card}>
            <h2 id="schedule" className="font-semibold">Schedule</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {loan.schedule.slice(0, 12).map((d) => (
                <li key={d.n} className="flex justify-between gap-3 py-1.5">
                  <span className="num">{d.date}</span>
                  <span className="num">{formatCents(d.amountCents)}</span>
                </li>
              ))}
            </ul>
            {loan.schedule.length > 12 && <p className="mt-1 text-xs text-fg-3">First 12 of {loan.schedule.length} debits.</p>}
          </section>
        </div>
      </div>

      <section aria-labelledby="ledger" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ledger" className="font-semibold">Ledger (double entry)</h2>
          <p className={cn("num text-sm font-medium", debits === credits ? "text-green-ink" : "text-bad")} role="status">
            Debits {formatCents(debits)} = credits {formatCents(credits)} {debits === credits ? "✓" : "✗"}
          </p>
        </div>
        <Table dense minWidth={640} wrapperClassName="mt-3" label="Ledger entries (scrolls sideways)">
            <caption className="sr-only">Journal entries for this loan up to {date}</caption>
            <THead>
              <tr>
                <Th scope="col">Date</Th>
                <Th scope="col">Entry · account</Th>
                <Th scope="col" className="text-right">Debit</Th>
                <Th scope="col" className="text-right">Credit</Th>
                <Th scope="col" className="text-right">Owed after</Th>
              </tr>
            </THead>
            {rows.slice(-40).map(({ e, owedAfter }) => (
              <tbody key={e.id} className="border-t border-line">
                <tr>
                  <Td rowSpan={e.lines.length + 1} className="num align-top text-fg-3">{e.date}</Td>
                  <Td colSpan={3} className="font-semibold">{e.memo}</Td>
                  <Td rowSpan={e.lines.length + 1} className="num text-right align-top">{formatCents(owedAfter)}</Td>
                </tr>
                {e.lines.map((l, i) => (
                  <tr key={i} className="text-fg-3">
                    <Td className={cn("py-0.5", l.creditCents > 0 && "pl-4!")}>{accountLabel(l.account)}</Td>
                    <Td className="num text-right">{l.debitCents ? formatCents(l.debitCents) : ""}</Td>
                    <Td className="num text-right">{l.creditCents ? formatCents(l.creditCents) : ""}</Td>
                  </tr>
                ))}
              </tbody>
            ))}
          </Table>
        {rows.length > 40 && <p className="mt-2 text-xs text-fg-3">Latest 40 of {rows.length} entries shown; the totals cover all of them.</p>}
        <p className="mt-3 text-xs text-fg-3">Interest and timings are illustrative. Entries are never edited; corrections are reversing entries.</p>
      </section>
    </div>
  )
}
