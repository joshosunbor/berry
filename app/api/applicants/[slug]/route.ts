import { getApplyPayload, getCast } from "@/lib/data"

/*
 * Engine input for one synthetic applicant, used by /apply to run the
 * decision engine in the browser. Prerendered for every applicant. Contains
 * no protected attributes (name, date of birth, gender, nationality,
 * immigration status, postal code) and no display name or location.
 */

export function generateStaticParams() {
  return getCast().map((c) => ({ slug: c.applicant.slug }))
}

export async function GET(_req: Request, { params }: RouteContext<"/api/applicants/[slug]">) {
  const { slug } = await params
  const payload = getApplyPayload(slug)
  if (!payload) return Response.json({ error: "Unknown applicant" }, { status: 404 })
  return Response.json(payload)
}
