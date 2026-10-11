import Link from "next/link"
import { Menu } from "lucide-react"

const NAV = [
  { href: "/workbench", label: "Workbench" },
  { href: "/compare/hollis-family-farm", label: "Compare" },
  { href: "/apply", label: "Apply" },
  { href: "/ops", label: "Operations" },
  { href: "/methodology", label: "Methodology" },
  { href: "/accuracy", label: "Accuracy" },
]

export function SiteHeader() {
  return (
    <header className="border-b border-rule bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="grid size-6 place-items-center rounded-full bg-ink text-[11px] font-bold text-background">
            B
          </span>
          Berry
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 text-sm md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-muted-ink transition-colors hover:bg-muted hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        {/* Phones and small tablets: a disclosure menu (works without JavaScript). */}
        <details className="group relative md:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-ink hover:text-ink [&::-webkit-details-marker]:hidden">
            <Menu aria-hidden className="size-4" />
            Menu
          </summary>
          <nav aria-label="Main" className="absolute right-0 z-50 mt-2 w-48 rounded-lg border border-rule bg-surface p-1.5 shadow-soft">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="block rounded-md px-3 py-2 text-sm hover:bg-muted">
                {n.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  )
}
