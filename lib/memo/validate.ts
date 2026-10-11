import { allowedNumbers, numberTokens, type MemoFacts } from "./facts"
import { MEMO_SECTIONS } from "./template"
import type { Outcome } from "@/lib/schemas"

/*
 * Checks a drafted memo against the engine's facts (CLAUDE.md §6). A memo
 * passes only if every number in it comes from the facts, it states the
 * engine's outcome and never another one, it names no other limit, it uses
 * the standard sections and it makes no regulatory claims. Strict on
 * purpose: when unsure, reject and fall back to the template.
 */

export const MEMO_MIN_CHARS = 200
export const MEMO_MAX_CHARS = 8000

/** Same rule as tests/copy.test.ts: no claims of regulatory standing. */
const BANNED = /\b(compliant|compliance-certified|certified|approved by)\b/i

export interface MemoValidation {
  ok: boolean
  problems: string[]
}

type Mention = "approve" | "conditional" | "refer" | "decline"

const MENTIONS: Record<Mention, RegExp> = {
  approve: /\bapprov/i,
  conditional: /\bwith conditions\b|\bconditional(ly)?\b/i,
  refer: /\brefer(s|red|ral|rals|ring)?\b/i,
  decline: /\bdeclin/i,
}

/** Which outcome words may appear when the engine reached each outcome. */
const COMPATIBLE: Record<Outcome, Mention[]> = {
  approve: ["approve"],
  approve_with_conditions: ["approve", "conditional"],
  refer: ["refer"],
  decline: ["decline"],
}

function contradictions(text: string, outcome: Outcome): Mention[] {
  return (Object.keys(MENTIONS) as Mention[]).filter((m) => MENTIONS[m].test(text) && !COMPATIBLE[outcome].includes(m))
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()

function sections(text: string): Map<string, string> {
  const out = new Map<string, string>()
  let current: string | null = null
  let body: string[] = []
  const flush = () => current !== null && out.set(current, body.join("\n"))
  for (const line of text.split("\n")) {
    const h = line.match(/^\s*#{1,6}\s*(.+?)\s*#*\s*$/)
    if (h) {
      flush()
      current = squash(h[1]).replace(/[:.]$/, "")
      body = []
    } else body.push(line)
  }
  flush()
  return out
}

function sentences(text: string): string[] {
  return text
    .split(/\n|(?<=[.;!?])\s+/)
    .map((s) => s.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
}

const LIMIT_WORDS = /\b(limit|approved|approve|offer|offered|offers|principal|loan of|line of|credit of|lend|lending)\b/i
const REQUEST_WORDS = /\b(request|requested|requesting|asking|asked|applied)\b/i

export function validateMemo(text: string, facts: MemoFacts): MemoValidation {
  const problems: string[] = []
  const trimmed = (text ?? "").trim()

  if (trimmed.length < MEMO_MIN_CHARS) problems.push("The memo is empty or too short.")
  if (trimmed.length > MEMO_MAX_CHARS) problems.push(`The memo is longer than ${MEMO_MAX_CHARS} characters.`)
  if (!trimmed) return { ok: false, problems }

  const banned = trimmed.match(BANNED)
  if (banned) problems.push(`The memo uses a banned phrase: "${banned[0]}".`)

  // 1. Every number must come from the facts.
  const allowed = allowedNumbers(facts)
  const plainValues = new Set([...allowed].map((k) => k.slice(k.indexOf(":") + 1)))
  for (const t of numberTokens(trimmed)) {
    const ok = allowed.has(`${t.unit}:${t.value}`) || (t.unit === "" && plainValues.has(t.value))
    if (!ok) problems.push(`"${t.raw.trim()}" is not a figure from the engine output.`)
  }

  // 2. Standard sections, and a Recommendation that states the engine's outcome.
  const secs = sections(trimmed)
  for (const s of MEMO_SECTIONS) if (!secs.has(s.toLowerCase())) problems.push(`Missing the "${s}" section.`)
  const rec = secs.get("recommendation")
  const outcome = facts.decision.outcome
  if (rec !== undefined) {
    if (!squash(rec).includes(squash(facts.decision.recommendationLine))) {
      problems.push(`The Recommendation section doesn't state the engine outcome ("${facts.decision.recommendationLine}").`)
    }
    for (const m of contradictions(rec, outcome)) problems.push(`The Recommendation section says "${m}" but the engine outcome is ${facts.decision.outcomeLabel}.`)
  }

  // 3. No outcome claims elsewhere that contradict the engine.
  const factStrings = [...facts.strengths, ...facts.risks, ...facts.conditions, ...facts.whatWouldChange, ...facts.complianceFlags].map(squash)
  const verbatim = (s: string) => factStrings.some((f) => f.includes(squash(s)))
  for (const s of sentences(trimmed)) {
    if (verbatim(s)) continue
    if (/\brecommend|\b(outcome|decision|verdict)\b/i.test(s) && !/what would change/i.test(s)) {
      for (const m of contradictions(s, outcome)) problems.push(`"${s}" says "${m}", which contradicts the engine outcome (${facts.decision.outcomeLabel}).`)
    }
    // 4. Any amount presented as the limit or offer must be the engine's limit.
    if (LIMIT_WORDS.test(s) && !REQUEST_WORDS.test(s)) {
      for (const t of numberTokens(s).filter((x) => x.unit === "$")) {
        const limit = facts.decision.limit ? numberTokens(facts.decision.limit)[0]?.value : null
        const payment = facts.decision.payment ? numberTokens(facts.decision.payment)[0]?.value : null
        if (t.value !== limit && t.value !== payment) problems.push(`"${s}" names ${t.raw.trim()} as the amount offered; the engine's limit is ${facts.decision.limit ?? "none"}.`)
      }
    }
  }

  return { ok: problems.length === 0, problems: [...new Set(problems)] }
}
