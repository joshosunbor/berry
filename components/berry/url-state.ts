"use client"

import { useCallback, useSyncExternalStore } from "react"

/*
 * Linkable tabs without useSearchParams: pages stay fully prerendered with
 * their default tab, and the URL's ?tab= (or #hash) takes over once the page
 * is in the browser. The router changes the URL through history.pushState and
 * replaceState, so those are wrapped once to announce every change.
 */

const EVENT = "berry:location"
let patched = false

function patchHistory() {
  if (patched || typeof window === "undefined") return
  patched = true
  for (const k of ["pushState", "replaceState"] as const) {
    const original = window.history[k].bind(window.history)
    window.history[k] = (...args: Parameters<History["pushState"]>) => {
      original(...args)
      window.dispatchEvent(new Event(EVENT))
    }
  }
}

function subscribe(cb: () => void) {
  patchHistory()
  window.addEventListener("popstate", cb)
  window.addEventListener("hashchange", cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener("popstate", cb)
    window.removeEventListener("hashchange", cb)
    window.removeEventListener(EVENT, cb)
  }
}

export function useLocationSearch(): string {
  return useSyncExternalStore(subscribe, () => window.location.search, () => "")
}

export function useLocationHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => "")
}

/** Sets or clears one query parameter without a navigation, keeping the hash. */
export function setSearchParam(key: string, value: string | null) {
  const url = new URL(window.location.href)
  if (value === null) url.searchParams.delete(key)
  else url.searchParams.set(key, value)
  window.history.replaceState(window.history.state, "", url)
}

/**
 * A tab kept in the URL as ?key=id. The first id is the default and is left
 * out of the URL. Unknown values fall back to the default.
 */
export function useUrlTab<T extends string>(ids: readonly T[], key = "tab"): [T, (id: T) => void] {
  const search = useLocationSearch()
  const q = new URLSearchParams(search).get(key) as T | null
  const tab = q && ids.includes(q) ? q : ids[0]
  const select = useCallback((id: T) => setSearchParam(key, id === ids[0] ? null : id), [ids, key])
  return [tab, select]
}
