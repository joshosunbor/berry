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
  /** Tailwind classes built from the mode's colour tokens. */
  classes: { fg: string; solid: string; soft: string; on: string; border: string }
}

export const MODE_META: Record<Mode, ModeMeta> = {
  credit_union: {
    mode: "credit_union",
    institutionId: "northgate",
    institution: "Northgate Credit Union",
    sector: "Credit union",
    style: "Relationship-based, with delegated authority",
    classes: { fg: "text-cu-fg", solid: "bg-cu", soft: "bg-cu-soft", on: "text-cu-on", border: "border-cu" },
  },
  fintech: {
    mode: "fintech",
    institutionId: "kite",
    institution: "Kite",
    sector: "Fintech",
    style: "Instant, automated, cash-flow only",
    classes: { fg: "text-fintech-fg", solid: "bg-fintech", soft: "bg-fintech-soft", on: "text-fintech-on", border: "border-fintech" },
  },
  bank: {
    mode: "bank",
    institutionId: "aspen",
    institution: "Aspen Bank",
    sector: "Bank",
    style: "Policy-driven, fixed thresholds",
    classes: { fg: "text-bank-fg", solid: "bg-bank", soft: "bg-bank-soft", on: "text-bank-on", border: "border-bank" },
  },
}
