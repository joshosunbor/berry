import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, BookOpen, Route } from "lucide-react"
import { APP_SECTIONS, SECTION_ICON } from "@/components/site/app-nav"
import { TourStart } from "@/components/tour/tour-start"
import { Card } from "@/components/ui/card"
import { PageContainer, PageHeader } from "@/components/ui/page-header"
import { TOUR_STEPS } from "@/content/tour"

export const metadata: Metadata = {
  title: "Try the live demo",
  description: "Take a three-minute guided tour of one loan from application to the back office, or explore Berry's four sections on your own.",
}

export default function DemoPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Try the live demo"
        lead="Fictional lenders, synthetic applicants, nothing to sign up for. Follow one loan from start to finish, or go straight to the part you care about."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card as="section" pad="lg" aria-labelledby="tour-h" className="self-start">
          <Route aria-hidden className="size-6 text-green-ink" />
          <h2 id="tour-h" className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
            Take the 3-minute tour
          </h2>
          <p className="mt-2 leading-7 text-fg-2">
            Follow Hollis Family Farm, a grain farm asking for a seasonal line, through {TOUR_STEPS.length} steps. Each one opens the real page and points at
            what to notice.
          </p>
          <ol className="mt-4 space-y-1.5 text-sm text-fg-2">
            {TOUR_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-2.5">
                <span className="num w-5 shrink-0 text-fg-3">{i + 1}.</span>
                {s.title}
              </li>
            ))}
          </ol>
          <TourStart />
          <p className="mt-3 text-xs text-fg-3">Use Back and Next in the bar at the top. Esc closes the tour; come back here to resume it.</p>
        </Card>

        <section aria-labelledby="explore-h">
          <h2 id="explore-h" className="text-2xl font-semibold tracking-[-0.02em]">
            Explore on your own
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {APP_SECTIONS.map((s) => {
              const Icon = SECTION_ICON[s.id]
              return (
                <li key={s.id}>
                  <Link href={s.href} className="group block h-full rounded-[14px] bg-panel p-5 shadow-card transition-[box-shadow] hover:shadow-lift">
                    <Icon aria-hidden className="size-5 text-green-ink" />
                    <span className="mt-3 flex items-center gap-1.5 text-lg font-semibold text-fg">
                      {s.label}
                      <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                    </span>
                    <span className="mt-1.5 block text-sm leading-6 text-fg-2">{s.blurb}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <Link href="/how-it-works" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-fg-2 hover:text-fg">
            <BookOpen aria-hidden className="size-4" />
            How it works: the rules, the test results and the Canadian rules Berry follows
          </Link>
        </section>
      </div>
    </PageContainer>
  )
}
