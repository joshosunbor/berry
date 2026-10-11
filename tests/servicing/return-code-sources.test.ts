import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { REGULATORY_STATUS } from "@/lib/regulatory/status"
import { RETURN_CODES, RETURN_CODES_SOURCE } from "@/lib/schemas"

const root = path.resolve(__dirname, "../..")
const row = REGULATORY_STATUS.rows.find((r) => r.id === "return-codes")!

describe("return codes cite Standard 007 everywhere", () => {
  it("the panel row links to Standard 007 with an as-of date", () => {
    expect(row.source.url).toBe(RETURN_CODES_SOURCE)
    expect(RETURN_CODES_SOURCE).toBe("https://www.payments.ca/sites/default/files/standard007eng.pdf")
    expect(row.name).toMatch(/Standard 007/)
    expect(row.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(row.asOf <= REGULATORY_STATUS.asOf).toBe(true)
  })

  it("every code and label the panel quotes matches the official labels", () => {
    const quoted = [...row.summary.matchAll(/\b(9\d\d) ([^,.]+?)(?=, \d{3}|, e\.g|\.|,|$)/g)].map((m) => [m[1], m[2].trim()])
    expect(quoted.length).toBeGreaterThanOrEqual(4)
    for (const [code, label] of quoted) expect(RETURN_CODES[code as keyof typeof RETURN_CODES]?.label, code).toBe(label)
  })

  it("no page, label or panel text points at Standard 017 or its Part C for return codes", () => {
    const files = [
      path.join(root, "data/regulatory-status.json"),
      path.join(root, "lib/schemas/servicing.ts"),
      path.join(root, "lib/servicing/recovery.ts"),
      ...["app", "components/berry"].flatMap((d) =>
        readdirSync(path.join(root, d), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name)),
      ),
    ]
    for (const f of files) expect(readFileSync(f, "utf8"), path.relative(root, f)).not.toMatch(/Standard 017|part_c_of_5|Part C/i)
  })
})
