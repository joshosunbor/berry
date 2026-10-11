import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { Applicant } from "@/lib/schemas"

/** Loads every applicant JSON file in a data directory, sorted by file name. */
export function loadApplicants(dir: string): Applicant[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => Applicant.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))))
}
