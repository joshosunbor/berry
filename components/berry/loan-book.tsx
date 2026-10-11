"use client"

import Link from "next/link"
import { useClock } from "@/components/berry/clock"
import { Illustrative } from "@/components/berry/illustrative"
import { useMode } from "@/components/berry/mode-context"
import { LoanStatusChip } from "@/components/berry/loan-status"
import { PRODUCT_LABELS } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODE_META } from "@/lib/modes"
import { formatTimeToFund, RAILS } from "@/lib/servicing/funding"
import type { LoanStatus } from "@/lib/servicing/simulate"
import type { LoanSummary } from "@/lib/servicing/views"

const ORDER: LoanStatus[] = ["active", "delinquent", "hardship", "paid_off", "charged_off"]

export function LoanBook({ loans }: { loans: LoanSummary[] }) {
  const { mode } = useMode()
  const date = useClock()
  const book = loans.filter((l) => l.mode === mode)
  const snaps = book.map((l) => ({ loan: l, s: l.snapshots[date] }))
  const counts = Object.fromEntries(ORDER.map((st) => [st, snaps.filter((x) => x.s.status === st).length])) as Record<LoanStatus, number>
  const outstanding = snaps.reduce((t, x) => t + x.s.outstandingCents, 0)
  const returns = snaps.reduce((t, x) => t + x.s.returns, 0)
  const cures = book.flatMap((l) => l.cures.filter((c) => c.failedOn <= date))
  const cured = cures.filter((c) => c.curedOn && c.curedOn <= date).length

  return (
    <div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Loans">{book.length}</Tile>
        <Tile label="Outstanding">{formatCents(outstanding, { whole: true })}</Tile>
        <Tile label="Returned debits to date">{returns}</Tile>
        <Tile label="Cure rate to date">{cures.length ? `${Math.round((cured / cures.length) * 100)}% (${cured} of ${cures.length})` : "No missed payments"}</Tile>
      </dl>
      <p className="mt-3 flex flex-wrap gap-2 text-xs text-muted-ink">
        {ORDER.filter((st) => counts[st]).map((st) => (
          <span key={st} className="flex items-center gap-1.5">
            <LoanStatusChip status={st} /> {counts[st]}
          </span>
        ))}
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-rule bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">{MODE_META[mode].institution} loan book as of {date}</caption>
          <thead className="border-b border-rule text-xs text-muted-ink">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Borrower</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Funded by</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Outstanding</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Days past due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {snaps.map(({ loan, s }) => (
              <tr key={loan.id}>
                <th scope="row" className="px-4 py-2.5 font-normal">
                  <Link href={`/ops/loans/${loan.id}`} className="font-medium underline-offset-2 hover:underline">
                    {loan.applicantName}
                  </Link>
                  <span className="block text-xs text-muted-ink">{PRODUCT_LABELS[loan.product]}</span>
                </th>
                <td className="px-4 py-2.5">
                  {RAILS[loan.rail].name}
                  {loan.railLabel && <Illustrative className="ml-1.5" label={loan.railLabel} />}
                  <span className="num block text-xs text-muted-ink">in {formatTimeToFund(loan.timeToFundMinutes).toLowerCase()}</span>
                </td>
                <td className="num px-4 py-2.5 text-right">{formatCents(loan.principalCents, { whole: true })}</td>
                <td className="num px-4 py-2.5 text-right">{formatCents(s.outstandingCents)}</td>
                <td className="px-4 py-2.5">
                  <LoanStatusChip status={s.status} />
                </td>
                <td className="num px-4 py-2.5 text-right">{s.daysPastDue || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {book.length === 0 && <p className="mt-4 text-sm text-muted-ink">No loans in this book.</p>}
    </div>
  )
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-4">
      <dt className="text-xs text-muted-ink">{label}</dt>
      <dd className="num mt-1 text-lg font-semibold">{children}</dd>
    </div>
  )
}
