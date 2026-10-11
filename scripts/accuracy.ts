/**
 * Planted-case accuracy runner.
 *
 *   npm run accuracy
 *
 * Writes public/accuracy.json, rendered by /accuracy. CI fails if the
 * committed file is out of date (tests/accuracy.test.ts).
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { evaluate } from "@/lib/evaluation/accuracy"
import { loadApplicants } from "@/lib/evaluation/load"

const root = path.resolve(import.meta.dirname, "..")
const read = (p: string) => JSON.parse(readFileSync(path.join(root, p), "utf8"))

const report = evaluate(loadApplicants(path.join(root, "data/planted")), read("tests/expected.json"), read("tests/accuracy-notes.json"))
writeFileSync(path.join(root, "public/accuracy.json"), `${JSON.stringify(report, null, 2)}\n`)

const pct = (r: number) => `${(r * 100).toFixed(1)}%`
console.log(`Overall: ${report.totals.matched}/${report.totals.decisions} (${pct(report.totals.rate)})`)
for (const [mode, m] of Object.entries(report.byMode)) console.log(`  ${mode.padEnd(13)} ${m.matched}/${m.total} (${pct(m.rate)})`)
console.log(`  flags         ${report.flagChecks.matched}/${report.flagChecks.total}`)
for (const miss of report.misses) {
  console.log(`  MISS ${miss.id}/${miss.mode}: expected ${miss.expected}, got ${miss.actual} [${miss.topReasons.join(", ")}]${miss.note ? "" : "  (no note yet)"}`)
}
