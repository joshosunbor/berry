import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CONTACT, FOOTER } from "@/content/landing"

const LINKEDIN = "https://www.linkedin.com/in/joshua-osunbor-06b26bb5/"
// Built from parts so this file doesn't trip its own check.
const OLD = ["linkedin.com/in/", "joshuaosunbor"].join("")

const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf)$/i

describe("LinkedIn profile URL", () => {
  it("the old profile address appears nowhere in the repository", () => {
    const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !BINARY.test(f) && f !== "package-lock.json")
    const hits = files.filter((f) => {
      try {
        return readFileSync(f, "utf8").toLowerCase().includes(OLD)
      } catch {
        return false // listed but deleted in the working tree
      }
    })
    expect(hits).toEqual([])
  })

  it("the old handle (without the hyphenated slug) appears nowhere visitors read", () => {
    const handle = ["joshua", "osunbor"].join("")
    const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "--", "src", "content", "app", "components", "README.md"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !BINARY.test(f))
    expect(files.length).toBeGreaterThan(20)
    expect(files.filter((f) => readFileSync(f, "utf8").toLowerCase().includes(handle))).toEqual([])
  })

  it("the contact panel, the footer and the README link to the current profile", () => {
    expect(CONTACT.links.find((l) => l.label === "LinkedIn")?.href).toBe(LINKEDIN)
    expect(FOOTER.links.find((l) => l.label === "LinkedIn")?.href).toBe(LINKEDIN)
    expect(readFileSync("README.md", "utf8")).toContain(`](${LINKEDIN})`)
  })
})
