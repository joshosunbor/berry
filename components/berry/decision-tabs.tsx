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
import { Card } from "@/components/ui/card"
import { tabClass, tabListClass, useTabs } from "@/components/ui/tabs"
import type { Features } from "@/lib/engine/features"
import { displayInput, IGNORED } from "@/lib/feature-display"
import { RECOMMENDATION_LABELS } from "@/lib/labels"
import { MODE_META, type Mode } from "@/lib/modes"
import type { Decision } from "@/lib/schemas"
import { cn } from "@/lib/utils"
import { useUrlTab } from "@/components/berry/url-state"

export interface FileTabsData {
  verification: { checks: VerificationCheck[]; summary: VerificationSummary }
  pad: Record<Mode, PadPlan | null>
  aft: Record<Mode, AftView | null>
  largeCash: LctrReview[]
  accountVerification: AccountVerificationOutcome
  loans: LoanSummary[]
  slug: string
}

/** The applicant file's tabs. `compare` is the server-rendered three-lender view, shown as its own tab. */
export function DecisionTabs({ decisions, features, data, compare }: { decisions: Record<Mode, Decision>; features: Features; data: FileTabsData; compare: React.ReactNode }) {
  const { mode } = useMode()
  const [register, setRegister] = useState<Register>("customer")
  const d = decisions[mode]
  const institution = MODE_META[mode].institution

  const tabs: { id: string; label: string; content: React.ReactNode }[] = [
    {
      id: "decision",
      label: "Decision",
      content: (
        <Card pad="lg">
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
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-2">
                {d.documents.map((doc) => (
                  <li key={doc.name}>{doc.name}</li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-6 text-xs text-fg-3">
            Decided by deterministic rules (engine {d.engineVersion}, {institution} policy v{d.policyVersion}). Rates, limits and thresholds are illustrative.
          </p>
        </Card>
      ),
    },
    {
      id: "compare",
      label: "Compare lenders",
      content: compare,
    },
    {
      id: "recommendations",
      label: "Recommendations",
      content: (
        <Card pad="lg">
          <h3 className="font-semibold">Products that may fit</h3>
          {d.recommendations && d.recommendations.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {d.recommendations.map((r) => (
                <li key={r.product} className="text-sm leading-6">
                  <span className="font-semibold">{RECOMMENDATION_LABELS[r.product] ?? r.product}.</span> <span className="text-fg-2">{r.why}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-fg-2">Nothing else to suggest for this applicant.</p>
          )}
        </Card>
      ),
    },
    { id: "verification", label: "Verification", content: <VerificationTab checks={data.verification.checks} summary={data.verification.summary} /> },
    { id: "repayment", label: "Repayment (PAD)", content: <RepaymentTab plans={data.pad} /> },
    { id: "disbursement", label: "Disbursement (AFT)", content: <DisbursementTab files={data.aft} verification={data.accountVerification} /> },
    { id: "servicing", label: "Servicing", content: <ServicingTab loans={data.loans} /> },
    { id: "protection", label: "Deposit protection", content: <ProtectionTab /> },
    ...(data.largeCash.length > 0 ? [{ id: "fintrac", label: "FINTRAC review", content: <LargeCashTab reviews={data.largeCash} /> }] : []),
    { id: "memo", label: "Credit memo", content: <MemoTab slug={data.slug} /> },
    {
      id: "inputs",
      label: "Inputs used",
      content: (
        <div className="grid gap-4 md:grid-cols-2">
          <Card pad="lg">
            <h3 className="font-semibold">What this decision used</h3>
            <dl className="mt-3 divide-y divide-line text-sm">
              {d.inputsUsed.map((key) => {
                const { label, value } = displayInput(key, features)
                return (
                  <div key={key} className="flex justify-between gap-4 py-2">
                    <dt className="text-fg-3">{label}</dt>
                    <dd className="num text-right font-semibold">{value}</dd>
                  </div>
                )
              })}
            </dl>
          </Card>
          <Card pad="lg">
            <h3 className="flex items-center gap-2 font-semibold">
              <EyeOff aria-hidden className="size-4 text-fg-3" />
              What it deliberately ignores
            </h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fg-2">
              {IGNORED.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-fg-3">
              A test shuffles these across every applicant and checks that no decision changes. Large cash deposits are flagged for FINTRAC review but
              are never a credit factor.
            </p>
          </Card>
        </div>
      ),
    },
  ]
  return <FileTabs label="Applicant file" tabs={tabs} />
}

/** The file's tab strip (scrolls sideways on phones) and its panels. The open tab is in the URL (?tab=), so it can be linked to. */
function FileTabs({ label, tabs }: { label: string; tabs: { id: string; label: string; content: React.ReactNode }[] }) {
  const ids = tabs.map((x) => x.id)
  const [tab, select] = useUrlTab(ids)
  const i = ids.indexOf(tab)
  const t = useTabs(tabs.length, i, (n) => select(ids[n]))
  return (
    <div id="file-tabs" className="min-w-0 scroll-mt-28">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div {...t.list} aria-label={label} className={cn(tabListClass("segmented"), "w-max flex-nowrap")}>
          {tabs.map((x, n) => (
            <button key={x.id} {...t.tab(n)} className={cn(tabClass("segmented", i === n), "whitespace-nowrap px-3.5 text-sm")}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((x, n) => (
        <div key={x.id} {...t.panel(n)} data-tour={`tab-${x.id}`} className="mt-4 min-w-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
          {x.content}
        </div>
      ))}
    </div>
  )
}
