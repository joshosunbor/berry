import { NextResponse, type NextRequest } from "next/server"
import castIndex from "@/data/cast-index.json"
import loanIndex from "@/data/loan-index.json"

/*
 * Applicant and loan pages are prerendered; with Cache Components an unknown id would
 * stream the page shell with a 200 status before notFound() runs. Checking
 * the id here, before rendering, gives unknown applicants a real 404.
 */

const KNOWN = new Set<string>(castIndex)
const LOANS = new Set<string>(loanIndex)

export function proxy(request: NextRequest) {
  const parts = request.nextUrl.pathname.split("/")
  const isLoan = parts[1] === "ops"
  const id = isLoan ? parts[3] : parts[2]
  if (id && !(isLoan ? LOANS : KNOWN).has(id)) {
    return NextResponse.rewrite(new URL("/_unknown-applicant", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/workbench/:id", "/compare/:id", "/ops/loans/:id"],
}
