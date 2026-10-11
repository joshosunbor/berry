"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import type { PolicyCase } from "@/lib/ops/policy"
import type { ActionResult, UserAction } from "@/lib/ops/view"

/*
 * The Policy tab, loaded on first open: the panel's code (which runs the
 * decision engine in the browser) and the impact-preview cases are fetched
 * only then, so the rest of the console stays light.
 */

const PolicyPanel = dynamic(() => import("@/components/berry/policy-panel").then((m) => m.PolicyPanel), {
  loading: () => <p className="text-sm text-muted-ink">Loading the policy tools…</p>,
})

let cache: Promise<PolicyCase[]> | null = null
const loadCases = () => (cache ??= fetch("/api/policy-cases").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))))

export function LazyPolicyPanel(props: { actions: UserAction[]; actor: string; now: string; record: (r: ActionResult) => void }) {
  const [cases, setCases] = useState<PolicyCase[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loadCases().then(
      (c) => live && setCases(c),
      () => {
        cache = null
        if (live) setError("The policy cases couldn't be loaded. Reload the page to try again.")
      },
    )
    return () => {
      live = false
    }
  }, [])
  if (error) return <p role="alert" className="text-sm text-decline">{error}</p>
  if (!cases) return <p className="text-sm text-muted-ink">Loading the policy cases…</p>
  return <PolicyPanel cases={cases} {...props} />
}
