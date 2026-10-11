"use client"

import { useMemo, useSyncExternalStore } from "react"
import { z } from "zod"
import { OPS_MOMENTS, OPS_START } from "@/lib/ops/moments"
import type { UserAction } from "@/lib/ops/view"
import { SubjectRef } from "@/lib/schemas"

/*
 * Browser-only state for the operations console: the simulated moment, who
 * you're acting as, and the actions you've taken. Nothing leaves this
 * browser. Every read and write tolerates storage being unavailable, and
 * saved actions that don't parse are ignored.
 */

const ACTIONS_KEY = "berry.opsActions.v1"
const MOMENT_KEY = "berry.opsMoment.v1"
const ACTOR_KEY = "berry.opsActor.v1"
export const DEFAULT_ACTOR = "usr_rivera"

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

function get(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function set(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
  notify()
}

const Input = z.object({
  at: z.string(),
  actor: z.object({ kind: z.enum(["user", "system", "engine"]), id: z.string() }),
  action: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
  subject: SubjectRef,
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  reason: z.string().optional(),
})
const Action = z.object({
  itemId: z.string().nullable(),
  at: z.string(),
  kind: z.enum(["assigned", "prepared", "approved", "escalated", "rejected", "blocked", "completed", "message_sent", "memo_approved"]),
  by: z.string(),
  ownerId: z.string().optional(),
  request: z.any().optional(),
  events: z.array(Input),
})

function parseActions(raw: string | null): UserAction[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.flatMap((a) => {
      const r = Action.safeParse(a)
      return r.success ? [r.data as UserAction] : []
    })
  } catch {
    return []
  }
}

export function useOpsActions(): UserAction[] {
  const raw = useSyncExternalStore(subscribe, () => get(ACTIONS_KEY), () => null)
  return useMemo(() => parseActions(raw), [raw])
}

export function addOpsAction(action: UserAction) {
  set(ACTIONS_KEY, JSON.stringify([...parseActions(get(ACTIONS_KEY)), action]))
}

export function resetOpsActions() {
  set(ACTIONS_KEY, null)
}

const VALID_MOMENTS = new Set<string>(OPS_MOMENTS.map((m) => m.at))

export function useOpsMoment(): string {
  return useSyncExternalStore(
    subscribe,
    () => {
      const v = get(MOMENT_KEY)
      return v && VALID_MOMENTS.has(v) ? v : OPS_START
    },
    () => OPS_START,
  )
}

export const setOpsMoment = (at: string) => set(MOMENT_KEY, at)

export function useActor(validIds: string[]): string {
  return useSyncExternalStore(
    subscribe,
    () => {
      const v = get(ACTOR_KEY)
      return v && validIds.includes(v) ? v : DEFAULT_ACTOR
    },
    () => DEFAULT_ACTOR,
  )
}

export const setActor = (id: string) => set(ACTOR_KEY, id)
