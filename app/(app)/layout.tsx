import { ModeProvider } from "@/components/berry/mode-context"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { TooltipProvider } from "@/components/ui/tooltip"

/** The product: workbench, compare, apply, operations, methodology and accuracy. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ModeProvider>
      <TooltipProvider>
        <SiteHeader />
        <div id="main" className="flex-1">
          {children}
        </div>
        <SiteFooter />
      </TooltipProvider>
    </ModeProvider>
  )
}
