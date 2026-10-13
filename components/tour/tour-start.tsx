"use client"

import { ArrowRight, RotateCcw } from "lucide-react"
import { TOUR_STEPS } from "@/content/tour"
import { buttonVariants } from "@/components/ui/button"
import { useTourNav } from "./tour-bar"
import { useTour } from "./tour-store"

/** Start the guided tour, or resume one that was closed part-way. */
export function TourStart() {
  const tour = useTour()
  const go = useTourNav()
  const resumable = tour && tour.status !== "done" && tour.step > 0 ? tour.step : null
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      {resumable !== null ? (
        <>
          <button type="button" onClick={() => go(resumable)} className={buttonVariants({ size: "md" })}>
            Resume the tour at step {resumable + 1} of {TOUR_STEPS.length}
            <ArrowRight aria-hidden className="size-4" />
          </button>
          <button type="button" onClick={() => go(0)} className={buttonVariants({ variant: "secondary", size: "md" })}>
            <RotateCcw aria-hidden className="size-4" />
            Start over
          </button>
        </>
      ) : (
        <button type="button" onClick={() => go(0)} className={buttonVariants({ size: "md" })}>
          Take the 3-minute tour
          <ArrowRight aria-hidden className="size-4" />
        </button>
      )}
    </div>
  )
}
