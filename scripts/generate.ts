/**
 * Seeded synthetic data generator.
 *
 *   npm run generate
 *
 * Writes /data/applicants/<slug>.json (the cast), /data/planted/<slug>.json
 * (accuracy cases) and /data/institutions/<id>.json.
 * Output is deterministic: running it twice produces identical files.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Applicant, InstitutionConfig } from "@/lib/schemas"
import { generateCast } from "./generators/cast"
import { INSTITUTIONS } from "./generators/institutions"
import { generatePlanted } from "./generators/planted"

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
const plantedDir = path.join(root, "data/planted")
resetDir(applicantsDir)
resetDir(plantedDir)
resetDir(institutionsDir)

for (const raw of generateCast()) {
  // Write the parsed value: validated, with keys in schema order.
  const applicant = Applicant.parse(raw)
  writeJson(applicantsDir, applicant.slug, applicant)
  console.log(`  ${applicant.slug.padEnd(24)} ${String(applicant.transactions.length).padStart(5)} transactions`)
}
const planted = generatePlanted().map((raw) => Applicant.parse(raw))
for (const p of planted) writeJson(plantedDir, p.slug, p)
console.log(`  ${planted.length} planted cases`)
for (const raw of INSTITUTIONS) {
  const config = InstitutionConfig.parse(raw)
  writeJson(institutionsDir, config.id, config)
}
console.log(`Wrote data/applicants, data/planted and ${INSTITUTIONS.length} institution configs to data/institutions.`)
