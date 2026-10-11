import type { AuthorityTier, EngineInput, InstitutionConfig, Outcome, ProductTerms, ProductType, Structure } from "@/lib/schemas"
import type { Features } from "./features"
import type { ReasonHit } from "./reasons"

export interface ModeContext {
  input: EngineInput
  features: Features
  config: InstitutionConfig
}

/** What a mode decides, before explanation and packaging into a Decision. */
export interface ModeResult {
  outcome: Outcome
  product: ProductType
  structure: Structure | null
  limitCents: number
  aprBps: number | null
  termMonths: number | null
  paymentCents: number | null
  reasons: ReasonHit[]
  conditions?: string[]
  documents?: { name: string; received: boolean }[]
  /** Approval relied on relationship strength to pass a standard rule (credit union). */
  relationshipException?: boolean
  approver?: AuthorityTier
  /** Feature keys this mode read, for the "What this decision used" panel. */
  inputsUsed: string[]
}

export type { ProductTerms }
