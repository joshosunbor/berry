/**
 * The three institution modes. Institutions are fictional; see the footer
 * notice and README.
 */
export const MODES = ["credit_union", "fintech", "bank"] as const
export type Mode = (typeof MODES)[number]

export const INSTITUTION_IDS = ["northgate", "kite", "aspen"] as const
export type InstitutionId = (typeof INSTITUTION_IDS)[number]

export interface ModeMeta {
  mode: Mode
  institutionId: InstitutionId
  institution: string
  sector: string
  /** One-line description of how this mode decides. */
  style: string
  /** Tailwind classes from the lender tokens: Northgate green, Kite cyan, Aspen slate. */
  classes: { fg: string; solid: string; soft: string; border: string }
}

export const MODE_META: Record<Mode, ModeMeta> = {
  credit_union: {
    mode: "credit_union",
    institutionId: "northgate",
    institution: "Northgate Credit Union",
    sector: "Credit union",
    style: "Relationship-based, with delegated authority",
    classes: { fg: "text-green-ink", solid: "bg-northgate", soft: "bg-green-tint", border: "border-northgate" },
  },
  fintech: {
    mode: "fintech",
    institutionId: "kite",
    institution: "Kite",
    sector: "Fintech",
    style: "Instant, automated, cash-flow only",
    classes: { fg: "text-cyan-ink", solid: "bg-kite", soft: "bg-cyan-tint", border: "border-kite" },
  },
  bank: {
    mode: "bank",
    institutionId: "aspen",
    institution: "Aspen Bank",
    sector: "Bank",
    style: "Policy-driven, fixed thresholds",
    classes: { fg: "text-aspen", solid: "bg-aspen", soft: "bg-aspen-tint", border: "border-aspen" },
  },
}
