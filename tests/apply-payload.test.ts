import path from "node:path"
import { describe, expect, it } from "vitest"
import { getApplyPayload, getCast } from "@/lib/data"
import { loadApplicants } from "@/lib/evaluation/load"

const full = loadApplicants(path.resolve(__dirname, "../data/applicants"))

describe("/api/applicants payload (sent to the browser for /apply)", () => {
  it("exists for every applicant", () => {
    for (const c of getCast()) expect(getApplyPayload(c.applicant.slug), c.applicant.slug).toBeDefined()
    expect(getApplyPayload("nobody")).toBeUndefined()
  })

  it("contains no protected attribute, display name or story", () => {
    for (const a of full) {
      const json = JSON.stringify(getApplyPayload(a.slug))
      const p = a.protected
      for (const value of [p.fullName, p.dateOfBirth, p.postalCode, a.story]) expect(json, `${a.slug}: ${value}`).not.toContain(value)
      expect(json).not.toMatch(/"(protected|displayName|province|gender|nationality|immigrationStatus|postalCode|dateOfBirth)"/)
    }
  })
})
