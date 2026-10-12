import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8"))

describe("docker build context", () => {
  it("leaves out local screenshots, design files and agent worktrees", () => {
    const ignored = readFileSync(path.resolve(import.meta.dirname, "../.dockerignore"), "utf8").split("\n").map((l) => l.trim())
    for (const p of [".tmp", "design", ".claude"]) expect(ignored, p).toContain(p)
  })
})

describe("dependencies", () => {
  it("ships only what the running app needs", () => {
    // The shadcn CLI is a build-time tool (its tailwind.css is imported when CSS is built), not a runtime dependency.
    expect(pkg.dependencies).not.toHaveProperty("shadcn")
    expect(pkg.devDependencies).toHaveProperty("shadcn")
    // Never imported: the landing page uses CSS motion.
    expect(pkg.dependencies).not.toHaveProperty("framer-motion")
  })
})
