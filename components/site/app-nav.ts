import { Banknote, ClipboardList, FileText, Inbox } from "lucide-react"

/*
 * The product's four sections and their pages: one source for the app
 * header, the desktop sidebar, the phone tab bar, the Operations sub-nav and
 * the /demo start page.
 */

export interface AppPage {
  label: string
  href: string
  /** For pages that are a ?tab= of another: the tab id. */
  tab?: string
}

export interface AppSection {
  id: "applications" | "borrower" | "loans" | "operations"
  label: string
  /** Shorter label for the phone tab bar. */
  short: string
  href: string
  /** URL prefix the section owns. */
  prefix: string
  /** One line on the /demo start page: what you'll see. */
  blurb: string
  pages: AppPage[]
}

export const APP_SECTIONS: AppSection[] = [
  {
    id: "applications",
    label: "Applications",
    short: "Applications",
    href: "/applications",
    prefix: "/applications",
    blurb: "Fourteen synthetic applicants, each decided by three lenders, with the reasons, the cash flow and a side-by-side comparison.",
    pages: [{ label: "All applicants", href: "/applications" }],
  },
  {
    id: "borrower",
    label: "Borrower view",
    short: "Borrower",
    href: "/borrower/apply",
    prefix: "/borrower",
    blurb: "Apply as a borrower would: consent to share data, identity checks, your request, and the answer in plain language.",
    pages: [
      { label: "Apply", href: "/borrower/apply" },
      { label: "My consents", href: "/borrower/consents" },
    ],
  },
  {
    id: "loans",
    label: "Loans",
    short: "Loans",
    href: "/loans",
    prefix: "/loans",
    blurb: "Every approved loan after funding: its ledger, collections, failed payments and recovery, with a clock to fast-forward.",
    pages: [{ label: "Loan book", href: "/loans" }],
  },
  {
    id: "operations",
    label: "Operations",
    short: "Operations",
    href: "/operations",
    prefix: "/operations",
    blurb: "The back office: work queues with service levels, second-person sign-off, policy changes, the audit trail and the dashboard.",
    pages: [
      { label: "Queues", href: "/operations", tab: "queues" },
      { label: "Team", href: "/operations?tab=team", tab: "team" },
      { label: "Policy", href: "/operations?tab=policy", tab: "policy" },
      { label: "Audit", href: "/operations?tab=audit", tab: "audit" },
      { label: "Dashboard", href: "/operations/dashboard" },
    ],
  },
]

export const sectionFor = (pathname: string) => APP_SECTIONS.find((s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`)) ?? null

/** Whether a section page is the one showing, given the path and the current ?tab=. */
export function isCurrentPage(p: AppPage, pathname: string, tab: string | null): boolean {
  const path = p.href.split("?")[0]
  if (pathname !== path) return false
  if (p.tab === undefined) return true
  return (tab ?? "queues") === p.tab
}

export const SECTION_ICON: Record<AppSection["id"], typeof FileText> = {
  applications: FileText,
  borrower: ClipboardList,
  loans: Banknote,
  operations: Inbox,
}
