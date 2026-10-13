import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { LIVE_DEMO, NAV } from "@/content/landing"
import { pageContainer } from "@/components/ui/page-header"
import { cn } from "@/lib/utils"

/*
 * The 404 and error pages: they render outside the product layout, so they
 * bring the shared header and footer with them.
 */
export function StatusPage({ code, title, lead, children }: { code: string; title: string; lead: string; children?: React.ReactNode }) {
  return (
    <>
      <SiteHeader nav={NAV.map((n) => ({ ...n, href: n.href.startsWith("#") ? `/${n.href}` : n.href }))} cta={LIVE_DEMO} />
      <div id="main" className="flex flex-1 bg-page text-fg">
        <main className={cn(pageContainer, "flex flex-col justify-center py-24")}>
          <p className="font-mono text-sm text-green-ink">{code}</p>
          <h1 className="mt-3 text-[clamp(32px,4.5vw,52px)] font-bold leading-[1.05] tracking-[-0.03em]">{title}</h1>
          <p className="mt-3.5 max-w-[52ch] text-lg leading-normal text-fg-2">{lead}</p>
          {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
        </main>
      </div>
      <SiteFooter />
    </>
  )
}
