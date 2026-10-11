import { NextResponse, type NextRequest } from "next/server"
import castIndex from "@/data/cast-index.json"

/*
 * Applicant pages are prerendered; with Cache Components an unknown id would
 * stream the page shell with a 200 status before notFound() runs. Checking
 * the id here, before rendering, gives unknown applicants a real 404.
 */

const KNOWN = new Set<string>(castIndex)

export function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.split("/")[2]
  if (id && !KNOWN.has(id)) {
    return NextResponse.rewrite(new URL("/_unknown-applicant", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/workbench/:id", "/compare/:id"],
}
