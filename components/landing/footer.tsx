import Link from "next/link"
import { FOOTER } from "@/content/landing"

export function LandingFooter() {
  return (
    <footer className="border-t border-lp-line">
      <div className="mx-auto flex max-w-[1160px] flex-wrap justify-between gap-x-6 gap-y-3 px-[clamp(20px,4vw,40px)] pb-9 pt-7 text-sm text-lp-text-2">
        <p>{FOOTER.text}</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 font-medium">
          {FOOTER.links.map((l) =>
            l.href.startsWith("http") ? (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="text-lp-navy hover:text-lp-cyan-ink">
                {l.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <Link key={l.label} href={l.href} className="text-lp-navy hover:text-lp-cyan-ink">
                {l.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  )
}
