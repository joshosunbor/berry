import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { getApplicant, getCast, type ApplicantView } from "@/lib/data"
import { draftMemo, MEMO_MODEL, type MemoClient } from "@/lib/memo/draft"
import { allowedNumbers, buildMemoFacts, numberTokens } from "@/lib/memo/facts"
import { templateMemo, type MemoInput } from "@/lib/memo/template"
import { validateMemo } from "@/lib/memo/validate"
import { MODES, type Mode } from "@/lib/modes"

const inputFor = (v: ApplicantView, mode: Mode): MemoInput => ({
  decision: v.decisions[mode],
  features: v.features,
  request: { kind: v.applicant.kind, product: v.applicant.request.product, amountCents: v.applicant.request.amountCents, termMonths: v.applicant.request.termMonths ?? null },
})

const cases = getCast().flatMap((v) => MODES.map((m) => [`${v.applicant.slug} / ${m}`, inputFor(v, m)] as const))
const factsOf = (i: MemoInput) => buildMemoFacts(i.decision, i.features, i.request)

const hollis = getApplicant("hollis-family-farm")!
const hollisCu = inputFor(hollis, "credit_union") // approve, $60,000 seasonal line
const hollisBank = inputFor(hollis, "bank") // decline

describe("template memo", () => {
  it.each(cases)("%s is deterministic, passes validation and uses only allowed numbers", (_n, input) => {
    const a = templateMemo(input)
    expect(templateMemo(structuredClone(input))).toBe(a)
    const facts = factsOf(input)
    const allowed = allowedNumbers(facts)
    for (const t of numberTokens(a)) expect(allowed.has(`${t.unit}:${t.value}`), t.raw).toBe(true)
    expect(validateMemo(a, facts)).toEqual({ ok: true, problems: [] })
  })

  it("states the engine outcome in the Recommendation section", () => {
    expect(templateMemo(hollisCu)).toContain("## Recommendation\nEngine outcome: Approve, $60,000 seasonal operating line.")
    expect(templateMemo(hollisBank)).toContain("## Recommendation\nEngine outcome: Decline.")
  })
})

describe("memo facts carry no personal details", () => {
  const dir = path.join(process.cwd(), "data/applicants")
  const raw = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))

  it.each(raw.map((a) => [a.slug as string, a]))("%s", (slug, a) => {
    const v = getApplicant(slug)!
    const sent = MODES.map((m) => JSON.stringify(factsOf(inputFor(v, m)))).join("\n")
    const forbidden: string[] = [
      ...Object.values(a.protected as Record<string, string>).map(String),
      ...String(a.protected.fullName).split(/\s+/),
      a.displayName,
      a.story,
      a.province,
      ...(a.business ? [a.business.legalName] : []),
    ].filter((s) => s && s.length >= 3)
    for (const s of forbidden) {
      const re = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
      expect(re.test(sent), `facts contain "${s}"`).toBe(false)
    }
    expect(sent).not.toMatch(/"transactions"|txn_|"protected"/)
  })
})

describe("validateMemo", () => {
  const facts = factsOf(hollisCu)
  const good = templateMemo(hollisCu)

  it("accepts the template", () => expect(validateMemo(good, facts).ok).toBe(true))

  it("accepts the same figures written differently ($60,000.00, 7.95 percent)", () => {
    const alt = good.replace("limit $60,000.", "limit $60,000.00.").replace("7.95% APR", "7.95 percent APR")
    expect(alt).not.toBe(good)
    expect(validateMemo(alt, facts)).toEqual({ ok: true, problems: [] })
  })

  it("rejects an altered limit", () => {
    const r = validateMemo(good.replaceAll("$60,000", "$65,000"), facts)
    expect(r.ok).toBe(false)
    expect(r.problems.join(" ")).toContain("$65,000")
  })

  it("rejects an allowed figure presented as the limit", () => {
    const r = validateMemo(good.replace("limit $60,000.", "limit $35,000."), facts)
    expect(r.ok).toBe(false)
  })

  it("rejects an altered rate", () => {
    const r = validateMemo(good.replace("7.95%", "6.95%"), facts)
    expect(r.ok).toBe(false)
    expect(r.problems.join(" ")).toContain("6.95%")
  })

  it("rejects a new number, even a plain one", () => {
    expect(validateMemo(good + "\nThe applicant has farmed for 41 seasons.", facts).ok).toBe(false)
  })

  it("rejects a contradicted outcome", () => {
    const bankFacts = factsOf(hollisBank)
    const bankMemo = templateMemo(hollisBank)
    const flipped = bankMemo.replace("Engine outcome: Decline.", "Engine outcome: Approve.")
    expect(validateMemo(flipped, bankFacts).ok).toBe(false)
    const added = bankMemo + "\nWe recommend approval despite the income pattern."
    expect(validateMemo(added, bankFacts).ok).toBe(false)
    const approveDeclined = good.replace("The engine set this outcome.", "On balance we would decline.")
    expect(validateMemo(approveDeclined, facts).ok).toBe(false)
  })

  it("rejects a limit on a declined file", () => {
    const bankMemo = templateMemo(hollisBank)
    expect(validateMemo(bankMemo.replace("- No credit offered at this stage.", "- A line of $60,000 is offered."), factsOf(hollisBank)).ok).toBe(false)
  })

  it("rejects banned phrases", () => {
    for (const p of ["This memo is compliant with policy.", "Certified by the credit team.", "Approved by the branch."]) {
      const r = validateMemo(`${good}\n${p}`, facts)
      expect(r.ok).toBe(false)
      expect(r.problems.join(" ")).toMatch(/banned phrase/)
    }
  })

  it("rejects empty, too long and missing sections", () => {
    expect(validateMemo("", facts).ok).toBe(false)
    expect(validateMemo(good + "\n" + "Steady and calm. ".repeat(600), facts).ok).toBe(false)
    expect(validateMemo(good.replace("## Risks", "## Concerns"), facts).ok).toBe(false)
  })
})

function fakeClient(reply: string | Error): MemoClient & { calls: unknown[] } {
  const calls: unknown[] = []
  return {
    calls,
    beta: {
      messages: {
        create: async (body) => {
          calls.push(body)
          if (reply instanceof Error) throw reply
          return { content: [{ type: "text", text: reply, citations: null }], stop_reason: "end_turn" }
        },
      },
    },
  } as MemoClient & { calls: unknown[] }
}

describe("draftMemo", () => {
  const template = templateMemo(hollisCu)
  const polished = template
    .replace("A business applicant asking", "This file covers a business applicant asking")
    .replace("The engine set this outcome. This memo explains it and does not change it.", "Repayment from harvest sales fits the cash flow shown above.")

  it("returns the template when there is no API key", async () => {
    const client = fakeClient(polished)
    expect(await draftMemo(hollisCu, { client })).toEqual({ source: "template", text: template })
    expect(client.calls).toHaveLength(0)
  })

  it("returns Claude's memo when it passes validation, sending only the facts", async () => {
    const client = fakeClient(polished)
    const r = await draftMemo(hollisCu, { apiKey: "test", client })
    expect(r).toEqual({ source: "claude", text: polished })
    const body = client.calls[0] as { model: string; messages: { content: string }[] }
    expect(body.model).toBe(MEMO_MODEL)
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].content).toContain(JSON.stringify(factsOf(hollisCu), null, 2))
    expect(body.messages[0].content).not.toContain("Hollis")
  })

  it("falls back to the template and lists the problem when a number changed", async () => {
    const r = await draftMemo(hollisCu, { apiKey: "test", client: fakeClient(polished.replace("7.95%", "5.95%")) })
    expect(r.source).toBe("template")
    expect(r.text).toBe(template)
    expect(r.problems?.join(" ")).toContain("5.95%")
  })

  it("falls back to the template when the call throws", async () => {
    const r = await draftMemo(hollisCu, { apiKey: "test", client: fakeClient(new Error("network down")) })
    expect(r.source).toBe("template")
    expect(r.text).toBe(template)
    expect(r.problems).toEqual(["The Claude request failed."])
  })
})
