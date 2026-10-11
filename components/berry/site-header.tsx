import Link from "next/link"

const NAV = [
  { href: "/workbench", label: "Workbench" },
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
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-muted-ink transition-colors hover:bg-muted hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
