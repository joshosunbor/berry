import { describe, expect, it } from "vitest"
import fixture from "./fixtures/cast-fingerprint.json"
import { castFingerprint } from "./cast-fingerprint"

describe("cast outcome record", () => {
  it("every cast decision, identity check and loan outcome is unchanged (keyed by seed key, so renames can't hide a change)", () => {
    // Refresh tests/fixtures/cast-fingerprint.json only for an intended policy or data change.
    expect(castFingerprint()).toEqual(fixture)
  })
})
