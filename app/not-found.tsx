import type { Metadata } from "next"
import { StatusPage } from "@/components/site/status-page"
import { ButtonLink } from "@/components/ui/button"

export const metadata: Metadata = { title: "Page not found · Berry" }

export default function NotFound() {
  return (
    <StatusPage code="404" title="This page could not be found." lead="The address may be mistyped, or the applicant or loan it points to isn't in Berry's synthetic data.">
      <ButtonLink href="/workbench">Go to the workbench</ButtonLink>
      <ButtonLink href="/" variant="secondary">
        Home
      </ButtonLink>
    </StatusPage>
  )
}
