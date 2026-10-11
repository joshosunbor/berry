import aspen from "@/data/institutions/aspen.json"
import kite from "@/data/institutions/kite.json"
import northgate from "@/data/institutions/northgate.json"
import type { Mode } from "@/lib/modes"
import { InstitutionConfig } from "@/lib/schemas"

/** Current institution configs, validated on load. Generated from scripts/generators/institutions.ts. */
export const CONFIGS: Record<Mode, InstitutionConfig> = {
  credit_union: InstitutionConfig.parse(northgate),
  fintech: InstitutionConfig.parse(kite),
  bank: InstitutionConfig.parse(aspen),
}
