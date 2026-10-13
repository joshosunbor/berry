"use client"

import Link from "next/link"
import { useClock } from "@/components/berry/clock"
import { Illustrative } from "@/components/berry/illustrative"
import { useMode } from "@/components/berry/mode-context"
import { LoanStatusChip } from "@/components/berry/loan-status"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { StatTile } from "@/components/ui/stat-tile"
import { Table, Td, Th, THead } from "@/components/ui/table"
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
        <StatTile term size="md" label="Loans" value={book.length} />
        <StatTile term size="md" label="Outstanding" value={formatCents(outstanding, { whole: true })} />
        <StatTile term size="md" label="Returned debits to date" value={returns} />
        <StatTile term size="md" label="Cure rate to date" value={cures.length ? `${Math.round((cured / cures.length) * 100)}% (${cured} of ${cures.length})` : "No missed payments"} />
      </dl>
      <p className="mt-3 flex flex-wrap gap-2 text-xs text-fg-3">
        {ORDER.filter((st) => counts[st]).map((st) => (
          <span key={st} className="flex items-center gap-1.5">
            <LoanStatusChip status={st} /> {counts[st]}
          </span>
        ))}
      </p>

      <Card pad="none" className="mt-6 overflow-hidden">
        <Table minWidth={760} caption={`${MODE_META[mode].institution} loan book as of ${date}`}>
          <THead>
            <tr>
              <Th scope="col">Borrower</Th>
              <Th scope="col">Funded by</Th>
              <Th scope="col" className="text-right">Amount</Th>
              <Th scope="col" className="text-right">Outstanding</Th>
              <Th scope="col">Status</Th>
              <Th scope="col" className="text-right">Days past due</Th>
            </tr>
          </THead>
          <tbody>
            {snaps.map(({ loan, s }) => (
              <tr key={loan.id}>
                <Th scope="row" className="border-line-soft bg-panel font-normal">
                  <Link href={`/loans/${loan.id}`} className="font-semibold text-fg underline-offset-2 hover:underline">
                    {loan.applicantName}
                  </Link>
                  <span className="block text-xs text-fg-3">{PRODUCT_LABELS[loan.product]}</span>
                </Th>
                <Td>
                  {RAILS[loan.rail].name}
                  {loan.railLabel && <Illustrative className="ml-1.5" label={loan.railLabel} />}
                  <span className="num block text-xs text-fg-3">in {formatTimeToFund(loan.timeToFundMinutes).toLowerCase()}</span>
                </Td>
                <Td numeric>{formatCents(loan.principalCents, { whole: true })}</Td>
                <Td numeric>{formatCents(s.outstandingCents)}</Td>
                <Td>
                  <LoanStatusChip status={s.status} />
                </Td>
                <Td numeric>{s.daysPastDue || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {book.length === 0 && <EmptyState title="No loans in this book." className="mt-4" />}
    </div>
  )
}
