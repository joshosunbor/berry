import type { Metadata } from "next"
import { ConsentDashboard } from "@/components/berry/consent-dashboard"

export const metadata: Metadata = {
  title: "Your consents · Berry",
  description: "Every data-sharing consent you've given in Berry, with expiry dates, one-click revoke and a log.",
}

export default function ConsentsPage() {
  return (
    <main className="mx-auto max-w-[960px] px-4 py-12 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Your consents</h1>
      <p className="mt-2 max-w-2xl text-muted-ink">
        Who can read your banking data, what they can read, and until when. Built around the draft framework&apos;s consent principles. Stored in this
        browser only.
      </p>
      <div className="mt-8">
        <ConsentDashboard />
      </div>
    </main>
  )
}
