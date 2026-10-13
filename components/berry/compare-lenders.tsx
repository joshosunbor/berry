import Link from "next/link"
import { ShieldAlert, UserCheck } from "lucide-react"
import { ModeChip } from "@/components/berry/mode-chip"
import { OutcomeChip, outcomeLabel } from "@/components/berry/outcome-chip"
import type { ApplicantView } from "@/lib/data"
import { PRODUCT_LABELS, STRUCTURE_LABELS, pctFromBps } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODES, MODE_META } from "@/lib/modes"
import type { Decision } from "@/lib/schemas"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { LenderDot } from "@/components/ui/pill"
import { Table, Td, Th, THead } from "@/components/ui/table"

const approved = (d: Decision) => d.outcome === "approve" || d.outcome === "approve_with_conditions"
const amount = (d: Decision) => (approved(d) ? formatCents(d.limitCents, { whole: true }) : "None")
const structure = (d: Decision) => (approved(d) && d.structure ? STRUCTURE_LABELS[d.structure].split(":")[0] : "None")
const product = (d: Decision) => (approved(d) ? PRODUCT_LABELS[d.product] : "None")

/**
 * The applicant file's "Compare lenders" tab: the same file under all three
 * rulebooks side by side, with the differences first.
 */
export function CompareLenders({ view }: { view: ApplicantView }) {
  const { decisions } = view
  const ds = MODES.map((m) => decisions[m])

  const rows = [
    { label: "Outcome", values: ds.map((d) => outcomeLabel(d.outcome)) },
    { label: "Amount", values: ds.map(amount) },
    { label: "Product", values: ds.map(product) },
    { label: "Structure", values: ds.map(structure) },
  ]
  const differing = rows.filter((r) => new Set(r.values).size > 1)
  const reporting = MODES.find((m, i) => ds[i].flags.length > 0)
  const flags = reporting ? ds[MODES.indexOf(reporting)].flags : []

  return (
    <div data-tour="compare">
      <h2 className="text-xl font-semibold tracking-[-0.01em]">One applicant, three lenders</h2>
      <p className="mt-1 mb-5 text-sm text-fg-2">The data going in is identical. Shaded rows are where the lenders disagree.</p>

      {differing.length > 0 && (
        <Card as="section" aria-labelledby="differ" pad="none" className="overflow-hidden">
          <h2 id="differ" className="px-6 pt-5 text-sm font-semibold">
            Where they differ
          </h2>
          {/* Phones: one short list per item. Larger screens: a table. */}
          <dl className="divide-y divide-line px-6 pb-2 text-sm sm:hidden">
            {differing.map((r) => (
              <div key={r.label} className="py-2.5">
                <dt className="text-fg-3">{r.label}</dt>
                <dd className="mt-1 space-y-0.5">
                  {r.values.map((v, i) => (
                    <p key={MODES[i]} className="flex justify-between gap-3">
                      <span className="flex items-center gap-2 text-fg-2">
                        <LenderDot mode={MODES[i]} className="size-2" />
                        {MODE_META[MODES[i]].institution}
                      </span>
                      <span className="num text-right font-medium">{v}</span>
                    </p>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 hidden sm:block">
            <Table caption="Where the three lenders differ">
              <THead>
                <tr>
                  <Th scope="col">
                    <span className="sr-only">Item</span>
                  </Th>
                  {MODES.map((m) => (
                    <Th key={m} scope="col" className="text-fg">
                      <span className="inline-flex items-center gap-2 font-semibold">
                        <LenderDot mode={m} className="size-[9px]" />
                        {MODE_META[m].institution}
                      </span>
                    </Th>
                  ))}
                </tr>
              </THead>
              <tbody>
                {differing.map((r) => (
                  <tr key={r.label}>
                    <Th scope="row" className="bg-panel font-medium text-fg-3">
                      {r.label}
                    </Th>
                    {r.values.map((v, i) => (
                      <Td key={MODES[i]} className="num border-line bg-cyan-tint-2 py-3.5 font-semibold">
                        {v}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      <div className="mt-8 grid gap-x-5 gap-y-0 lg:grid-cols-3">
        {MODES.map((m) => {
          const d = decisions[m]
          const meta = MODE_META[m]
          return (
            <Card
              as="article"
              key={m}
              aria-label={`${meta.institution} decision`}
              pad="none"
              className={cn("row-span-5 mb-5 grid grid-rows-subgrid gap-y-0 border-t-4 lg:mb-0", meta.classes.border)}
            >
              <header className="px-6 pt-6">
                <ModeChip mode={m} />
                <p className="mt-1.5 text-xs text-fg-3">{meta.style}</p>
              </header>

              <div className="px-6 pt-4">
                <OutcomeChip outcome={d.outcome} className="text-sm" />
                <p className={cn("num mt-2 text-4xl font-semibold leading-[1.1] tracking-[-0.025em]", approved(d) ? "text-green-ink" : "text-fg")}>{approved(d) ? formatCents(d.limitCents, { whole: true }) : "No offer"}</p>
                {approved(d) && (
                  <p className="mt-1 text-sm text-fg-3">
                    {PRODUCT_LABELS[d.product]}
                    {d.structure ? ` · ${STRUCTURE_LABELS[d.structure].split(":")[0].toLowerCase()}` : ""}
                    {d.aprBps !== null ? ` · ${pctFromBps(d.aprBps)} illustrative` : ""}
                  </p>
                )}
              </div>

              <div className="px-6 pt-4">
                {d.approver ? (
                  <p className="flex items-start gap-2 rounded-[10px] bg-field px-3 py-2 text-sm">
                    <UserCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-3" />
                    <span>
                      Sign-off: <span className="font-medium">{d.approver.title}</span>
                    </span>
                  </p>
                ) : (
                  <p className="rounded-[10px] bg-field px-3 py-2 text-sm text-fg-3">{m === "fintech" ? "Decided automatically, instantly" : "Decided against fixed policy"}</p>
                )}
              </div>

              <div className="px-6 pt-5">
                <h2 className="text-sm font-semibold">Why</h2>
                <ul className="mt-2 space-y-2">
                  {d.reasons.slice(0, 3).map((r) => (
                    <li key={r.code} className="flex gap-2.5 text-sm leading-6">
                      <span
                        aria-hidden
                        className={cn("mt-2 size-1.5 shrink-0 rounded-full", r.direction === "positive" ? "bg-green-ink" : r.direction === "negative" ? "bg-bad" : "bg-fg-3")}
                      />
                      <span>{r.customerText}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="px-6 pb-6 pt-5">
                {d.counterfactuals.length > 0 ? (
                  <>
                    <h2 className="text-sm font-semibold">What would change this</h2>
                    <p className="mt-2 text-sm leading-6 text-fg-3">{d.counterfactuals[0]}</p>
                  </>
                ) : d.conditions?.length ? (
                  <>
                    <h2 className="text-sm font-semibold">Conditions</h2>
                    <p className="mt-2 text-sm leading-6 text-fg-3">{d.conditions[0]}</p>
                  </>
                ) : null}
              </div>
            </Card>
          )
        })}
      </div>

      {flags.map((f) => (
        <p key={f.transactionIds.join()} className="mt-6 flex gap-2 rounded-[10px] bg-warn-tint p-3 text-sm">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            <span className="font-medium">FINTRAC review at {MODE_META[reporting!].institution}, which received the cash. It plays no part in any lender’s credit decision. </span>
            {f.summary}
          </span>
        </p>
      ))}

      <p className="mt-8 text-xs text-fg-3">
        Fictional institutions, synthetic data. Rates, limits and authority tiers are illustrative. Decisions are made by deterministic rules; see{" "}
        <Link href="/how-it-works?tab=test-results" className="underline">
          published test results
        </Link>
        .
      </p>
    </div>
  )
}
