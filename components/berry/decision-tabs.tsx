"use client"

import { useState } from "react"
import { EyeOff } from "lucide-react"
import { ReasonList, RegisterToggle, type Register } from "@/components/berry/decision-panel"
import { MemoTab } from "@/components/berry/memo-tab"
import { DisbursementTab, LargeCashTab, ProtectionTab, RepaymentTab, ServicingTab, VerificationTab } from "@/components/berry/file-tabs"
import type { LoanSummary } from "@/lib/servicing/views"
import type { AftView } from "@/lib/data"
import type { LctrReview } from "@/lib/engine/fintrac"
import type { PadPlan } from "@/lib/engine/repayment"
import type { VerificationSummary } from "@/lib/onboarding/kyc"
import type { VerificationCheck } from "@/lib/schemas"
import type { AccountVerificationOutcome } from "@/lib/servicing/funding"
import { useMode } from "@/components/berry/mode-context"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/legacy-tabs"
import type { Features } from "@/lib/engine/features"
import { displayInput, IGNORED } from "@/lib/feature-display"
import { RECOMMENDATION_LABELS } from "@/lib/labels"
import { MODE_META, type Mode } from "@/lib/modes"
import type { Decision } from "@/lib/schemas"

export interface FileTabsData {
  verification: { checks: VerificationCheck[]; summary: VerificationSummary }
  pad: Record<Mode, PadPlan | null>
  aft: Record<Mode, AftView | null>
  largeCash: LctrReview[]
  accountVerification: AccountVerificationOutcome
  loans: LoanSummary[]
  slug: string
}

export function DecisionTabs({ decisions, features, data }: { decisions: Record<Mode, Decision>; features: Features; data: FileTabsData }) {
  const { mode } = useMode()
  const [register, setRegister] = useState<Register>("customer")
  const d = decisions[mode]
  const institution = MODE_META[mode].institution

  return (
    <Tabs defaultValue="decision" className="min-w-0">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList className="w-max">
          <TabsTrigger value="decision">Decision</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="repayment">Repayment (PAD)</TabsTrigger>
          <TabsTrigger value="disbursement">Disbursement (AFT)</TabsTrigger>
          <TabsTrigger value="servicing">Servicing</TabsTrigger>
          <TabsTrigger value="protection">Deposit protection</TabsTrigger>
          {data.largeCash.length > 0 && <TabsTrigger value="fintrac">FINTRAC review</TabsTrigger>}
          <TabsTrigger value="memo">Credit memo</TabsTrigger>
          <TabsTrigger value="inputs">Inputs used</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="decision" className="min-w-0 mt-4 rounded-lg border border-rule bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Every reason {institution} gave</h3>
          <RegisterToggle value={register} onChange={setRegister} />
        </div>
        <div className="mt-4">
          <ReasonList decision={d} register={register} />
        </div>
        {d.documents && d.documents.length > 0 && (
          <>
            <h3 className="mt-6 font-semibold">Documents requested</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-ink">
              {d.documents.map((doc) => (
                <li key={doc.name}>{doc.name}</li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-6 text-xs text-muted-ink">
          Decided by deterministic rules (engine {d.engineVersion}, {institution} policy v{d.policyVersion}). Rates, limits and thresholds are illustrative.
        </p>
      </TabsContent>

      <TabsContent value="recommendations" className="min-w-0 mt-4 rounded-lg border border-rule bg-surface p-5">
        <h3 className="font-semibold">Products that may fit</h3>
        {d.recommendations && d.recommendations.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {d.recommendations.map((r) => (
              <li key={r.product} className="text-sm leading-6">
                <span className="font-medium">{RECOMMENDATION_LABELS[r.product] ?? r.product}.</span> <span className="text-muted-ink">{r.why}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-ink">Nothing else to suggest for this applicant.</p>
        )}
      </TabsContent>

      <TabsContent value="verification" className="min-w-0 mt-4">
        <VerificationTab checks={data.verification.checks} summary={data.verification.summary} />
      </TabsContent>
      <TabsContent value="repayment" className="min-w-0 mt-4">
        <RepaymentTab plans={data.pad} />
      </TabsContent>
      <TabsContent value="disbursement" className="min-w-0 mt-4">
        <DisbursementTab files={data.aft} verification={data.accountVerification} />
      </TabsContent>
      <TabsContent value="servicing" className="min-w-0 mt-4">
        <ServicingTab loans={data.loans} />
      </TabsContent>
      <TabsContent value="protection" className="min-w-0 mt-4">
        <ProtectionTab />
      </TabsContent>
      {data.largeCash.length > 0 && (
        <TabsContent value="fintrac" className="min-w-0 mt-4">
          <LargeCashTab reviews={data.largeCash} />
        </TabsContent>
      )}

      <TabsContent value="memo" className="min-w-0 mt-4">
        <MemoTab slug={data.slug} />
      </TabsContent>

      <TabsContent value="inputs" className="min-w-0 mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-rule bg-surface p-5">
          <h3 className="font-semibold">What this decision used</h3>
          <dl className="mt-3 divide-y divide-rule text-sm">
            {d.inputsUsed.map((key) => {
              const { label, value } = displayInput(key, features)
              return (
                <div key={key} className="flex justify-between gap-4 py-2">
                  <dt className="text-muted-ink">{label}</dt>
                  <dd className="num text-right font-medium">{value}</dd>
                </div>
              )
            })}
          </dl>
        </div>
        <div className="rounded-lg border border-rule bg-surface p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <EyeOff aria-hidden className="size-4 text-muted-ink" />
            What it deliberately ignores
          </h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-ink">
            {IGNORED.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-ink">
            A test shuffles these across every applicant and checks that no decision changes. Large cash deposits are flagged for FINTRAC review but
            are never a credit factor.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  )
}
