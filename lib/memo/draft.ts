import Anthropic from "@anthropic-ai/sdk"
import { buildMemoFacts, type MemoFacts } from "./facts"
import { MEMO_SECTIONS, renderTemplateMemo, type MemoInput } from "./template"
import { validateMemo } from "./validate"

/*
 * Drafts a credit memo (CLAUDE.md §6). Without an API key, returns the
 * template memo. With one, sends Claude ONLY the structured facts (engine
 * output and key features, no raw transactions, no personal details) and
 * asks for a polished memo that keeps every number and the decision as
 * given. The reply is validated against the facts; any problem, error or
 * timeout falls back to the template. AI drafts the memo; the engine and a
 * human make the decision.
 */

export const MEMO_MODEL = "claude-opus-5-5"
export const MEMO_TIMEOUT_MS = 45_000

export interface MemoDraft {
  source: "template" | "claude"
  text: string
  /** Why a Claude draft was rejected, when the template was used instead. */
  problems?: string[]
}

/** The slice of the Anthropic client this module uses, so tests can pass a fake. */
export interface MemoClient {
  beta: {
    messages: {
      create(
        body: Anthropic.Beta.MessageCreateParamsNonStreaming,
        options?: { timeout?: number; maxRetries?: number },
      ): PromiseLike<Pick<Anthropic.Beta.BetaMessage, "content" | "stop_reason">>
    }
  }
}

export const SYSTEM_PROMPT = `You write one-page credit memos for a lender's credit file, from structured facts produced by a deterministic decision engine. The facts are synthetic and the lender is fictional.

Rules (a validator checks every one; a memo that breaks any of them is discarded):
- Use only the facts in the user message. Do not add facts, estimates or assumptions.
- Never change, round, convert or compute any number. Copy every dollar amount, percentage, ratio and count exactly as written in the facts. Do not introduce any number that is not in the facts, and do not number lists or sections.
- The decision is final and was made by the engine. Never change it, soften it, argue against it or suggest a different outcome, limit, rate or term.
- Use exactly these section headings, each on its own line starting with "## ", in this order: ${MEMO_SECTIONS.join(", ")}. You may add "## Compliance flags" and "## What would change the decision" when the facts include them.
- The Recommendation section must start with this exact sentence from the facts: decision.recommendationLine. After it, add at most one sentence that does not use the words approve, decline, refer or conditional.
- Do not describe any dollar amount other than decision.limit as an amount offered or a limit.
- Do not refer to the applicant by name or guess personal details. Call them "the applicant" or "the business".
- Never say the lender or the memo is compliant, certified or approved by anyone.
- Plain, calm language. Short paragraphs and "- " bullets. No hype. Under 450 words.
Reply with the memo only.`

export interface DraftOptions {
  apiKey?: string
  client?: MemoClient
}

function describeError(e: unknown): string {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "The Claude request timed out."
  if (e instanceof Anthropic.AuthenticationError) return "The Claude API key was rejected."
  if (e instanceof Anthropic.RateLimitError) return "The Claude API is rate limiting requests."
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the Claude API."
  if (e instanceof Anthropic.APIError) return `The Claude API returned an error (${e.status ?? "unknown status"}).`
  return "The Claude request failed."
}

export async function draftMemo(input: MemoInput, opts: DraftOptions = {}): Promise<MemoDraft> {
  const facts: MemoFacts = buildMemoFacts(input.decision, input.features, input.request)
  const template = renderTemplateMemo(facts)
  if (!opts.apiKey) return { source: "template", text: template }

  const fallback = (problems: string[]): MemoDraft => ({ source: "template", text: template, problems })
  const client: MemoClient = opts.client ?? new Anthropic({ apiKey: opts.apiKey })

  let reply: Pick<Anthropic.Beta.BetaMessage, "content" | "stop_reason">
  try {
    reply = await client.beta.messages.create(
      {
        model: MEMO_MODEL,
        max_tokens: 16000,
        // Thinking is adaptive by default on this model; effort set explicitly.
        output_config: { effort: "medium" },
        // Server-side fallback if the request is declined by a safeguard.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Facts (JSON):\n${JSON.stringify(facts, null, 2)}` }],
      },
      { timeout: MEMO_TIMEOUT_MS, maxRetries: 1 },
    )
  } catch (e) {
    return fallback([describeError(e)])
  }

  if (reply.stop_reason === "refusal") return fallback(["Claude declined to draft the memo."])
  if (reply.stop_reason === "max_tokens") return fallback(["Claude's draft was cut off."])
  const text = reply.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim()

  const check = validateMemo(text, facts)
  if (!check.ok) return fallback(check.problems)
  return { source: "claude", text }
}
