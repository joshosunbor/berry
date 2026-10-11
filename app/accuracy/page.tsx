import type { Metadata } from "next"
import { Check, X } from "lucide-react"
import report from "@/public/accuracy.json"
import { edgeCases } from "@/lib/evaluation/edge-cases"
import type { AccuracyReport } from "@/lib/evaluation/accuracy"
import { MODES, MODE_META } from "@/lib/modes"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Accuracy · Berry",
  description: "How Berry's decisions compare with expected outcomes on planted test cases.",
}

const r = report as AccuracyReport
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
const label = (o: string) => o.replaceAll("_", " ")

export default function AccuracyPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-12 sm:px-8 sm:py-16">
      <p className="text-sm font-medium text-muted-ink">Published test results</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Accuracy</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-ink">
        <span className="num font-semibold text-ink">
          {r.totals.matched} of {r.totals.decisions}
        </span>{" "}
        planted decisions match the expected outcome ({pct(r.totals.rate)}), across {r.totals.cases} cases and three lenders.
      </p>

      <section aria-labelledby="what" className="mt-8 max-w-3xl rounded-lg border border-rule bg-surface p-6">
        <h2 id="what" className="font-semibold">What the score means</h2>
        <p className="mt-2 leading-7">
          The engine reproduces the outcomes its rules were designed for. It does not mean the rules are the right ones, or that these loans would be repaid.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-ink">
          Each planted case is a synthetic applicant built to test one policy: clean approvals, clear declines, and edge cases just either side of
          each lender&apos;s thresholds. The expected outcome for every case was written from the case design and each lender&apos;s stated policy{" "}
          <em>before</em> the engine was run on it, and the engine never reads those expectations. A match shows the engine applies its stated
          policies correctly. It does not show the policies are good lending: the expectations and the engine were written by the same author, and
          real credit performance can only be measured on real outcomes.
        </p>
      </section>

      <section aria-labelledby="debatable" className="mt-12">
        <h2 id="debatable" className="text-xl font-semibold">Two cases where the answer is debatable</h2>
        <p className="mt-2 max-w-3xl text-muted-ink">
          Both match their expected outcome, so they count as correct above. A reasonable lender could still decide differently. The engine&apos;s answers are
          unchanged; here is the case for each side.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {edgeCases().map((c) => (
            <article key={c.id} aria-labelledby={`edge-${c.id}`} className="min-w-0 rounded-lg border border-rule bg-surface p-5">
              <h3 id={`edge-${c.id}`} className="font-semibold">
                {c.description}
              </h3>
              <p className="mt-1 text-xs text-muted-ink">
                Planted case {c.id.toUpperCase()} · {MODE_META[c.lender].institution}
              </p>
              <dl className="mt-4 space-y-3 text-sm leading-6">
                <div>
                  <dt className="font-medium">The engine&apos;s answer</dt>
                  <dd className="text-muted-ink">
                    {c.engineAnswer} {c.otherLenders}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">The strongest argument for a different answer</dt>
                  <dd className="text-muted-ink">{c.argumentAgainst}</dd>
                </div>
                <div>
                  <dt className="font-medium">What a lender would need to see to change it</dt>
                  <dd className="text-muted-ink">{c.wouldChange}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="by-mode" className="mt-12">
        <h2 id="by-mode" className="text-xl font-semibold">By lender</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {MODES.map((m) => {
            const s = r.byMode[m]
            const meta = MODE_META[m]
            return (
              <div key={m} className={cn("rounded-lg border-t-4 bg-surface p-5 shadow-soft", meta.classes.border)}>
                <p className={cn("text-sm font-medium", meta.classes.fg)}>{meta.institution}</p>
                <p className="num mt-2 text-3xl font-semibold">{pct(s.rate)}</p>
                <p className="num text-sm text-muted-ink">
                  {s.matched} of {s.total} cases
                </p>
              </div>
            )
          })}
        </div>
        <p className="num mt-4 text-sm text-muted-ink">
          FINTRAC large cash checks: {r.flagChecks.matched} of {r.flagChecks.total} planted cash cases flagged as expected.
        </p>
      </section>

      <section aria-labelledby="misses" className="mt-12">
        <h2 id="misses" className="text-xl font-semibold">Misses</h2>
        {r.misses.length === 0 ? (
          <p className="mt-2 text-muted-ink">No open misses. Every planted decision currently matches its expected outcome.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {r.misses.map((m) => (
              <li key={`${m.id}-${m.mode}`} className="rounded-lg border border-rule bg-surface p-4">
                <p className="font-medium">
                  {m.id.toUpperCase()} · {m.mode === "flags" ? "FINTRAC flags" : MODE_META[m.mode].institution}: expected {label(m.expected)}, got{" "}
                  {label(m.actual)}
                </p>
                <p className="mt-1 text-sm text-muted-ink">{m.note ?? "Not yet explained."}</p>
              </li>
            ))}
          </ul>
        )}

        {r.resolved.length > 0 && (
          <>
            <h3 className="mt-8 font-semibold">Found and fixed during development</h3>
            <ul className="mt-3 space-y-3">
              {r.resolved.map((m) => (
                <li key={`${m.case}-${m.mode}`} className="rounded-lg border border-rule bg-surface p-4 text-sm">
                  <p className="font-medium text-ink">
                    {m.case.toUpperCase()} · {MODE_META[m.mode as keyof typeof MODE_META]?.institution ?? m.mode}: expected {label(m.expected)}, engine
                    gave {label(m.engineGave)} ({m.found})
                  </p>
                  <p className="mt-2 text-muted-ink">
                    <span className="font-medium text-ink">Cause.</span> {m.cause}
                  </p>
                  <p className="mt-1 text-muted-ink">
                    <span className="font-medium text-ink">Fix.</span> {m.fix}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="cases" className="mt-12">
        <h2 id="cases" className="text-xl font-semibold">Every case</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-rule bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Expected and actual outcome for every planted case and lender</caption>
            <thead className="border-b border-rule text-muted-ink">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Case</th>
                {MODES.map((m) => (
                  <th key={m} scope="col" className="px-4 py-3 font-medium">
                    {MODE_META[m].institution}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {r.cases.map((c) => (
                <tr key={c.id} className="align-top">
                  <th scope="row" className="px-4 py-3 font-normal">
                    <span className="font-medium text-ink">{c.id.toUpperCase()}</span>
                    <span className="mt-0.5 block max-w-xs text-muted-ink">{c.story}</span>
                  </th>
                  {MODES.map((m) => {
                    const res = c.modes[m]
                    return (
                      <td key={m} className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          {res.match ? (
                            <Check aria-label="Match" className="size-4 text-approve" />
                          ) : (
                            <X aria-label="Miss" className="size-4 text-decline" />
                          )}
                          <span className="capitalize">{label(res.actual.outcome)}</span>
                        </span>
                        {!res.match && <span className="block text-xs text-muted-ink">expected {label(res.expected.outcome)}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-ink">
          Engine {r.engineVersion} · policy versions {MODES.map((m) => `${MODE_META[m].institution} v${r.policyVersions[m]}`).join(", ")} · synthetic
          data as of {r.dataAsOf}
        </p>
      </section>
    </main>
  )
}
