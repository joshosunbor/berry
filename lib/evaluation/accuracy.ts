import { z } from "zod"
import { decideAll, ENGINE_VERSION } from "@/lib/engine/decide"
import { CONFIGS } from "@/lib/engine/config"
import { MODES, type Mode } from "@/lib/modes"
import { Outcome, toEngineInput, type Applicant } from "@/lib/schemas"

/*
 * Planted-case evaluation (CLAUDE.md §7.6, §8). Compares the engine's
 * decisions with expected outcomes written independently in
 * tests/expected.json. Lives outside lib/engine: the engine never sees the
 * expectations. Output is deterministic so CI can detect a stale report.
 */

const ModeExpectation = z.object({ outcome: Outcome, approver: z.string().optional() })
export const ExpectedFile = z.object({
  cases: z.record(
    z.string(),
    z.object({ credit_union: ModeExpectation, fintech: ModeExpectation, bank: ModeExpectation, why: z.string(), flags: z.number().int().optional() }),
  ),
})
/**
 * `open`: explanations for current misses, keyed "<case>/<mode>" or "<case>/flags".
 * `resolved`: misses found during development, what caused them and how they were fixed.
 */
const ResolvedMiss = z.object({ case: z.string(), mode: z.string(), found: z.string(), expected: z.string(), engineGave: z.string(), cause: z.string(), fix: z.string() })
export const NotesFile = z.object({ open: z.record(z.string(), z.string()), resolved: z.array(ResolvedMiss) })
export type ResolvedMiss = z.infer<typeof ResolvedMiss>

export interface ModeResult {
  expected: { outcome: string; approver?: string }
  actual: { outcome: string; limitCents: number; approver?: string; topReasons: string[] }
  match: boolean
}

export interface CaseResult {
  id: string
  kind: "personal" | "business"
  story: string
  why: string
  modes: Record<Mode, ModeResult>
  flags?: { expected: number; actual: number; match: boolean }
}

export interface Miss {
  id: string
  mode: Mode | "flags"
  expected: string
  actual: string
  topReasons: string[]
  note: string | null
}

export interface AccuracyReport {
  engineVersion: string
  policyVersions: Record<Mode, number>
  dataAsOf: string
  totals: { cases: number; decisions: number; matched: number; rate: number }
  byMode: Record<Mode, { matched: number; total: number; rate: number }>
  flagChecks: { matched: number; total: number }
  cases: CaseResult[]
  misses: Miss[]
  resolved: ResolvedMiss[]
}

const rate = (matched: number, total: number) => (total ? Math.round((matched / total) * 1000) / 1000 : 0)

export function evaluate(planted: Applicant[], expectedJson: unknown, notesJson: unknown = { open: {}, resolved: [] }): AccuracyReport {
  const expected = ExpectedFile.parse(expectedJson).cases
  const notes = NotesFile.parse(notesJson)
  const cases: CaseResult[] = []
  const misses: Miss[] = []

  for (const a of [...planted].sort((x, y) => x.slug.localeCompare(y.slug))) {
    const id = a.slug.replace(/^planted-/, "")
    const exp = expected[id]
    if (!exp) throw new Error(`no expected outcome for planted case ${id}`)
    const decisions = decideAll(toEngineInput(a))

    const modes = Object.fromEntries(
      MODES.map((m) => {
        const d = decisions[m]
        const e = exp[m]
        const match = d.outcome === e.outcome && (!e.approver || d.approver?.id === e.approver)
        const result: ModeResult = {
          expected: e,
          actual: { outcome: d.outcome, limitCents: d.limitCents, approver: d.approver?.id, topReasons: d.reasons.slice(0, 3).map((r) => r.code) },
          match,
        }
        if (!match) {
          misses.push({
            id,
            mode: m,
            expected: e.approver ? `${e.outcome} (${e.approver})` : e.outcome,
            actual: d.approver ? `${d.outcome} (${d.approver.id})` : d.outcome,
            topReasons: result.actual.topReasons,
            note: notes.open[`${id}/${m}`] ?? null,
          })
        }
        return [m, result]
      }),
    ) as Record<Mode, ModeResult>

    let flags: CaseResult["flags"]
    if (exp.flags !== undefined) {
      const actual = decisions.bank.flags.length
      flags = { expected: exp.flags, actual, match: actual === exp.flags }
      if (!flags.match) misses.push({ id, mode: "flags", expected: `${exp.flags} flag(s)`, actual: `${actual} flag(s)`, topReasons: [], note: notes.open[`${id}/flags`] ?? null })
    }
    cases.push({ id, kind: a.kind, story: a.story, why: exp.why, modes, flags })
  }

  const byMode = Object.fromEntries(
    MODES.map((m) => {
      const matched = cases.filter((c) => c.modes[m].match).length
      return [m, { matched, total: cases.length, rate: rate(matched, cases.length) }]
    }),
  ) as AccuracyReport["byMode"]
  const matched = MODES.reduce((s, m) => s + byMode[m].matched, 0)
  const flagCases = cases.filter((c) => c.flags)

  return {
    engineVersion: ENGINE_VERSION,
    policyVersions: Object.fromEntries(MODES.map((m) => [m, CONFIGS[m].version])) as Record<Mode, number>,
    dataAsOf: planted[0]?.generated.windowEnd ?? "",
    totals: { cases: cases.length, decisions: cases.length * MODES.length, matched, rate: rate(matched, cases.length * MODES.length) },
    byMode,
    flagChecks: { matched: flagCases.filter((c) => c.flags!.match).length, total: flagCases.length },
    cases,
    misses,
    resolved: notes.resolved,
  }
}
