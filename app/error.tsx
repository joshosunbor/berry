"use client"

import { StatusPage } from "@/components/site/status-page"
import { Button, ButtonLink } from "@/components/ui/button"

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusPage code="Error" title="Something went wrong." lead="This page couldn't be shown. Try again, or go back to the workbench.">
      <Button onClick={reset}>Try again</Button>
      <ButtonLink href="/workbench" variant="secondary">
        Go to the workbench
      </ButtonLink>
    </StatusPage>
  )
}
