import { LandingFooter } from "@/components/landing/footer"
import { LandingHeader } from "@/components/landing/header"

/** The landing page: its own navy header and footer (design/design_handoff_berry_landing). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing flex min-h-full flex-1 flex-col">
      <LandingHeader />
      <div id="main" className="flex-1">
        {children}
      </div>
      <LandingFooter />
    </div>
  )
}
