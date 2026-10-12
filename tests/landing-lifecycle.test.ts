import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Lifecycle } from "@/components/landing/lifecycle"
import { LIFECYCLE } from "@/content/landing"

describe("landing lifecycle", () => {
  it("each panel's Next names its own next step, as server HTML (no-JS readers and crawlers see it)", () => {
    const html = renderToStaticMarkup(createElement(Lifecycle))
    const labels = [...html.matchAll(/<button type="button"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1].replace(/&#x27;|&apos;/g, "'"))
    const steps = LIFECYCLE.steps
    expect(labels).toEqual(steps.map((_, i) => (i === steps.length - 1 ? LIFECYCLE.restart : LIFECYCLE.next.replace("{name}", steps[i + 1].name))))
  })
})
