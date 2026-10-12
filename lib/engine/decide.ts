import { MODES, type Mode } from "@/lib/modes"
import { Decision, type EngineInput, type InstitutionConfig } from "@/lib/schemas"
import { CONFIGS } from "./config"
import { counterfactuals, explain } from "./explain"
import { computeFeatures, type Features } from "./features"
import { findLargeCashEvents, toComplianceFlag } from "./fintrac"
import { decideBank } from "./modes/bank"
import { decideCreditUnion } from "./modes/creditUnion"
import { decideFintech } from "./modes/fintech"
import { recommend } from "./products"
import type { ModeContext, ModeResult } from "./types"

/*
 * The decision engine's entry point. Deterministic: the same input and
 * config always produce the same Decision. No clock, no randomness, no I/O.
 * AI never sets a limit, price or approval.
 */

export const ENGINE_VERSION = "0.1.0"

const MODE_FNS: Record<Mode, (ctx: ModeContext) => ModeResult> = {
  credit_union: decideCreditUnion,
  fintech: decideFintech,
  bank: decideBank,
}

export function decide(input: EngineInput, mode: Mode, config: InstitutionConfig = CONFIGS[mode], features: Features = computeFeatures(input)): Decision {
  if (config.mode !== mode) throw new Error(`config ${config.id} is for ${config.mode}, not ${mode}`)
  const result = MODE_FNS[mode]({ input, features, config })

  // Compliance flags are never passed to a mode. Only the institution that
  // received the cash is the reporting entity, so only its accounts count.
  const ownAccounts = new Set(input.accounts.filter((a) => a.provider === config.id).map((a) => a.accountId))
  const flags = findLargeCashEvents(input.transactions.filter((t) => ownAccounts.has(t.accountId))).map(toComplianceFlag)

  return Decision.parse({
    id: `dec_${input.slug}-${mode.replace("_", "-")}`,
    applicantId: input.id,
    mode,
    institutionId: config.id,
    outcome: result.outcome,
    product: result.product,
    limitCents: result.limitCents,
    aprBps: result.aprBps,
    termMonths: result.termMonths,
    structure: result.structure,
    reasons: explain(result.outcome, result.reasons, result.outcome !== "decline" && result.limitCents < input.request.amountCents),
    counterfactuals: counterfactuals(result.reasons),
    approver: result.approver,
    conditions: result.conditions,
    fundingConditions: result.fundingConditions?.length ? result.fundingConditions : undefined,
    documents: result.documents,
    recommendations: recommend(features, input.kind, result, config),
    flags,
    inputsUsed: result.inputsUsed,
    paymentCents: result.paymentCents,
    decidedAt: `${features.asOf}T23:59:59Z`,
    engineVersion: ENGINE_VERSION,
    policyVersion: config.version,
  })
}

/** All three lenders' decisions for one applicant, sharing one feature computation. */
export function decideAll(input: EngineInput): Record<Mode, Decision> {
  const features = computeFeatures(input)
  return Object.fromEntries(MODES.map((m) => [m, decide(input, m, CONFIGS[m], features)])) as Record<Mode, Decision>
}
