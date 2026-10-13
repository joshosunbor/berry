import { ModeProvider } from "@/components/berry/mode-context"
import { AppHeader } from "@/components/site/app-header"
import { AppSidebar, AppTabBar } from "@/components/site/app-sidebar"
import { SiteFooter } from "@/components/site/site-footer"
import { TourBar, TourHighlight } from "@/components/tour/tour-bar"
import { TooltipProvider } from "@/components/ui/tooltip"

/**
 * The product: the app header (sections, lender switcher, tour bar), the
 * section sidebar on desktop and a tab bar on phones.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ModeProvider>
      <TooltipProvider>
        <AppHeader />
        <TourHighlight />
        <div className="flex flex-1">
          <AppSidebar />
          <div id="main" className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </div>
        </div>
        <TourBar placement="bottom" />
        <AppTabBar />
      </TooltipProvider>
    </ModeProvider>
  )
}
