/**
 * Writes data/loan-index.json: the ids of every simulated loan, which
 * proxy.ts uses to return a real 404 for unknown loans. Runs after the
 * generator (npm run generate), because loans come from the engine's
 * decisions on the data just written.
 */
import { writeFileSync } from "node:fs"
import path from "node:path"
import { getLoanViews } from "@/lib/data"

const ids = getLoanViews().map((l) => l.id).sort()
writeFileSync(path.resolve(import.meta.dirname, "../data/loan-index.json"), `${JSON.stringify(ids, null, 2)}\n`)
console.log(`Wrote data/loan-index.json (${ids.length} loans).`)
