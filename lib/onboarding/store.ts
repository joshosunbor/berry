"use client"

import { useMemo, useSyncExternalStore } from "react"
import type { Consent, ConsentEvent, CreditRequest } from "@/lib/schemas"

/*
 * Browser-only storage for the /apply demo: a saved application (save and
 * resume) and simulated consents with their event log. Nothing leaves this
 * browser. Every read and write tolerates storage being unavailable.
 */

const APP_KEY = "berry.application.v1"
const CONSENT_KEY = "berry.consents.v1"

export type ApplyStep = "profile" | "about" | "consent" | "verification" | "request" | "review" | "submitted"

export interface SavedApplication {
  slug: string | null
  step: ApplyStep
  lenders: { credit_union: boolean; fintech: boolean; bank: boolean }
  request: CreditRequest | null
  savedAt: string
}

export interface ConsentStore {
  consents: Consent[]
  events: ConsentEvent[]
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

function rawItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Reads a stored JSON value and re-renders when it changes. The server
 * render (and first paint) sees `undefined`; the stored value applies
 * after hydration.
 */
function useStored<T>(key: string, fallback: T): T | undefined {
  const raw = useSyncExternalStore(subscribe, () => rawItem(key) ?? "", () => null)
  return useMemo(() => {
    if (raw === null) return undefined
    if (raw === "") return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
    // fallback is a constant at each call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw])
}

const NO_CONSENTS: ConsentStore = { consents: [], events: [] }
export const useSavedApplication = () => useStored<SavedApplication | null>(APP_KEY, null)
export const useConsentStore = () => useStored<ConsentStore>(CONSENT_KEY, NO_CONSENTS)

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: the demo still works for this visit */
  }
  notify()
}

export const loadApplication = () => read<SavedApplication | null>(APP_KEY, null)
export const saveApplication = (a: SavedApplication) => write(APP_KEY, a)
export const clearApplication = () => {
  try {
    localStorage.removeItem(APP_KEY)
  } catch {
    /* ignore */
  }
  notify()
}

export const loadConsents = () => read<ConsentStore>(CONSENT_KEY, { consents: [], events: [] })
export const saveConsents = (s: ConsentStore) => write(CONSENT_KEY, s)

/** Adds or replaces consents (by id) and appends their events. */
export function recordConsents(consents: Consent[], events: ConsentEvent[]) {
  const store = loadConsents()
  const ids = new Set(consents.map((c) => c.id))
  saveConsents({ consents: [...store.consents.filter((c) => !ids.has(c.id)), ...consents], events: [...store.events, ...events] })
}
