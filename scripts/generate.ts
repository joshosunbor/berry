/**
 * Seeded synthetic data generator.
 *
 *   npm run generate
 *
 * Writes /data/applicants/<slug>.json and /data/institutions/<id>.json.
 * Output is deterministic: running it twice produces identical files.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Applicant, InstitutionConfig } from "@/lib/schemas"
import { generateCast } from "./generators/cast"
import { INSTITUTIONS } from "./generators/institutions"

const root = path.resolve(import.meta.dirname, "..")

function writeJson(dir: string, name: string, value: unknown) {
  writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`)
}

function resetDir(dir: string) {
  mkdirSync(dir, { recursive: true })
  for (const f of readdirSync(dir)) if (f.endsWith(".json")) rmSync(path.join(dir, f))
}

const applicantsDir = path.join(root, "data/applicants")
const institutionsDir = path.join(root, "data/institutions")
resetDir(applicantsDir)
resetDir(institutionsDir)

for (const raw of generateCast()) {
  // Write the parsed value: validated, with keys in schema order.
  const applicant = Applicant.parse(raw)
  writeJson(applicantsDir, applicant.slug, applicant)
  console.log(`  ${applicant.slug.padEnd(24)} ${String(applicant.transactions.length).padStart(5)} transactions`)
}
for (const raw of INSTITUTIONS) {
  const config = InstitutionConfig.parse(raw)
  writeJson(institutionsDir, config.id, config)
}
console.log(`Wrote applicants to data/applicants and ${INSTITUTIONS.length} institution configs to data/institutions.`)
