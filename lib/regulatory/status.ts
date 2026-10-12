import { z } from "zod"
import statusJson from "@/data/regulatory-status.json"

/*
 * Regulatory status panel data (/methodology). Every row cites its source
 * and the date it was last checked, and says what kind of source it is.
 * Anything not confirmed from an official source is marked Illustrative.
 */

export const RegulatoryStatus = z.enum(["Live", "Enacted, not in force", "In draft", "Launching", "Illustrative"])
export const BerryUse = z.enum(["Applied", "Simulated", "Context only"])
/** Official: a regulator, government body or Payments Canada. Otherwise a company's own page, a press report, or a third party's copy. */
export const SourceKind = z.enum(["official", "company", "press", "third-party copy"])

export const RegulatoryRow = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  status: RegulatoryStatus,
  /** Plain-language summary of what the rule or system is. */
  summary: z.string().min(1),
  /** Effective date or stage, as the source states it. Omitted if not confirmed. */
  effective: z.string().optional(),
  source: z.object({ name: z.string().min(1), url: z.url().startsWith("https://"), kind: SourceKind }),
  /** Date this row was last checked against its source. */
  asOf: z.iso.date(),
  berryUse: BerryUse,
  /** How Berry uses it, including what is simulated or illustrative. */
  inBerry: z.string().min(1),
  /** Why a row is Illustrative, or other caveats. */
  note: z.string().optional(),
})

export const RegulatoryStatusFile = z.object({
  asOf: z.iso.date(),
  rows: z.array(RegulatoryRow).min(1),
})

export type RegulatoryRow = z.infer<typeof RegulatoryRow>
export const REGULATORY_STATUS = RegulatoryStatusFile.parse(statusJson)
