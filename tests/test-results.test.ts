import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { TestResults } from "@/components/how-it-works/test-results"

describe("published test results", () => {
  const html = renderToStaticMarkup(createElement(TestResults))
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

  it("shows expected and actual in their own columns for every lender", () => {
    expect((html.match(/>Expected</g) ?? []).length).toBe(3)
    expect((html.match(/>Actual</g) ?? []).length).toBe(3)
  })

  it("shows the limit each approval came out at", () => {
    expect(text).toMatch(/Approve \$[\d,]+/i)
  })

  it("puts the caveat right beside the score, including that limits aren't scored", () => {
    const score = html.slice(html.indexOf('id="score"'), html.indexOf("</p>", html.indexOf('id="score"')))
    expect(score).toMatch(/same author/)
    expect(score).toMatch(/limits aren(&#x27;|')t scored/i)
  })
})
