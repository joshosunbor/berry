import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ShieldAlert, UserCheck } from "lucide-react"
import { ModeChip } from "@/components/berry/mode-chip"
import { OutcomeChip, outcomeLabel } from "@/components/berry/outcome-chip"
import { getApplicant, getCast } from "@/lib/data"
import { PRODUCT_LABELS, STRUCTURE_LABELS, pctFromBps } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODES, MODE_META } from "@/lib/modes"
import type { Decision } from "@/lib/schemas"
import { cn } from "@/lib/utils"

export function generateStaticParams() {
  return getCast().map((c) => ({ id: c.applicant.slug }))
}

export async function generateMetadata({ params }: PageProps<"/compare/[id]">): Promise<Metadata> {
  const { id } = await params
  const view = getApplicant(id)
  return view ? { title: `${view.applicant.displayName}: three lenders · Berry`, description: view.applicant.story } : {}
}

const approved = (d: Decision) => d.outcome === "approve" || d.outcome === "approve_with_conditions"
const amount = (d: Decision) => (approved(d) ? formatCents(d.limitCents, { whole: true }) : "None")
const structure = (d: Decision) => (approved(d) && d.structure ? STRUCTURE_LABELS[d.structure].split(":")[0] : "None")
const product = (d: Decision) => (approved(d) ? PRODUCT_LABELS[d.product] : "None")

export default async function ComparePage({ params }: PageProps<"/compare/[id]">) {
  const { id } = await params
  const view = getApplicant(id)
  if (!view) notFound()
  const { applicant: a, decisions } = view
  const ds = MODES.map((m) => decisions[m])

  const rows = [
    { label: "Outcome", values: ds.map((d) => outcomeLabel(d.outcome)) },
    { label: "Amount", values: ds.map(amount) },
    { label: "Product", values: ds.map(product) },
    { label: "Structure", values: ds.map(structure) },
  ]
  const differing = rows.filter((r) => new Set(r.values).size > 1)
  const sameFlags = ds[0].flags

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8 sm:py-10">
      <Link href={`/workbench/${a.slug}`} className="inline-flex items-center gap-1 text-sm text-muted-ink hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        {a.displayName}&apos;s file
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        {a.displayName}: one applicant, three lenders
      </h1>
      <p className="mt-2 max-w-3xl text-muted-ink">
        {a.story} Asking for a {PRODUCT_LABELS[a.request.product].toLowerCase()} of{" "}
        <span className="num text-ink">{formatCents(a.request.amountCents, { whole: true })}</span>.
      </p>

      {differing.length > 0 && (
        <section aria-labelledby="differ" className="mt-8 rounded-lg border border-rule bg-surface">
          <h2 id="differ" className="px-5 pt-4 text-sm font-semibold">
            Where they differ
          </h2>
          {/* Phones: one short list per item. Larger screens: a table. */}
          <dl className="divide-y divide-rule px-5 pb-2 text-sm sm:hidden">
            {differing.map((r) => (
              <div key={r.label} className="py-2.5">
                <dt className="text-muted-ink">{r.label}</dt>
                <dd className="mt-1 space-y-0.5">
                  {r.values.map((v, i) => (
                    <p key={MODES[i]} className="flex justify-between gap-3">
                      <span className={MODE_META[MODES[i]].classes.fg}>{MODE_META[MODES[i]].institution}</span>
                      <span className="num text-right font-medium">{v}</span>
                    </p>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <table className="mt-2 hidden w-full text-left text-sm sm:table">
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className="px-5 py-2 font-medium text-muted-ink">
                  <span className="sr-only">Item</span>
                </th>
                {MODES.map((m) => (
                  <th key={m} scope="col" className={cn("px-5 py-2 font-medium", MODE_META[m].classes.fg)}>
                    {MODE_META[m].institution}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {differing.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="px-5 py-2.5 font-normal text-muted-ink">
                    {r.label}
                  </th>
                  {r.values.map((v, i) => (
                    <td key={MODES[i]} className="num px-5 py-2.5 font-medium">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="mt-8 grid gap-x-5 gap-y-0 lg:grid-cols-3">
        {MODES.map((m) => {
          const d = decisions[m]
          const meta = MODE_META[m]
          return (
            <article
              key={m}
              aria-label={`${meta.institution} decision`}
              className={cn("row-span-5 mb-5 grid grid-rows-subgrid gap-y-0 rounded-lg border-t-4 bg-surface shadow-soft lg:mb-0", meta.classes.border)}
            >
              <header className="px-5 pt-5">
                <ModeChip mode={m} />
                <p className="mt-1.5 text-xs text-muted-ink">{meta.style}</p>
              </header>

              <div className="px-5 pt-4">
                <OutcomeChip outcome={d.outcome} className="text-sm" />
                <p className="num mt-2 text-3xl font-semibold tracking-tight">{approved(d) ? formatCents(d.limitCents, { whole: true }) : "No offer"}</p>
                {approved(d) && (
                  <p className="mt-1 text-sm text-muted-ink">
                    {PRODUCT_LABELS[d.product]}
                    {d.structure ? ` · ${STRUCTURE_LABELS[d.structure].split(":")[0].toLowerCase()}` : ""}
                    {d.aprBps !== null ? ` · ${pctFromBps(d.aprBps)} illustrative` : ""}
                  </p>
                )}
              </div>

              <div className="px-5 pt-4">
                {d.approver ? (
                  <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                    <UserCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-ink" />
                    <span>
                      Sign-off: <span className="font-medium">{d.approver.title}</span>
                    </span>
                  </p>
                ) : (
                  <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-ink">{m === "fintech" ? "Decided automatically, instantly" : "Decided against fixed policy"}</p>
                )}
              </div>

              <div className="px-5 pt-5">
                <h2 className="text-sm font-semibold">Why</h2>
                <ul className="mt-2 space-y-2">
                  {d.reasons.slice(0, 3).map((r) => (
                    <li key={r.code} className="flex gap-2.5 text-sm leading-6">
                      <span
                        aria-hidden
                        className={cn("mt-2 size-1.5 shrink-0 rounded-full", r.direction === "positive" ? "bg-approve" : r.direction === "negative" ? "bg-decline" : "bg-refer")}
                      />
                      <span>{r.customerText}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="px-5 pb-5 pt-5">
                {d.counterfactuals.length > 0 ? (
                  <>
                    <h2 className="text-sm font-semibold">What would change this</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-ink">{d.counterfactuals[0]}</p>
                  </>
                ) : d.conditions?.length ? (
                  <>
                    <h2 className="text-sm font-semibold">Conditions</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-ink">{d.conditions[0]}</p>
                  </>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      {sameFlags.map((f) => (
        <p key={f.transactionIds.join()} className="mt-6 flex gap-2 rounded-md border border-conditions/40 bg-conditions-soft p-3 text-sm">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-conditions" />
          <span>
            <span className="font-medium">Same for every lender: FINTRAC review. </span>
            {f.summary}
          </span>
        </p>
      ))}

      <p className="mt-8 text-xs text-muted-ink">
        Fictional institutions, synthetic data. Rates, limits and authority tiers are illustrative. Decisions are made by deterministic rules; see{" "}
        <Link href="/accuracy" className="underline">
          published test results
        </Link>
        .
      </p>
    </main>
  )
}
