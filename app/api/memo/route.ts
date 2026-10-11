import { z } from "zod"
import { getApplicant } from "@/lib/data"
import { draftMemo } from "@/lib/memo/draft"
import { MODES, type Mode } from "@/lib/modes"

/*
 * Drafts the credit memo for one applicant and lender (CLAUDE.md §6).
 * POST { slug, mode }. Works without an API key (template memo). With
 * ANTHROPIC_API_KEY set, only structured engine output is sent to Claude
 * and the reply is validated before it is returned; otherwise the template
 * is returned with the reasons. POST handlers are never cached, so this
 * runs per request.
 */

const Body = z.object({
  slug: z.string().min(1).max(100),
  mode: z.string().min(1).max(40),
})

export async function POST(req: Request) {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 })
  }
  const parsed = Body.safeParse(json)
  if (!parsed.success) return Response.json({ error: "Expected { slug, mode }" }, { status: 400 })

  const { slug, mode } = parsed.data
  const view = getApplicant(slug)
  if (!view) return Response.json({ error: "Unknown applicant" }, { status: 404 })
  if (!(MODES as readonly string[]).includes(mode)) return Response.json({ error: "Unknown lender" }, { status: 404 })

  const a = view.applicant
  const draft = await draftMemo(
    {
      decision: view.decisions[mode as Mode],
      features: view.features,
      request: { kind: a.kind, product: a.request.product, amountCents: a.request.amountCents, termMonths: a.request.termMonths ?? null },
    },
    { apiKey: process.env.ANTHROPIC_API_KEY || undefined },
  )
  return Response.json({ ...draft, mode, slug })
}
