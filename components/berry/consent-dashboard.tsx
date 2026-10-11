"use client"

import Link from "next/link"
import { useState } from "react"
import { Illustrative, Source } from "@/components/berry/illustrative"
import { CONSENT_RULES, consentState, DATA_CATEGORY_LABELS, revoke } from "@/lib/onboarding/consent"
import { saveConsents, useConsentStore } from "@/lib/onboarding/store"
import { cn } from "@/lib/utils"

const date = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })
const time = (iso: string) => new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })

export function ConsentDashboard() {
  const store = useConsentStore()
  const [now, setNow] = useState<string | null>(null)

  // The store is undefined during the server render, so the clock is only read in the browser.
  if (!store) return <p className="text-sm text-muted-ink">Loading…</p>
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
      <div className="rounded-lg border border-rule bg-surface p-6">
        <p className="font-medium">No consents yet.</p>
        <p className="mt-1 text-sm text-muted-ink">When you share data during an application, each consent appears here with its expiry date and a revoke button.</p>
        <Link href="/apply" className="mt-4 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-medium text-background">
          Start an application
        </Link>
      </div>
    )
  }

  const tone = { active: "bg-approve-soft text-approve", expired: "bg-refer-soft text-refer", revoked: "bg-decline-soft text-decline" }
  const sorted = [...store.consents].sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))

  return (
    <div className="space-y-8">
      <ul className="space-y-4">
        {sorted.map((c) => {
          const state = consentState(c, at)
          return (
            <li key={c.id} className="rounded-lg border border-rule bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{c.recipient}</p>
                  <p className="mt-0.5 text-sm text-muted-ink">{c.purpose}</p>
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", tone[state])}>{state}</span>
              </div>
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-ink">Granted</dt>
                  <dd className="num">{date(c.grantedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-ink">{state === "revoked" ? "Revoked" : state === "expired" ? "Expired" : "Expires"}</dt>
                  <dd className="num">{date(state === "revoked" ? c.revokedAt! : c.expiresAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-ink">Data shared</dt>
                  <dd>{c.dataCategories.map((d) => DATA_CATEGORY_LABELS[d].split(" (")[0]).join(", ")}</dd>
                </div>
              </dl>
              {state === "active" && (
                <button
                  type="button"
                  onClick={() => doRevoke(c.id)}
                  className="mt-4 rounded-md border border-decline/40 px-3 py-1.5 text-sm text-decline hover:bg-decline-soft"
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
        <ol className="mt-3 divide-y divide-rule rounded-lg border border-rule bg-surface text-sm">
          {[...store.events].reverse().map((e, i) => (
            <li key={`${e.consentId}-${e.at}-${i}`} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
              <span>
                <span className="font-medium capitalize">{e.type.replace("_", " ")}</span> <span className="text-muted-ink">{e.detail}</span>
              </span>
              <span className="num text-muted-ink">{time(e.at)}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex items-start gap-2 text-xs text-muted-ink">
        <Illustrative label="Simulated" why="Consents live only in this browser. No data is shared with anyone." />
        <p className="leading-5">
          Consent lasts at most {CONSENT_RULES.maxMonths} months (<Source href={CONSENT_RULES.source}>Consumer-Driven Banking Act, s. 86</Source>, not yet in force). Revoking is free and stops sharing immediately.
        </p>
      </div>
    </div>
  )
}
