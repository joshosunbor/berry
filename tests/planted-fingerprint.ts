import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { decideAll } from "@/lib/engine/decide"
import { loadApplicants } from "@/lib/evaluation/load"
import { toEngineInput } from "@/lib/schemas"

/*
 * Every planted case's decisions and expected outcomes, with descriptions
 * left out: wording changes to stories or "why" notes must leave this
 * unchanged.
 */
const root = path.resolve(import.meta.dirname, "..")

export function plantedFingerprint() {
  const expected = JSON.parse(readFileSync(path.join(root, "tests/expected.json"), "utf8"))
  const strip = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(strip) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "why").map(([k, x]) => [k, strip(x)])) : v
  const decisions = Object.fromEntries(
    loadApplicants(path.join(root, "data/planted")).map((a) => {
      const { story: _story, ...rest } = a as typeof a & { story?: string }
      void _story
      const d = decideAll(toEngineInput(a))
      return [
        a.id,
        {
          // Every input except the story, hashed: the transactions are too large to store.
          applicant: createHash("sha256").update(JSON.stringify(rest)).digest("hex"),
          decisions: Object.fromEntries(
            Object.entries(d).map(([m, x]) => [
              m,
              { outcome: x.outcome, product: x.product, limitCents: x.limitCents, aprBps: x.aprBps, termMonths: x.termMonths, structure: x.structure, reasons: x.reasons, counterfactuals: x.counterfactuals, approver: x.approver?.id, conditions: x.conditions, flags: x.flags },
            ]),
          ),
        },
      ]
    }),
  )
  return { expected: strip(expected), decisions }
}
