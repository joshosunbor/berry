"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, Briefcase, Check, CheckCircle2, Loader2, RotateCcw, User, XCircle } from "lucide-react"
import { Illustrative, Source } from "@/components/berry/illustrative"
import { ModeChip } from "@/components/berry/mode-chip"
import { OutcomeChip } from "@/components/berry/outcome-chip"
import type { ApplyPayload } from "@/lib/data"
import { decideAll } from "@/lib/engine/decide"
import { PRODUCT_LABELS } from "@/lib/labels"
import { formatCents } from "@/lib/money"
import { MODES, MODE_META, type Mode } from "@/lib/modes"
import { buildConsent, CONSENT_RULES, DATA_CATEGORY_LABELS, whyNeeded } from "@/lib/onboarding/consent"
import { clearApplication, recordConsents, saveApplication, useSavedApplication, type ApplyStep, type SavedApplication } from "@/lib/onboarding/store"
import { BUSINESS_PRODUCTS, PERSONAL_PRODUCTS, type Consent, type CreditRequest, type Decision, type ProductType } from "@/lib/schemas"
import { cn } from "@/lib/utils"

export interface ProfileOption {
  slug: string
  name: string
  story: string
  kind: "personal" | "business"
  province: string
  business: { legalName: string; industry: string; yearsOperating: number; employees: number } | null
  request: CreditRequest
}

const STEPS: { id: ApplyStep; label: string }[] = [
  { id: "profile", label: "Choose a profile" },
  { id: "about", label: "About you" },
  { id: "consent", label: "Consent" },
  { id: "verification", label: "Verification" },
  { id: "request", label: "Your request" },
  { id: "review", label: "Review" },
]

const TERMS = [12, 24, 36, 48, 60, 84]
const TERM_PRODUCTS = new Set<ProductType>(["personal_loan", "business_term_loan", "equipment_financing"])
const fresh = (): SavedApplication => ({ slug: null, step: "profile", lenders: { credit_union: true, fintech: true, bank: true }, request: null, savedAt: "" })

const CHECK_LABELS: Record<string, string> = {
  id_document: "Identity document",
  name_dob_match: "Name and date of birth match",
  sanctions_screening: "Sanctions screening",
  pep_screening: "Politically exposed person screening",
  business_registration: "Business registration",
  beneficial_ownership: "Beneficial ownership",
}

export function ApplyFlow({ profiles }: { profiles: ProfileOption[] }) {
  const [app, setApp] = useState<SavedApplication>(fresh)
  const [started, setStarted] = useState(false)
  const [payload, setPayload] = useState<{ slug: string; data: ApplyPayload } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Partial<Record<Mode, Decision>> | null>(null)

  // A saved application (browser storage only) can be resumed until this visit starts its own.
  const saved = useSavedApplication()
  const resumable = !started && saved && saved.slug && saved.step !== "submitted" ? saved : null

  // Load the chosen profile's data so the engine can run in the browser.
  useEffect(() => {
    if (!app.slug || payload?.slug === app.slug) return
    let cancelled = false
    const slug = app.slug
    fetch(`/api/applicants/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: ApplyPayload) => !cancelled && setPayload({ slug, data }))
      .catch(() => !cancelled && setLoadError(slug))
    return () => {
      cancelled = true
    }
  }, [app.slug, payload?.slug])
  const data = payload && payload.slug === app.slug ? payload.data : null

  const profile = profiles.find((p) => p.slug === app.slug) ?? null
  const update = (patch: Partial<SavedApplication>) => {
    const next = { ...app, ...patch, savedAt: new Date().toISOString() }
    setStarted(true)
    setApp(next)
    saveApplication(next)
  }
  const go = (step: ApplyStep) => {
    update({ step })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
  const stepIndex = STEPS.findIndex((s) => s.id === app.step)

  if (resumable) {
    const p = profiles.find((x) => x.slug === resumable.slug)
    return (
      <div className="rounded-lg border border-rule bg-surface p-6">
        <h2 className="text-lg font-semibold">Pick up where you left off?</h2>
        <p className="mt-2 text-muted-ink">
          You have a saved application{p ? ` as ${p.name}` : ""}, at the {STEPS.find((s) => s.id === resumable.step)?.label.toLowerCase()} step. It&apos;s saved in this browser only.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => (setApp(resumable), setStarted(true))} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-background">
            Resume
            <ArrowRight aria-hidden className="size-4" />
          </button>
          <button type="button" onClick={() => (clearApplication(), setStarted(true))} className="inline-flex items-center gap-2 rounded-md border border-rule px-4 py-2 text-sm">
            <RotateCcw aria-hidden className="size-4" />
            Start over
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {app.step !== "submitted" && (
        <nav aria-label="Application progress" className="mb-8">
          <p className="text-sm text-muted-ink">
            Step {stepIndex + 1} of {STEPS.length}: <span className="font-medium text-ink">{STEPS[stepIndex].label}</span>
          </p>
          <ol className="mt-2 grid grid-cols-6 gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <li key={s.id} className={cn("h-1.5 rounded-full", i <= stepIndex ? "bg-ink" : "bg-muted")} />
            ))}
          </ol>
        </nav>
      )}

      {app.step === "profile" && (
        <Step title="Choose a synthetic profile" help="Berry uses synthetic applicants only. Pick one to apply as; their banking history is already generated, so you'll see a real decision from each lender.">
          <ul className="grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => (
              <li key={p.slug}>
                <button
                  type="button"
                  onClick={() => {
                    setDecisions(null)
                    setLoadError(null)
                    update({ slug: p.slug, request: p.request, step: "about" })
                  }}
                  className="flex h-full w-full flex-col rounded-lg border border-rule bg-surface p-4 text-left hover:border-ink/30"
                >
                  <span className="flex items-center gap-2 font-medium">
                    {p.kind === "business" ? <Briefcase aria-hidden className="size-4 text-muted-ink" /> : <User aria-hidden className="size-4 text-muted-ink" />}
                    {p.name}
                  </span>
                  <span className="mt-1 text-sm text-muted-ink">{p.story}</span>
                </button>
              </li>
            ))}
          </ul>
        </Step>
      )}

      {app.step === "about" && profile && (
        <Step title="About you" help="These details are synthetic and already filled in. In a real application you'd type them; the identity details behind them are only used to verify who you are, never to decide credit.">
          <dl className="divide-y divide-rule rounded-lg border border-rule bg-surface text-sm">
            <Row label="Applying as">{profile.name}</Row>
            <Row label="Type">{profile.kind === "business" ? "Business" : "Personal"}</Row>
            <Row label="Province">{profile.province}</Row>
            {profile.business && (
              <>
                <Row label="Legal name">{profile.business.legalName}</Row>
                <Row label="Industry">{profile.business.industry}</Row>
                <Row label="Years operating">{profile.business.yearsOperating}</Row>
              </>
            )}
          </dl>
          <Nav back={() => go("profile")} next={() => go("consent")} />
        </Step>
      )}

      {app.step === "consent" && profile && data && (
        <ConsentStep
          payload={data}
          lenders={app.lenders}
          product={app.request?.product ?? profile.request.product}
          onChange={(lenders) => update({ lenders })}
          back={() => go("about")}
          next={(consents) => {
            recordConsents(
              consents,
              consents.map((c) => ({ consentId: c.id, type: "granted" as const, at: c.grantedAt, detail: `Granted to ${c.recipient}` })),
            )
            go("verification")
          }}
        />
      )}

      {app.step === "verification" && data && <VerificationStep payload={data} back={() => go("consent")} next={() => go("request")} />}

      {app.step === "request" && profile && app.request && (
        <RequestStep kind={profile.kind} request={app.request} onChange={(request) => update({ request })} back={() => go("verification")} next={() => go("review")} />
      )}

      {app.step === "review" && profile && app.request && data && (
        <Step title="Review and submit" help="Submitting runs Berry's decision engine in your browser on this profile's banking history and your request. Only the lenders you shared your data with will decide.">
          <dl className="divide-y divide-rule rounded-lg border border-rule bg-surface text-sm">
            <Row label="Applying as">{profile.name}</Row>
            <Row label="Product">{PRODUCT_LABELS[app.request.product]}</Row>
            <Row label="Amount">{formatCents(app.request.amountCents, { whole: true })}</Row>
            {app.request.termMonths && TERM_PRODUCTS.has(app.request.product) && <Row label="Term">{app.request.termMonths} months</Row>}
            <Row label="Sharing data with">{MODES.filter((m) => app.lenders[m]).map((m) => MODE_META[m].institution).join(", ")}</Row>
          </dl>
          <Nav
            back={() => go("request")}
            nextLabel="Submit application"
            next={() => {
              const input = { ...data.input, request: app.request! }
              const all = decideAll(input)
              setDecisions(Object.fromEntries(MODES.filter((m) => app.lenders[m]).map((m) => [m, all[m]])))
              go("submitted")
            }}
          />
        </Step>
      )}

      {app.step === "submitted" && profile && decisions && (
        <section aria-labelledby="results">
          <h2 id="results" className="text-2xl font-semibold tracking-tight">
            Your decisions
          </h2>
          <p className="mt-2 text-muted-ink">Decided just now in your browser by deterministic rules. Rates and limits are illustrative.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {MODES.filter((m) => decisions[m]).map((m) => {
              const d = decisions[m]!
              const ok = d.outcome === "approve" || d.outcome === "approve_with_conditions"
              return (
                <article key={m} className={cn("rounded-lg border-t-4 bg-surface p-5 shadow-soft", MODE_META[m].classes.border)}>
                  <ModeChip mode={m} />
                  <div className="mt-3">
                    <OutcomeChip outcome={d.outcome} />
                  </div>
                  <p className="num mt-2 text-2xl font-semibold">{ok ? formatCents(d.limitCents, { whole: true }) : "No offer"}</p>
                  <p className="mt-3 text-sm leading-6 text-muted-ink">{d.reasons[0]?.customerText}</p>
                  {d.counterfactuals[0] && <p className="mt-2 text-sm leading-6">{d.counterfactuals[0]}</p>}
                </article>
              )
            })}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/consents" className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-background">
              Manage your consents
            </Link>
            <Link href={`/workbench/${profile.slug}`} className="inline-flex items-center gap-2 rounded-md border border-rule px-4 py-2 text-sm">
              Open {profile.name}&apos;s file
            </Link>
            <button type="button" onClick={() => (clearApplication(), setApp(fresh()), setDecisions(null))} className="inline-flex items-center gap-2 rounded-md border border-rule px-4 py-2 text-sm">
              <RotateCcw aria-hidden className="size-4" />
              Start another application
            </button>
          </div>
        </section>
      )}

      {app.slug && !data && app.step !== "profile" && app.step !== "about" && (
        <p className="flex items-center gap-2 text-sm text-muted-ink" role="status">
          {loadError === app.slug ? (
            "Couldn't load this profile. Refresh the page to try again."
          ) : (
            <>
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Loading the profile&apos;s banking history…
            </>
          )}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Step({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="step-title">
      <h2 id="step-title" className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-muted-ink">{help}</p>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5">
      <dt className="text-muted-ink">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

function Nav({ back, next, nextLabel = "Continue", disabled = false }: { back: () => void; next: () => void; nextLabel?: string; disabled?: boolean }) {
  return (
    <div className="mt-6 flex justify-between gap-3">
      <button type="button" onClick={back} className="inline-flex items-center gap-2 rounded-md border border-rule px-4 py-2 text-sm">
        <ArrowLeft aria-hidden className="size-4" />
        Back
      </button>
      <button type="button" onClick={next} disabled={disabled} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-background disabled:opacity-40">
        {nextLabel}
        <ArrowRight aria-hidden className="size-4" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ConsentStep({
  payload,
  lenders,
  product,
  onChange,
  back,
  next,
}: {
  payload: ApplyPayload
  lenders: SavedApplication["lenders"]
  product: ProductType
  onChange: (l: SavedApplication["lenders"]) => void
  back: () => void
  next: (consents: Consent[]) => void
}) {
  const grantedAt = useMemo(() => new Date().toISOString(), [])
  const preview = useMemo(() => buildConsent({ applicant: payload.input, recipient: "Preview", product, grantedAt }), [payload, product, grantedAt])
  const chosen = MODES.filter((m) => lenders[m])
  const expires = new Date(preview.expiresAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })

  return (
    <Step
      title="Share your banking data"
      help="Before any data is read, here's exactly what each lender would see, why, for how long, and what they won't get. You can revoke this at any time, for free, from your consent dashboard."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-rule bg-surface p-5">
          <h3 className="font-semibold">What we&apos;ll read</h3>
          <ul className="mt-3 space-y-2.5 text-sm">
            {preview.dataCategories.map((c) => (
              <li key={c} className="flex gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-approve" />
                <span>
                  <span className="font-medium">{DATA_CATEGORY_LABELS[c]}.</span> <span className="text-muted-ink">{whyNeeded(c)}</span>
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 font-semibold">What we won&apos;t ask for</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-ink">
            {preview.notRequested.map((c) => (
              <li key={c} className="flex gap-2">
                <XCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                {DATA_CATEGORY_LABELS[c]}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-rule bg-surface p-5">
          <h3 className="font-semibold">Why, for how long, and who</h3>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-ink">Purpose</dt>
              <dd>{preview.purpose}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-ink">How long</dt>
              <dd>
                Until {expires}, then it ends unless you renew it. Consent can last at most {CONSENT_RULES.maxMonths} months under the{" "}
                <Source href={CONSENT_RULES.source}>Consumer-Driven Banking Act, s. 86</Source>, which is not yet in force.
              </dd>
            </div>
          </dl>
          <fieldset className="mt-4">
            <legend className="text-xs text-muted-ink">Who receives it (choose at least one)</legend>
            <div className="mt-2 space-y-2">
              {MODES.map((m) => (
                <label key={m} className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" checked={lenders[m]} onChange={(e) => onChange({ ...lenders, [m]: e.target.checked })} className="size-4 accent-current" />
                  {MODE_META[m].institution} <span className="text-muted-ink">(fictional)</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-ink">
            <Illustrative label="Simulated" why="Built around the draft framework's consent principles. No real bank connection is made and Berry is not accredited." />
            Built around the draft framework&apos;s consent principles.
          </p>
        </div>
      </div>
      <Nav
        back={back}
        disabled={chosen.length === 0}
        nextLabel="I consent"
        next={() => next(chosen.map((m) => buildConsent({ applicant: payload.input, recipient: MODE_META[m].institution, product, grantedAt })))}
      />
    </Step>
  )
}

function VerificationStep({ payload, back, next }: { payload: ApplyPayload; back: () => void; next: () => void }) {
  const checks = payload.verification.checks
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (shown >= checks.length) return
    const t = setTimeout(() => setShown((s) => s + 1), 450)
    return () => clearTimeout(t)
  }, [shown, checks.length])
  const done = shown >= checks.length
  const review = checks.some((c) => c.result === "needs_review")

  return (
    <Step title="Verifying your identity" help="These checks run automatically. Most clear in seconds; anything unusual goes to a person to review, which takes longer but doesn't stop your application here.">
      <ul className="divide-y divide-rule rounded-lg border border-rule bg-surface" aria-live="polite">
        {checks.map((c, i) => {
          const visible = i < shown
          const Icon = !visible ? Loader2 : c.result === "pass" ? CheckCircle2 : c.result === "needs_review" ? AlertTriangle : XCircle
          return (
            <li key={c.id} className="flex gap-3 px-4 py-3 text-sm">
              <Icon
                aria-hidden
                className={cn("mt-0.5 size-4 shrink-0", !visible ? "animate-spin text-muted-ink" : c.result === "pass" ? "text-approve" : c.result === "needs_review" ? "text-conditions" : "text-decline")}
              />
              <div>
                <p className="font-medium">{CHECK_LABELS[c.kind]}</p>
                <p className="text-muted-ink">{visible ? (c.result === "pass" ? "Cleared automatically." : c.reasons.join(" ")) : "Checking…"}</p>
              </div>
            </li>
          )
        })}
      </ul>
      {done && (
        <p className="mt-4 text-sm" role="status">
          {review
            ? "One check needs a person to review it. It's been sent to the verification queue; you can continue, and nothing will be funded until it's cleared."
            : "All checks cleared automatically."}
        </p>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-ink">
        <Illustrative label="Simulated checks" why="Simulated on synthetic data against a fictional watch list and registry. No real identity service is used." />
      </p>
      <Nav back={back} next={next} disabled={!done} />
    </Step>
  )
}

function RequestStep({
  kind,
  request,
  onChange,
  back,
  next,
}: {
  kind: "personal" | "business"
  request: CreditRequest
  onChange: (r: CreditRequest) => void
  back: () => void
  next: () => void
}) {
  const products: readonly ProductType[] = kind === "business" ? BUSINESS_PRODUCTS : PERSONAL_PRODUCTS
  const [dollars, setDollars] = useState(String(request.amountCents / 100))
  const amount = Math.round(Number(dollars) * 100)
  const valid = Number.isFinite(amount) && amount >= 50_000 && amount <= 100_000_000
  const needsTerm = TERM_PRODUCTS.has(request.product)

  return (
    <Step title="What would you like to borrow?" help="Change the product or amount to see how each lender's answer changes. Amounts can be from $500 to $1,000,000.">
      <div className="grid max-w-xl gap-4">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Product</span>
          <select
            value={request.product}
            onChange={(e) => {
              const product = e.target.value as ProductType
              onChange({ ...request, product, termMonths: TERM_PRODUCTS.has(product) ? (request.termMonths ?? 36) : undefined })
            }}
            className="rounded-md border border-rule bg-surface px-3 py-2"
          >
            {products.map((p) => (
              <option key={p} value={p}>
                {PRODUCT_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Amount (CAD)</span>
          <input
            inputMode="numeric"
            value={dollars}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d.]/g, "")
              setDollars(v)
              const cents = Math.round(Number(v) * 100)
              if (Number.isFinite(cents) && cents >= 50_000 && cents <= 100_000_000) onChange({ ...request, amountCents: cents })
            }}
            aria-invalid={!valid}
            aria-describedby="amount-help"
            className="num rounded-md border border-rule bg-surface px-3 py-2"
          />
          <span id="amount-help" className={cn("text-xs", valid ? "text-muted-ink" : "text-decline")}>
            {valid ? formatCents(amount, { whole: true }) : "Enter an amount from $500 to $1,000,000."}
          </span>
        </label>
        {needsTerm && (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Term</span>
            <select value={request.termMonths ?? 36} onChange={(e) => onChange({ ...request, termMonths: Number(e.target.value) })} className="rounded-md border border-rule bg-surface px-3 py-2">
              {TERMS.map((t) => (
                <option key={t} value={t}>
                  {t} months
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <Nav back={back} next={next} disabled={!valid} />
    </Step>
  )
}
