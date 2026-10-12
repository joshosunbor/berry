import type { Metadata } from "next"
import Link from "next/link"
import { Banknote, CalendarCheck, ListChecks, Scale } from "lucide-react"
import { Comparison } from "@/components/landing/comparison"
import { Faq } from "@/components/landing/faq"
import { Lifecycle } from "@/components/landing/lifecycle"
import { Tour } from "@/components/landing/tour"
import { ApplicantFilePanel, ComparePanel, ServicingPanel } from "@/components/landing/tour-panels"
import { BUILT, CANADA, CHECKS, CONTACT, FAQ, HERO, LIFECYCLE, LIVE_DEMO, OPS, PILOT, PLUG_IN, TOOLS } from "@/content/landing"
import { landingData } from "@/lib/landing/data"
import type { SlaState } from "@/lib/ops/queues"
import { cn } from "@/lib/utils"

/*
 * Landing page (design/design_handoff_berry_landing, v5), as a hybrid
 * concept page: Berry is a working portfolio project. Copy comes from
 * content/landing.ts; every figure from lib/landing/data.ts.
 */

export const metadata: Metadata = {
  title: "Berry · Approve the borrowers a credit score misses",
  description:
    "A working portfolio project: cash-flow lending decisions explained in plain language, three fictional lenders side by side, and the loan run through funding, collections and reconciliation. Synthetic data.",
}

const ICONS = { Scale, Banknote, CalendarCheck, ListChecks } as const
const SLA_INK: Partial<Record<SlaState, string>> = { breached: "text-lp-sla-red", at_risk: "text-lp-sla-amber", on_time: "text-lp-green-bright" }
const SLA_DOT: Partial<Record<SlaState, string>> = { breached: "bg-lp-sla-red", at_risk: "bg-lp-sla-amber", on_time: "bg-lp-green-bright" }

const section = "mx-auto max-w-[1160px] px-[clamp(20px,4vw,40px)]"
const h2 = "text-[clamp(32px,4vw,48px)] font-bold leading-[1.05] tracking-[-0.03em]"
const primary = "inline-flex min-h-12 items-center rounded-lg bg-lp-green px-[22px] font-semibold text-white transition-colors hover:bg-lp-green-hover hover:text-white"

export default function Home() {
  const d = landingData()
  const maxRail = Math.max(...d.railTimes.map((r) => r.minutes))
  // Log scale, so minutes and a day can share one bar chart; values are printed beside each bar.
  const railWidth = (m: number) => `${Math.max(4, Math.round((Math.log1p(m) / Math.log1p(maxRail)) * 100))}%`

  return (
    <main>
      {/* Hero */}
      <section id="top" className="bg-[linear-gradient(to_top,var(--color-lp-page)_0_180px,var(--color-lp-navy)_180px)]">
        <div className={cn(section, "pt-[clamp(48px,7vw,96px)]")}>
          <p className="mb-5 text-[15px] font-semibold text-lp-green-bright">{HERO.eyebrow}</p>
          <h1 className="max-w-[15ch] text-[clamp(40px,6vw,80px)] font-bold leading-[1.02] tracking-[-0.035em] text-white">
            {HERO.title}
            <span className="text-lp-cyan-on-navy">{HERO.titleAccent}</span>
          </h1>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-x-14 gap-y-7">
            <p className="max-w-[44ch] text-xl leading-normal text-lp-on-navy">{HERO.lead}</p>
            <Link href={LIVE_DEMO.href} className={primary}>
              {LIVE_DEMO.label}
            </Link>
          </div>
          <p className="mt-4 text-sm text-lp-muted-on-navy">{HERO.note}</p>
          <Comparison data={d} />
        </div>
      </section>

      {/* Four tools */}
      <section aria-labelledby="suite-h" className={cn(section, "pt-28")}>
        <h2 id="suite-h" className={cn(h2, "max-w-[18ch]")}>
          {TOOLS.title}
        </h2>
        <p className="mt-3.5 max-w-[52ch] text-lp-text-2">{TOOLS.lead}</p>
        <div className="mt-10 grid grid-cols-1 gap-4 tablet:grid-cols-2 wide:grid-cols-4">
          {TOOLS.cards.map((c) => {
            const Icon = ICONS[c.icon]
            return (
              <Link
                key={c.name}
                href={c.href}
                className="flex flex-col gap-3.5 rounded-[14px] bg-lp-surface p-7 text-lp-navy shadow-lp-card transition-[transform,box-shadow] duration-[180ms] ease-out hover:-translate-y-1 hover:text-lp-navy hover:shadow-lp-lift"
              >
                <span aria-hidden className={cn("grid size-12 place-items-center rounded-xl", c.tint === "green" ? "bg-lp-green-tint" : "bg-lp-cyan-tint")}>
                  <Icon className={cn("size-6", c.tint === "green" ? "text-lp-green-ink" : "text-lp-cyan-ink")} strokeWidth={2} />
                </span>
                <span className="text-xl font-semibold tracking-[-0.015em]">{c.name}</span>
                <span className="text-[15px] leading-normal text-lp-text-2">{c.copy}</span>
                <span className="mt-auto text-[15px] font-semibold text-lp-cyan-ink">{c.link}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Lifecycle */}
      <section id="loan" aria-labelledby="loan-h" className={cn(section, "scroll-mt-10 pt-32")}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-end gap-x-16 gap-y-4">
          <h2 id="loan-h" className={cn(h2, "max-w-[15ch]")}>
            {LIFECYCLE.title}
          </h2>
          <p className="max-w-[46ch] text-lp-text-2">{LIFECYCLE.lead}</p>
        </div>
        <Lifecycle />
      </section>

      {/* Product tour */}
      <section id="tour" aria-labelledby="tour-h" className={cn(section, "scroll-mt-[60px] pt-32")}>
        <Tour panels={[<ApplicantFilePanel key="file" d={d} />, <ComparePanel key="compare" d={d} />, <ServicingPanel key="servicing" d={d} />]} />
      </section>

      {/* Operations */}
      <section id="ops" aria-labelledby="ops-h" className="mt-32 bg-lp-navy text-lp-on-navy">
        <div className={cn(section, "py-[clamp(72px,9vw,112px)]")}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-end gap-x-16 gap-y-4">
            <h2 id="ops-h" className={cn(h2, "max-w-[16ch] text-white")}>
              {OPS.title}
            </h2>
            <p className="max-w-[48ch]">{OPS.lead}</p>
          </div>
          <div className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-5">
            <div className="min-w-0 self-start overflow-hidden rounded-[14px] bg-lp-navy-raised shadow-[0_0_0_1px_var(--color-lp-navy-line)]">
              <div className="flex flex-wrap justify-between gap-3 border-b border-lp-navy-line px-5 py-3.5 text-sm">
                <span className="font-semibold text-white">{OPS.queueTitle}</span>
                <span className="text-lp-muted-on-navy">
                  {d.queue.atText} · {d.queue.openCount} open · sorted by SLA
                </span>
              </div>
              <ul>
                {d.queue.rows.map((q) => (
                  <li key={q.title} className="grid grid-cols-1 gap-x-4 gap-y-0.5 border-b border-lp-navy-line px-5 py-3.5 tablet:grid-cols-[minmax(0,1fr)_auto]">
                    <span className="text-[15px] font-medium text-white">{q.title}</span>
                    <span className={cn("row-start-3 inline-flex items-center gap-1.5 justify-self-start font-mono text-[13px] tablet:row-start-auto tablet:justify-self-end", SLA_INK[q.sla])}>
                      <span aria-hidden className={cn("size-[7px] rounded-full", SLA_DOT[q.sla])} />
                      {q.left}
                    </span>
                    <span className="text-[13px] text-lp-muted-on-navy">
                      {q.queue} · {q.owner}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="m-3.5 rounded-[10px] bg-lp-page px-4 py-3.5 text-sm leading-normal text-lp-navy">
                <strong className="font-semibold">{OPS.makerChecker.strong}</strong>
                {OPS.makerChecker.rest}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              <div className="rounded-[14px] bg-lp-navy-raised p-5 shadow-[0_0_0_1px_var(--color-lp-navy-line)]">
                <p className="text-sm font-semibold text-white">{OPS.fundingTitle}</p>
                <p className="mt-0.5 text-[13px] text-lp-muted-on-navy">{OPS.fundingCaption.replace("{n}", String(d.railTimes.reduce((t, r) => t + r.loans, 0)))}</p>
                <dl className="mt-4 grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-3 text-sm">
                  {d.railTimes.map((r) => (
                    <div key={r.rail} className="contents">
                      <dt>{r.label}</dt>
                      <dd aria-hidden className="h-2">
                        <span className={cn("block h-2 rounded", r.rail === "aft" ? "bg-lp-navy-line-strong" : r.rail === "etransfer" ? "bg-lp-cyan" : "bg-lp-green-bright")} style={{ width: railWidth(r.minutes) }} />
                      </dd>
                      <dd className="font-mono text-white">{r.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-[13px] text-lp-muted-on-navy">{OPS.fundingNote}</p>
              </div>
              <ul className="flex flex-col">
                {OPS.rules.map((r, i) => (
                  <li key={r.strong} className={cn("border-t border-lp-navy-line py-4", i === OPS.rules.length - 1 && "border-b")}>
                    <strong className="font-semibold text-white">{r.strong}</strong> {r.rest ?? d.policyQuote}
                  </li>
                ))}
              </ul>
              <Link href={OPS.button.href} className="inline-flex min-h-[46px] items-center self-start rounded-lg bg-white px-5 font-semibold text-lp-navy hover:text-lp-navy">
                {OPS.button.label}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it would plug in, and Built for Canada */}
      <section className={cn(section, "pt-32")}>
        <div id="integration" className="grid scroll-mt-[90px] grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-x-16 gap-y-8 pb-32">
          <div>
            <p className="mb-3 inline-block rounded-full bg-lp-cyan-tint px-2.5 py-0.5 font-mono text-xs text-lp-cyan-ink">{PLUG_IN.label}</p>
            <h2 className={cn(h2, "max-w-[13ch]")}>{PLUG_IN.title}</h2>
            <p className="mt-4 max-w-[40ch] text-lp-text-2">{PLUG_IN.lead}</p>
          </div>
          <dl className="border-t border-lp-line-strong">
            {PLUG_IN.rows.map((g) => (
              <div key={g.t} className="grid grid-cols-1 gap-x-6 gap-y-1 border-b border-lp-line-strong py-4 tablet:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
                <dt className="font-semibold">{g.t}</dt>
                <dd className="text-[15px] text-lp-text-2">{g.d}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div>
            <h2 className={h2}>{CANADA.title}</h2>
            <p className="mt-3 max-w-[52ch] text-lp-text-2">{CANADA.lead}</p>
          </div>
          <Link href="/methodology#regulatory-status" className="text-[15px] font-semibold">
            {CANADA.statusLink.replace("{asOf}", d.statusAsOf)}
          </Link>
        </div>
        <ul className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] border-t border-lp-line-strong">
          {CANADA.tiles.map((c) => (
            <li key={c.t}>
              <Link href={c.href} className="block border-b border-lp-line-strong pb-6 pr-6 pt-[22px] text-lp-navy hover:text-lp-navy">
                <span className="block text-lg font-semibold tracking-[-0.01em]">{c.t}</span>
                <span className="mt-1 block max-w-[36ch] text-[15px] leading-normal text-lp-text-2">{c.d}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Decisions you can check, and How it's built */}
      <section className={cn(section, "pt-32")}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-x-16 gap-y-10">
          <div>
            <h2 className={cn(h2, "max-w-[12ch]")}>{CHECKS.title}</h2>
            <div className="mt-8 flex max-w-[46ch] flex-col gap-[22px]">
              {CHECKS.points.map((p) => (
                <p key={p.strong} className="text-lp-text-2">
                  <strong className="font-semibold text-lp-navy">{p.strong}</strong>
                  {p.rest}
                  {"link" in p && p.link && (
                    <Link href={p.link.href} className="font-semibold">
                      {p.link.label}
                    </Link>
                  )}
                </p>
              ))}
            </div>
          </div>
          <div id="built" className="scroll-mt-[90px] self-start rounded-[14px] bg-lp-surface p-[clamp(28px,4vw,40px)] shadow-lp-card">
            <h3 className="text-[22px] font-semibold tracking-[-0.015em]">{BUILT.title}</h3>
            <ul className="mt-[18px] flex flex-col text-[15px] text-lp-text-2">
              {BUILT.items.map((t) => (
                <li key={t} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-lp-line py-3">
                  <span className="font-medium text-lp-navy">{t}</span>
                  <span className="font-mono text-[13px] text-lp-green-ink">{BUILT.yes}</span>
                </li>
              ))}
            </ul>
            <Link href={BUILT.link.href} className="mt-4 inline-block text-[15px] font-semibold">
              {BUILT.link.label}
            </Link>
          </div>
        </div>
      </section>

      {/* How a pilot would work */}
      <section id="pilot" aria-labelledby="pilot-h" className={cn(section, "scroll-mt-[60px] pt-32")}>
        <p className="mb-3 inline-block rounded-full bg-lp-cyan-tint px-2.5 py-0.5 font-mono text-xs text-lp-cyan-ink">{PILOT.label}</p>
        <h2 id="pilot-h" className={cn(h2, "max-w-[18ch]")}>
          {PILOT.title}
        </h2>
        <p className="mt-3.5 max-w-[56ch] font-medium text-lp-navy">{PILOT.disclaimer}</p>
        <p className="mt-2 max-w-[56ch] text-lp-text-2">{PILOT.lead}</p>
        <ol className="mt-10 grid grid-cols-1 gap-x-6 border-t border-lp-line-strong tablet:grid-cols-2 wide:grid-cols-4">
          {PILOT.steps.map((p) => (
            <li key={p.when} className="border-b border-lp-line-strong pb-6 pr-6 pt-5">
              <span className="block font-mono text-[13px] text-lp-text-3">{p.when}</span>
              <span className="mt-1.5 block text-lg font-semibold tracking-[-0.01em]">{p.t}</span>
              <span className="mt-1 block text-[15px] leading-normal text-lp-text-2">{p.d}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-h" className={cn(section, "flex flex-wrap gap-x-16 gap-y-6 pt-32")}>
        <h2 id="faq-h" className={cn(h2, "max-w-[12ch] flex-[1_1_260px]")}>
          {FAQ.title}
        </h2>
        <Faq />
      </section>

      {/* Talk to me about Berry */}
      <section id="contact" aria-labelledby="contact-h" className={cn(section, "scroll-mt-[60px] pb-24 pt-32")}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-center gap-x-16 gap-y-10 rounded-[18px] bg-lp-navy p-[clamp(32px,6vw,64px)] text-lp-on-navy">
          <div>
            <h2 id="contact-h" className="max-w-[14ch] text-[clamp(30px,3.8vw,46px)] font-bold leading-[1.08] tracking-[-0.03em] text-white">
              {CONTACT.title}
            </h2>
            <p className="mt-4 max-w-[40ch]">{CONTACT.lead}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {CONTACT.links.map((l, i) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex min-h-12 items-center rounded-lg px-[22px] font-semibold",
                  i === 0 ? "bg-lp-green text-white hover:bg-lp-green-hover hover:text-white" : "text-white shadow-[inset_0_0_0_1px_var(--color-lp-navy-line-strong)] hover:bg-lp-navy-raised hover:text-white",
                )}
              >
                {l.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
