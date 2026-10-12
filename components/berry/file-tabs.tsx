"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Clock, Download, Eye, ShieldAlert, XCircle } from "lucide-react"
import { ClockControl, useClock } from "@/components/berry/clock"
import { Illustrative, Source } from "@/components/berry/illustrative"
import { LoanStatusChip } from "@/components/berry/loan-status"
import type { LoanSummary } from "@/lib/servicing/views"
import { useMode } from "@/components/berry/mode-context"
import type { AftView } from "@/lib/data"
import type { LctrReview } from "@/lib/engine/fintrac"
import type { PadPlan } from "@/lib/engine/repayment"
import { formatCents } from "@/lib/money"
import { MODE_META, type Mode } from "@/lib/modes"
import type { VerificationSummary } from "@/lib/onboarding/kyc"
import { CDIC, DEPOSIT_PROTECTION_AS_OF, LENDER_PROTECTION, PROVINCIAL_INSURERS } from "@/lib/rules/deposit-protection"
import type { FundingRail, VerificationCheck } from "@/lib/schemas"
import { formatTimeToFund, fund, FundingBlocked, RAILS, type AccountVerificationOutcome, type FundingResult, type RailInfo } from "@/lib/servicing/funding"

/** Funding is shown as sent the morning after agreements are signed (fixed, so pages are reproducible). */
const FUNDING_INITIATED_AT = "2026-10-06T10:00"
import { cn } from "@/lib/utils"
import { Button, ButtonLink } from "@/components/ui/button"
import { Card, cardVariants } from "@/components/ui/card"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Table, Td, Th, THead } from "@/components/ui/table"

const money = (c: number) => formatCents(c)
const card = cn(cardVariants({ pad: "lg" }), "min-w-0")

const KIND_LABELS: Record<VerificationCheck["kind"], string> = {
  id_document: "Identity document",
  name_dob_match: "Name and date of birth match",
  sanctions_screening: "Sanctions screening",
  pep_screening: "Politically exposed person screening",
  business_registration: "Business registration",
  beneficial_ownership: "Beneficial ownership",
}

function duration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return h ? `${h} h ${m} min` : `${m} min`
}

// ---------------------------------------------------------------------------

export function VerificationTab({ checks, summary }: { checks: VerificationCheck[]; summary: VerificationSummary }) {
  const icon = { pass: CheckCircle2, needs_review: AlertTriangle, fail: XCircle }
  const tone = { pass: "text-green-ink", needs_review: "text-warn", fail: "text-bad" }
  const label = { pass: "Passed", needs_review: "Needs review", fail: "Failed" }
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Identity and business checks</h3>
        <Illustrative label="Simulated checks" why="Simulated on synthetic data against a fictional watch list and registry. No real identity service is used." />
      </div>
      <p className="mt-2 text-sm text-fg-3">
        {summary.automated ? "Cleared automatically" : "Sent to the verification queue for a person to review"} · time to verify{" "}
        <span className="num font-medium text-fg">{duration(summary.timeToVerifyMs)}</span>
      </p>
      <ul className="mt-4 divide-y divide-line">
        {checks.map((c) => {
          const Icon = icon[c.result]
          return (
            <li key={c.id} className="flex gap-3 py-3 text-sm">
              <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone[c.result])} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{KIND_LABELS[c.kind]}</span>
                  <span className={cn("text-xs font-medium", tone[c.result])}>{label[c.result]}</span>
                </p>
                <p className="mt-0.5 text-fg-3">{c.reasons.join(" ")}</p>
                <p className="num mt-0.5 flex items-center gap-1 text-xs text-fg-3">
                  <Clock aria-hidden className="size-3" />
                  {c.automated ? "Automated" : "Manual review"} · {duration(c.durationMs ?? 0)}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function RepaymentTab({ plans }: { plans: Record<Mode, PadPlan | null> }) {
  const { mode } = useMode()
  const plan = plans[mode]
  const [all, setAll] = useState(false)
  if (!plan) return <div className={card}><p className="text-sm text-fg-3">{MODE_META[mode].institution} made no offer, so there is no repayment plan.</p></div>
  const rows = all ? plan.debits : plan.debits.slice(0, 6)
  const freq = { monthly: "Monthly", biweekly: "Every 14 days, on payday", seasonal: "Monthly, larger after peak season" }[plan.frequency]
  return (
    <div className="grid gap-4">
      <div className={card}>
        <h3 className="font-semibold">Pre-authorized debit schedule</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><dt className="text-xs text-fg-3">Frequency</dt><dd className="font-medium">{freq}</dd></div>
          <div><dt className="text-xs text-fg-3">Amount</dt><dd className="font-medium">{plan.amountType === "fixed" ? "Fixed" : "Variable"}</dd></div>
          <div><dt className="text-xs text-fg-3">Confirmation sent</dt><dd className="num font-medium">{plan.confirmationSentOn}</dd></div>
          <div><dt className="text-xs text-fg-3">First debit</dt><dd className="num font-medium">{plan.firstDebitOn}</dd></div>
        </dl>
        <Table dense minWidth={420} wrapperClassName="mt-4">
            <caption className="sr-only">Scheduled debits</caption>
            <THead>
              <tr>
                <Th scope="col">#</Th>
                <Th scope="col">Date</Th>
                <Th scope="col" className="text-right">Debit</Th>
                <Th scope="col" className="text-right">Interest</Th>
                <Th scope="col" className="text-right">Balance after</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.n}>
                  <Td className="text-fg-3">{d.n}</Td>
                  <Td>
                    {d.date}
                    {d.preNotifyBy && <span className="block text-xs text-fg-3">notice by {d.preNotifyBy}</span>}
                  </Td>
                  <Td className="text-right">{money(d.amountCents)}</Td>
                  <Td className="text-right text-fg-3">{money(d.interestCents)}</Td>
                  <Td className="text-right">{money(d.balanceAfterCents)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        {plan.debits.length > 6 && (
          <Button variant="link" size="xs" onClick={() => setAll(!all)} className="mt-2">
            {all ? "Show fewer" : `Show all ${plan.debits.length} debits`}
          </Button>
        )}
        <div className="mt-4 space-y-2 border-t border-line pt-3 text-xs text-fg-3">
          <p className="flex flex-wrap items-center gap-2">
            <Illustrative /> Rates and interest are illustrative.
          </p>
          {plan.assumptions.map((a) => (
            <p key={a}>{a}</p>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className="font-semibold">Agreement checklist (Payments Canada Rule H1)</h3>
        <ul className="mt-3 space-y-3">
          {plan.checklist.map((c) => (
            <li key={c.element} className="flex gap-2.5 text-sm">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-green-ink" />
              <div>
                <p className="font-medium">
                  {c.element} <span className="text-xs font-normal text-fg-3">· {c.reference}</span>
                </p>
                <p className={cn("mt-0.5 text-fg-3", c.element.startsWith("Recourse statement") && "italic")}>{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs">
          <Source href="https://www.payments.ca/sites/default/files/h1eng.pdf">Rule H1, Payments Canada</Source>
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function DisbursementTab({ files, verification }: { files: Record<Mode, AftView | null>; verification: AccountVerificationOutcome }) {
  const { mode } = useMode()
  const file = files[mode]
  const [raw, setRaw] = useState(false)
  const [record, setRecord] = useState(1)
  const [rail, setRail] = useState<FundingRail>("aft")
  const [confirmed, setConfirmed] = useState(false)
  if (!file) return <div className={card}><p className="text-sm text-fg-3">{MODE_META[mode].institution} made no offer, so there is nothing to fund.</p></div>
  let outcome: FundingResult | null = null
  let blocked: string | null = null
  try {
    outcome = fund({ loanId: `loan_${mode}`, amountCents: file.totalCents, rail, initiatedAt: FUNDING_INITIATED_AT, verification, confirmedWithBorrower: confirmed })
  } catch (e) {
    if (e instanceof FundingBlocked) blocked = e.message
    else throw e
  }
  const info = RAILS[rail]
  const r = file.records[record]
  const railPicker = (
    <div className={card}>
      <h3 className="font-semibold">How to send the money</h3>
      <div role="radiogroup" aria-label="Funding rail" className="mt-3 grid gap-2 sm:grid-cols-3">
        {(Object.values(RAILS) as RailInfo[]).map((x) => (
          <button
            key={x.rail}
            type="button"
            role="radio"
            aria-checked={rail === x.rail}
            onClick={() => (setRail(x.rail), setConfirmed(false))}
            className={cn("rounded-[10px] border p-3 text-left text-sm", rail === x.rail ? "border-fg bg-field" : "border-line hover:border-line-strong")}
          >
            <span className="block font-medium">{x.name}</span>
            {x.badge && <span className="mt-1 block"><Illustrative label={x.badge} /></span>}
            <span className="mt-1 block text-xs text-fg-3">{x.timing}</span>
          </button>
        ))}
      </div>
      {info.badge && (
        <p className="mt-3 text-sm text-fg-3">
          Payments Canada&apos;s Real-Time Rail is launching in phases from Q4 2026; lenders cannot fund on it today, so this is a simulation.
        </p>
      )}
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-fg-3">Can it be reversed?</dt><dd>{info.reversibility}</dd></div>
        <div><dt className="text-xs text-fg-3">Fraud considerations</dt><dd>{info.fraud}</dd></div>
      </dl>

      {info.instant && (
        <div className={cn("mt-4 rounded-[10px] border p-3 text-sm", verification.result === "match" ? "border-line" : verification.result === "close_match" ? "bg-warn-tint" : "bg-bad-tint")}>
          <p className="flex flex-wrap items-center gap-2 font-medium">
            Account verification: {verification.result === "match" ? "match" : verification.result === "close_match" ? "close match" : "no match"}
            <Illustrative label="Simulated" why="A simulated name-and-account check. No real verification service is used." />
          </p>
          <p className="mt-1">{verification.message}</p>
          <p className="mt-2 text-fg-3">{verification.scamWarning}</p>
          {verification.canFund === "after_confirming" && (
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="size-4" />
              I&apos;ve confirmed the account with the borrower
            </label>
          )}
        </div>
      )}

      {blocked ? (
        <p className="mt-4 rounded-[10px] bg-field px-3 py-2 text-sm" role="status">{blocked}</p>
      ) : outcome && (
        <dl className="num mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-[10px] bg-field px-3 py-3 text-sm sm:grid-cols-4" role="status">
          <div><dt className="text-xs text-fg-3">Sent</dt><dd>{outcome.initiatedAt.replace("T", " ")}</dd></div>
          <div><dt className="text-xs text-fg-3">Available</dt><dd>{outcome.completedAt.slice(0, 16).replace("T", " ")}</dd></div>
          <div><dt className="text-xs text-fg-3">Time to fund</dt><dd>{formatTimeToFund(outcome.timeToFundMinutes)}</dd></div>
          <div><dt className="text-xs text-fg-3">Cost (illustrative)</dt><dd>{formatCents(outcome.costCents)}</dd></div>
        </dl>
      )}
    </div>
  )
  if (rail !== "aft") return railPicker
  const download = () => {
    const url = URL.createObjectURL(new Blob([file.text], { type: "text/plain" }))
    const a = document.createElement("a")
    a.href = url
    a.download = file.fileName
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="space-y-4">
    {railPicker}
    <div className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">AFT disbursement file</h3>
          <p className="mt-1 text-sm text-fg-3">
            Funds <span className="num font-medium text-fg">{formatCents(file.totalCents)}</span> to the borrower&apos;s account in a Payments Canada Standard 005 layout: a header, one credit record and a trailer, each 1,464 characters.
          </p>
        </div>
        <Illustrative label="Illustrative — not for submission" why="ASCII rather than the EBCDIC real files use; fictional institutions and accounts; amounts in cents and the transaction code are not confirmed from the standard." />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <SegmentedControl
          kind="radio"
          size="sm"
          label="Record"
          value={String(record)}
          onChange={(v) => setRecord(Number(v))}
          options={file.records.map((rec, i) => ({ value: String(i), label: `${rec.type} ${rec.type === "A" ? "header" : rec.type === "C" ? "credit" : "trailer"}` }))}
        />
        <Button variant="secondary" size="xs" onClick={() => setRaw(!raw)} aria-pressed={raw}>
          <Eye aria-hidden className="size-4" />
          {raw ? "Hide raw file" : "View raw file"}
        </Button>
        <Button variant="secondary" size="xs" onClick={download}>
          <Download aria-hidden className="size-4" />
          Download
        </Button>
      </div>

      {raw && (
        <pre className="mt-4 max-h-56 overflow-auto rounded-[10px] bg-field p-3 font-mono text-[11px] leading-5" aria-label="Raw file, one record per line">
          {file.records.map((rec) => rec.text.replace(/ +$/, (m) => `·×${m.length}`)).join("\n")}
        </pre>
      )}
      {raw && <p className="mt-1 text-xs text-fg-3">Trailing spaces are shortened to ·×count for display; the download has every character.</p>}

      <Table dense minWidth={560} wrapperClassName="mt-4">
          <caption className="sr-only">Fields in the {r.type} record</caption>
          <THead>
            <tr>
              <Th scope="col">Field</Th>
              <Th scope="col">Positions</Th>
              <Th scope="col">Value</Th>
              <Th scope="col">What it means</Th>
            </tr>
          </THead>
          <tbody>
            {r.fields.map((f) => (
              <tr key={f.name + f.start} className="align-top">
                <Th scope="row">{f.name}</Th>
                <Td className="num text-fg-3">{f.start}–{f.start + f.length - 1}</Td>
                <Td className="font-mono text-xs">{f.value.trim() === "" ? <span className="text-fg-3">spaces</span> : f.value.length > 24 ? `${f.value.slice(0, 24)}…` : f.value}</Td>
                <Td className="text-fg-3">
                  {f.description}
                  {f.illustrative && (
                    <span className="mt-1 flex items-center gap-1.5">
                      <Illustrative />
                      <span className="text-xs">{f.illustrative}</span>
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      <p className="mt-4 text-xs">
        <Source href="https://www.payments.ca/sites/default/files/standard005eng.pdf">Standard 005, Payments Canada</Source>
      </p>
    </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function ProtectionTab() {
  const { mode } = useMode()
  return (
    <div className={card}>
      <h3 className="font-semibold">Who protects deposits</h3>
      <p className="mt-2 text-sm leading-6">{LENDER_PROTECTION[mode]}</p>
      <p className="mt-2 text-sm text-fg-3">
        Banks and federally regulated credit unions are CDIC members: {CDIC.limit}. <Source href={CDIC.source}>CDIC</Source>
      </p>
      <h4 className="mt-5 text-sm font-semibold">Provincially regulated credit unions, by province</h4>
      <Table dense minWidth={560} wrapperClassName="mt-2">
          <caption className="sr-only">Credit union deposit insurer and coverage by province</caption>
          <THead>
            <tr>
              <Th scope="col">Province</Th>
              <Th scope="col">Insurer</Th>
              <Th scope="col">Coverage</Th>
            </tr>
          </THead>
          <tbody>
            {PROVINCIAL_INSURERS.map((p) => (
              <tr key={p.province} className="align-top">
                <Th scope="row">{p.province}</Th>
                <Td className="text-fg-3">
                  <a href={p.source} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-fg">{p.insurer}</a>
                </Td>
                <Td>
                  {p.limit}
                  {p.registered && <span className="block text-xs text-fg-3">{p.registered}</span>}
                  {!p.confirmed && (
                    <span className="mt-1 flex items-center gap-1.5">
                      <Illustrative why={p.note} />
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      <p className="mt-3 text-xs text-fg-3">Limits checked against each insurer&apos;s site on {DEPOSIT_PROTECTION_AS_OF}. Coverage rules have details (for example, registered plans); the insurer&apos;s site is the authority.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function LargeCashTab({ reviews }: { reviews: LctrReview[] }) {
  return (
    <div className="space-y-4">
      {reviews.map((r) => (
        <div key={r.deposits[0].transactionId} className={card}>
          <h3 className="flex items-center gap-2 font-semibold">
            <ShieldAlert aria-hidden className="size-4 text-warn" />
            FINTRAC large cash review
          </h3>
          <p className="mt-2 text-sm leading-6">{r.reason}</p>

          <Table dense minWidth={480} wrapperClassName="mt-4">
              <caption className="sr-only">Cash deposits in the 24-hour window</caption>
              <THead>
                <tr>
                  <Th scope="col">Deposit</Th>
                  <Th scope="col">Time</Th>
                  <Th scope="col" className="text-right">Amount</Th>
                  <Th scope="col" className="text-right">24-hour total</Th>
                </tr>
              </THead>
              <tbody>
                {r.deposits.map((d, i) => (
                  <tr key={d.transactionId}>
                    <Td>Cash deposit {i + 1}</Td>
                    <Td className="num text-fg-3">
                      {d.timestamp.slice(0, 10)} {d.timestamp.slice(11, 16)} {i > 0 && <span className="text-xs">(+{d.hoursFromFirst} h)</span>}
                    </Td>
                    <Td className="num text-right">{money(d.amountCents)}</Td>
                    <Td className={cn("num text-right font-semibold", d.runningTotalCents >= r.thresholdCents && "text-warn")}>{money(d.runningTotalCents)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>

          <div className="mt-3" aria-hidden>
            <div className="relative h-2 rounded-full bg-field">
              <div className="absolute inset-y-0 left-0 rounded-full bg-warn" style={{ width: `${Math.min(100, (r.totalCents / (r.thresholdCents * 1.25)) * 100)}%` }} />
              <div className="absolute -top-1 h-4 w-0.5 bg-fg" style={{ left: `${100 / 1.25}%` }} />
            </div>
          </div>
          <p className="num mt-1.5 text-xs text-fg-3">
            Threshold {money(r.thresholdCents)} in one transaction or within 24 consecutive hours · total {money(r.totalCents)}
          </p>
          <p className="mt-3 text-sm">
            <span className="font-medium">Credit decision:</span> <span className="text-fg-3">unaffected. This is a compliance review, never a credit factor.</span>
          </p>

          <Card tone="dashed" pad="sm" className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Report summary</h4>
              <Illustrative label={r.reportSummary.label} why="A simulated summary of what a Large Cash Transaction Report would contain. Nothing is filed." />
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-fg-3">Report type</dt><dd>{r.reportSummary.reportType}</dd></div>
              <div><dt className="text-xs text-fg-3">Reporting entity</dt><dd>{r.reportSummary.reportingEntity}</dd></div>
              <div><dt className="text-xs text-fg-3">Cash received from</dt><dd>{r.reportSummary.onBehalfOf}</dd></div>
              <div><dt className="text-xs text-fg-3">Method</dt><dd>{r.reportSummary.method}</dd></div>
              <div><dt className="text-xs text-fg-3">Deposits</dt><dd className="num">{r.reportSummary.numberOfDeposits} · {money(r.reportSummary.totalCents)}</dd></div>
              <div><dt className="text-xs text-fg-3">Report due by</dt><dd className="num">{r.reportSummary.reportDueBy} (15 calendar days)</dd></div>
            </dl>
            <p className="mt-3 text-xs">
              <Source href={r.reportSummary.source}>FINTRAC large cash transaction reporting guidance</Source>
            </p>
          </Card>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function ServicingTab({ loans }: { loans: LoanSummary[] }) {
  const { mode } = useMode()
  const date = useClock()
  const loan = loans.find((l) => l.mode === mode)
  if (!loan) {
    return (
      <div className={card}>
        <p className="text-sm text-fg-3">{MODE_META[mode].institution} made no offer, so there is no loan to service.</p>
      </div>
    )
  }
  const s = loan.snapshots[date]
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Servicing at {MODE_META[mode].institution}</h3>
        <Illustrative label="Simulated" why="Collections, returns and recovery are simulated from funding to the end of December 2027 on synthetic data." />
      </div>
      <ClockControl className="mt-3" />
      <dl className="num mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-fg-3">Status</dt><dd className="mt-1"><LoanStatusChip status={s.status} /></dd></div>
        <div><dt className="text-xs text-fg-3">Owed</dt><dd className="font-medium">{formatCents(s.outstandingCents)}</dd></div>
        <div><dt className="text-xs text-fg-3">Debits collected</dt><dd className="font-medium">{s.debitsCollected}</dd></div>
        <div><dt className="text-xs text-fg-3">Returned debits</dt><dd className="font-medium">{s.returns}</dd></div>
      </dl>
      <ButtonLink href={`/ops/loans/${loan.id}`} size="sm" className="mt-5">
        Open the loan: ledger, timeline and recovery
      </ButtonLink>
    </div>
  )
}
