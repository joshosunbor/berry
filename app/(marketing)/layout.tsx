import { SiteFooter } from "@/components/berry/site-footer"
import { SiteHeader } from "@/components/berry/site-header"

/** The landing page. Its own header and footer arrive with the redesign (design/design_handoff_berry_landing). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div id="main" className="flex-1">
        {children}
      </div>
      <SiteFooter />
    </>
  )
}
