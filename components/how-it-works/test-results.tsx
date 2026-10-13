import { Check, X } from "lucide-react"
import report from "@/public/accuracy.json"
import { edgeCases } from "@/lib/evaluation/edge-cases"
import type { AccuracyReport } from "@/lib/evaluation/accuracy"
import { MODES, MODE_META } from "@/lib/modes"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { LenderDot } from "@/components/ui/pill"
import { Table, Td, Th, THead } from "@/components/ui/table"

const h2 = "text-[clamp(24px,2.6vw,30px)] font-bold leading-[1.15] tracking-[-0.02em]"


const r = report as AccuracyReport
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
const label = (o: string) => o.replaceAll("_", " ")

/** How it works, second tab: planted cases, expected vs actual per lender, and every miss explained. */
export function TestResults() {
  return (
    <div>
      <p id="score" className="max-w-3xl text-lg leading-8 text-fg-2">
        <span className="num font-semibold text-fg">
          {r.totals.matched} of {r.totals.decisions}
        </span>{" "}
        planted decisions match the expected outcome ({pct(r.totals.rate)}), across {r.totals.cases} cases and three lenders.
      </p>

      <Card as="section" pad="lg" aria-labelledby="what" className="mt-8 max-w-3xl">
        <h2 id="what" className="text-lg font-semibold text-fg">What the score means</h2>
        <p className="mt-2 leading-7 text-fg">
          The engine reproduces the outcomes its rules were designed for. It does not mean the rules are the right ones, or that these loans would be repaid.
        </p>
        <p className="mt-3 text-sm leading-6 text-fg-2">
          Each planted case is a synthetic applicant built to test one policy: clean approvals, clear declines, and edge cases just either side of
          each lender&apos;s thresholds. The expected outcome for every case was written from the case design and each lender&apos;s stated policy{" "}
          <em>before</em> the engine was run on it, and the engine never reads those expectations. A match shows the engine applies its stated
          policies correctly. It does not show the policies are good lending: the expectations and the engine were written by the same author, and
          real credit performance can only be measured on real outcomes.
        </p>
      </Card>

      <section aria-labelledby="debatable" className="mt-16">
        <h2 id="debatable" className={h2}>Two cases where the answer is debatable</h2>
        <p className="mt-3 max-w-3xl text-fg-2">
          Both match their expected outcome, so they count as correct above. A reasonable lender could still decide differently. The engine&apos;s answers are
          unchanged; here is the case for each side.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {edgeCases().map((c) => (
            <Card as="article" key={c.id} aria-labelledby={`edge-${c.id}`} className="min-w-0">
              <h3 id={`edge-${c.id}`} className="font-semibold text-fg">
                {c.description}
              </h3>
              <p className="mt-1 font-mono text-xs text-fg-3">
                Planted case {c.id.toUpperCase()} · {MODE_META[c.lender].institution}
              </p>
              <dl className="mt-4 space-y-3 text-sm leading-6">
                <div>
                  <dt className="font-medium text-fg">The engine&apos;s answer</dt>
                  <dd className="text-fg-2">
                    {c.engineAnswer} {c.otherLenders}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-fg">The strongest argument for a different answer</dt>
                  <dd className="text-fg-2">{c.argumentAgainst}</dd>
                </div>
                <div>
                  <dt className="font-medium text-fg">What a lender would need to see to change it</dt>
                  <dd className="text-fg-2">{c.wouldChange}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="by-mode" className="mt-16">
        <h2 id="by-mode" className={h2}>By lender</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {MODES.map((m) => {
            const s = r.byMode[m]
            const meta = MODE_META[m]
            return (
              <Card key={m} className={cn("border-t-4", meta.classes.border)}>
                <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <LenderDot mode={m} />
                  {meta.institution}
                </p>
                <p className="num mt-2 text-4xl font-semibold tracking-[-0.025em] text-fg">{pct(s.rate)}</p>
                <p className="num text-sm text-fg-3">
                  {s.matched} of {s.total} cases
                </p>
              </Card>
            )
          })}
        </div>
        <p className="num mt-4 text-sm text-fg-3">
          FINTRAC large cash checks: {r.flagChecks.matched} of {r.flagChecks.total} planted cash cases flagged as expected.
        </p>
      </section>

      <section aria-labelledby="misses" className="mt-16">
        <h2 id="misses" className={h2}>Misses</h2>
        {r.misses.length === 0 ? (
          <p className="mt-3 text-fg-2">No open misses. Every planted decision currently matches its expected outcome.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {r.misses.map((m) => (
              <Card as="li" pad="sm" key={`${m.id}-${m.mode}`}>
                <p className="font-medium text-fg">
                  {m.id.toUpperCase()} · {m.mode === "flags" ? "FINTRAC flags" : MODE_META[m.mode].institution}: expected {label(m.expected)}, got{" "}
                  {label(m.actual)}
                </p>
                <p className="mt-1 text-sm text-fg-2">{m.note ?? "Not yet explained."}</p>
              </Card>
            ))}
          </ul>
        )}

        {r.resolved.length > 0 && (
          <>
            <h3 className="mt-8 text-lg font-semibold text-fg">Found and fixed during development</h3>
            <ul className="mt-3 space-y-3">
              {r.resolved.map((m) => (
                <Card as="li" pad="sm" key={`${m.case}-${m.mode}`} className="text-sm">
                  <p className="font-medium text-fg">
                    {m.case.toUpperCase()} · {MODE_META[m.mode as keyof typeof MODE_META]?.institution ?? m.mode}: expected {label(m.expected)}, engine
                    gave {label(m.engineGave)} ({m.found})
                  </p>
                  <p className="mt-2 text-fg-2">
                    <span className="font-medium text-fg">Cause.</span> {m.cause}
                  </p>
                  <p className="mt-1 text-fg-2">
                    <span className="font-medium text-fg">Fix.</span> {m.fix}
                  </p>
                </Card>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="cases" className="mt-16">
        <h2 id="cases" className={h2}>Every case</h2>
        <Card pad="none" className="mt-5 overflow-hidden">
        <Table minWidth={720} label="Every case (scrolls sideways)" caption="Expected and actual outcome for every planted case and lender">
            <THead>
              <tr>
                <Th scope="col" className="px-4">Case</Th>
                {MODES.map((m) => (
                  <Th key={m} scope="col" className="px-4">
                    <span className="inline-flex items-center gap-2 font-semibold text-fg">
                      <LenderDot mode={m} />
                      {MODE_META[m].institution}
                    </span>
                  </Th>
                ))}
              </tr>
            </THead>
            <tbody>
              {r.cases.map((c) => (
                <tr key={c.id}>
                  <Th scope="row" className="border-line-soft px-4 font-normal">
                    <span className="font-mono text-[13px] font-medium text-fg">{c.id.toUpperCase()}</span>
                    <span className="mt-0.5 block max-w-xs text-fg-3">{c.story}</span>
                  </Th>
                  {MODES.map((m) => {
                    const res = c.modes[m]
                    return (
                      <Td key={m} className="px-4 text-fg">
                        <span className="inline-flex items-center gap-1.5">
                          {res.match ? (
                            <Check aria-label="Match" className="size-4 text-green-ink" />
                          ) : (
                            <X aria-label="Miss" className="size-4 text-bad" />
                          )}
                          <span className="capitalize">{label(res.actual.outcome)}</span>
                        </span>
                        {!res.match && <span className="block text-xs text-fg-3">expected {label(res.expected.outcome)}</span>}
                      </Td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
        </Table>
        </Card>
        <p className="mt-4 text-xs text-fg-3">
          Engine {r.engineVersion} · policy versions {MODES.map((m) => `${MODE_META[m].institution} v${r.policyVersions[m]}`).join(", ")} · synthetic
          data as of {r.dataAsOf}
        </p>
      </section>
    </div>
  )
}
