import { SiteFooter } from "@/components/berry/site-footer"
import { SiteHeader } from "@/components/berry/site-header"

/** The product: workbench, compare, apply, operations, methodology and accuracy. */
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
