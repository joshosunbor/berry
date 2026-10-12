"use client"

import Link from "next/link"
import { useState } from "react"
import { Illustrative, Source } from "@/components/berry/illustrative"
import { CONSENT_RULES, consentState, DATA_CATEGORY_LABELS, revoke } from "@/lib/onboarding/consent"
import { saveConsents, useConsentStore } from "@/lib/onboarding/store"
import { cn } from "@/lib/utils"
import { pillVariants } from "@/components/ui/pill"
import { buttonVariants } from "@/components/ui/button"

const date = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })
const time = (iso: string) => new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })

export function ConsentDashboard() {
  const store = useConsentStore()
  const [now, setNow] = useState<string | null>(null)

  // The store is undefined during the server render, so the clock is only read in the browser.
  if (!store) return <p className="text-sm text-fg-3">Loading…</p>
  const at = now ?? new Date().toISOString()

  const doRevoke = (id: string) => {
    const at = new Date().toISOString()
    const c = store.consents.find((x) => x.id === id)!
    const { consent, event } = revoke(c, at)
    saveConsents({ consents: store.consents.map((x) => (x.id === id ? consent : x)), events: [...store.events, event] })
    setNow(at)
  }

  if (!store.consents.length) {
    return (
      <div className="rounded-[14px] bg-panel shadow-card p-6">
        <p className="font-medium">No consents yet.</p>
        <p className="mt-1 text-sm text-fg-3">When you share data during an application, each consent appears here with its expiry date and a revoke button.</p>
        <Link href="/apply" className={cn(buttonVariants({ size: "sm" }), "mt-4")}>
          Start an application
        </Link>
      </div>
    )
  }

  const tone = { active: "bg-green-tint text-green-ink", expired: "bg-field text-fg-2", revoked: "bg-bad-tint text-bad" }
  const sorted = [...store.consents].sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))

  return (
    <div className="space-y-8">
      <ul className="space-y-4">
        {sorted.map((c) => {
          const state = consentState(c, at)
          return (
            <li key={c.id} className="rounded-[14px] bg-panel shadow-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{c.recipient}</p>
                  <p className="mt-0.5 text-sm text-fg-3">{c.purpose}</p>
                </div>
                <span className={cn(pillVariants(), "font-medium capitalize", tone[state])}>{state}</span>
              </div>
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-fg-3">Granted</dt>
                  <dd className="num">{date(c.grantedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-3">{state === "revoked" ? "Revoked" : state === "expired" ? "Expired" : "Expires"}</dt>
                  <dd className="num">{date(state === "revoked" ? c.revokedAt! : c.expiresAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-3">Data shared</dt>
                  <dd>{c.dataCategories.map((d) => DATA_CATEGORY_LABELS[d].split(" (")[0]).join(", ")}</dd>
                </div>
              </dl>
              {state === "active" && (
                <button
                  type="button"
                  onClick={() => doRevoke(c.id)}
                  className={cn(buttonVariants({ variant: "secondary", size: "xs" }), "mt-4 text-bad hover:bg-bad-tint hover:text-bad")}
                  aria-label={`Revoke consent for ${c.recipient}`}
                >
                  Revoke
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <section aria-labelledby="log">
        <h2 id="log" className="font-semibold">
          Consent log
        </h2>
        <ol className="mt-3 divide-y divide-line rounded-[14px] bg-panel shadow-card text-sm">
          {[...store.events].reverse().map((e, i) => (
            <li key={`${e.consentId}-${e.at}-${i}`} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
              <span>
                <span className="font-medium capitalize">{e.type.replace("_", " ")}</span> <span className="text-fg-3">{e.detail}</span>
              </span>
              <span className="num text-fg-3">{time(e.at)}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex items-start gap-2 text-xs text-fg-3">
        <Illustrative label="Simulated" why="Consents live only in this browser. No data is shared with anyone." />
        <p className="leading-5">
          Consent lasts at most {CONSENT_RULES.maxMonths} months (<Source href={CONSENT_RULES.source}>Consumer-Driven Banking Act, s. 86</Source>, not yet in force). Revoking is free and stops sharing immediately.
        </p>
      </div>
    </div>
  )
}
