import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { LIVE_DEMO, NAV } from "@/content/landing"

/** The landing page: the shared header (with the landing page's links and call to action) and footer. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing flex min-h-full flex-1 flex-col">
      <SiteHeader nav={[...NAV]} cta={LIVE_DEMO} homeHref="#top" />
      <div id="main" className="flex-1">
        {children}
      </div>
      <SiteFooter />
    </div>
  )
}
