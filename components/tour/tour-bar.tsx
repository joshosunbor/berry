"use client"

import { useCallback, useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, X } from "lucide-react"
import { setClock } from "@/components/berry/clock"
import { setOpsMoment } from "@/components/berry/ops-store"
import { useLocationSearch } from "@/components/berry/url-state"
import { TOUR_STEPS } from "@/content/tour"
import { setTour, useTour } from "./tour-store"

/** Moves the tour to a step: sets the simulated clock or ops moment it needs, then opens its page. */
export function useTourNav() {
  const router = useRouter()
  return useCallback(
    (step: number) => {
      const s = TOUR_STEPS[step]
      setTour({ status: "active", step })
      if (s.clock) setClock(s.clock)
      if (s.opsMoment) setOpsMoment(s.opsMoment)
      router.push(s.href)
    },
    [router],
  )
}

/**
 * The tour's slim bar under the app header: "Tour · Step N of 6", Back,
 * Next and close. The step's sentence is announced to screen readers. Esc
 * closes the tour; it can be resumed from /demo.
 */
export function TourBar({ placement = "header" }: { placement?: "header" | "bottom" }) {
  const tour = useTour()
  const go = useTourNav()
  const active = tour?.status === "active"
  const step = tour?.step ?? 0
  const s = TOUR_STEPS[step]
  const last = step === TOUR_STEPS.length - 1
  const close = useCallback(() => setTour({ status: "dismissed", step }), [step])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [active, close])

  // Phones: the bar is pinned above the tab bar, so the page gets that much
  // room at the bottom (its measured height) and the last content is never covered.
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (placement !== "bottom" || !active || !ref.current) return
    const root = document.documentElement
    const el = ref.current
    const set = () => root.style.setProperty("--tour-bar-h", `${el.offsetHeight}px`)
    set()
    root.dataset.tour = "on"
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => {
      ro.disconnect()
      delete root.dataset.tour
      root.style.removeProperty("--tour-bar-h")
    }
  }, [active, placement])

  if (!active) return null
  return (
    <div
      ref={ref}
      role="region"
      aria-label="Guided tour"
      className={
        placement === "header"
          ? "hidden border-t border-navy-line bg-navy-raised text-white md:block"
          : "fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-30 border-t border-navy-line bg-navy-raised text-white shadow-lift md:hidden"
      }
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-1.5 px-[clamp(16px,3vw,32px)] py-2 text-sm">
        <p className="font-medium">
          Tour <span aria-hidden>·</span> <span className="num">Step {step + 1} of {TOUR_STEPS.length}</span>
          <span className="text-on-navy"> · {s.title}</span>
        </p>
        <p aria-live="polite" className="order-last line-clamp-3 w-full text-[13px] leading-5 text-on-navy md:order-none md:line-clamp-none md:w-auto md:flex-1">
          {s.text}
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            className="inline-flex min-h-9 items-center gap-1 rounded-md px-2.5 font-medium text-on-navy hover:text-white disabled:opacity-40"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back
          </button>
          <button
            type="button"
            onClick={() => (last ? setTour({ status: "done", step }) : go(step + 1))}
            className="inline-flex min-h-9 items-center gap-1 rounded-md bg-green-bright px-3 font-semibold text-navy hover:brightness-105"
          >
            {last ? "Finish" : "Next"}
            {!last && <ArrowRight aria-hidden className="size-4" />}
          </button>
          <button type="button" onClick={close} aria-label="Close the tour (Esc). You can resume it from the demo start page." className="inline-flex size-9 items-center justify-center rounded-md text-on-navy hover:text-white">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Outlines the area the current step is about, once it's on screen (some
 * areas load after the page), and scrolls it into view. Focus stays on the
 * tour bar so Next can be pressed again; the step's sentence is announced.
 */
export function TourHighlight() {
  const tour = useTour()
  const pathname = usePathname()
  const search = useLocationSearch()
  const active = tour?.status === "active"
  const step = TOUR_STEPS[tour?.step ?? 0]
  const onPage = active && pathname === step.href.split("?")[0]

  useEffect(() => {
    if (!onPage) return
    if (step.clock) setClock(step.clock)
    if (step.opsMoment) setOpsMoment(step.opsMoment)
  }, [onPage, step])

  useEffect(() => {
    if (!onPage) return
    let el: HTMLElement | null = null
    let tries = 0
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const find = window.setInterval(() => {
      // Inside a hidden tab panel the area isn't on screen yet; wait for the visible one.
      el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)].find((x) => x.offsetParent !== null) ?? null
      if (el || ++tries > 40) {
        window.clearInterval(find)
        if (!el) return
        el.setAttribute("data-tour-active", "")
        el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" })
      }
    }, 75)
    return () => {
      window.clearInterval(find)
      document.querySelectorAll("[data-tour-active]").forEach((x) => x.removeAttribute("data-tour-active"))
    }
  }, [onPage, step.target, search])
  return null
}
