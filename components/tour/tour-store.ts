"use client"

import { useSyncExternalStore } from "react"
import { TOUR_STEPS } from "@/content/tour"

/*
 * Tour progress, kept in this browser so a tour can be resumed. Browser
 * storage can be unavailable (private windows, blocked site data): the tour
 * still works for the visit, it just isn't remembered.
 */

export interface TourState {
  status: "active" | "dismissed" | "done"
  step: number
}

const KEY = "berry.tour.v1"
const listeners = new Set<() => void>()
let memory: TourState | null = null
let cachedRaw: string | null | undefined
let cached: TourState | null = null

function read(): TourState | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return memory
  }
  if (raw === cachedRaw) return cached
  cachedRaw = raw
  try {
    const v = raw ? (JSON.parse(raw) as TourState) : null
    cached = v && ["active", "dismissed", "done"].includes(v.status) && Number.isInteger(v.step) && v.step >= 0 && v.step < TOUR_STEPS.length ? v : null
  } catch {
    cached = null
  }
  return cached
}

function write(v: TourState | null) {
  memory = v
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: kept in memory for this visit */
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

export function useTour(): TourState | null {
  return useSyncExternalStore(subscribe, read, () => null)
}

export const setTour = write
