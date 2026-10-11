import { describe, expect, it } from "vitest"
import { RETURN_CODES, RETURN_CODES_SOURCE } from "@/lib/schemas"
import { SCRIPTS } from "@/lib/servicing/portfolio"

describe("return reason codes (Payments Canada Standard 007)", () => {
  it("uses the official labels", () => {
    expect(RETURN_CODES["901"].label).toBe("NSF (Debit Only)")
    expect(RETURN_CODES["903"].label).toBe("Payment Stopped/Recalled")
    expect(RETURN_CODES["905"].label).toBe("Account Closed")
    expect(RETURN_CODES["907"].label).toBe("No Debit Allowed")
    expect(RETURN_CODES["914"].label).toBe("Incorrect Payor/Payee Name")
    expect(RETURN_CODES["912"].label).toBe("Invalid/Incorrect Account No.")
    expect(RETURN_CODES["917"].label).toBe("Agreement Revoked – Personal")
  })
  it("cites Standard 007", () => {
    expect(RETURN_CODES_SOURCE).toBe("https://www.payments.ca/sites/default/files/standard007eng.pdf")
  })
  it("every code the simulator uses is an official code", () => {
    for (const s of Object.values(SCRIPTS)) for (const r of s.returns) expect(Object.keys(RETURN_CODES)).toContain(r.code)
  })
  it("doesn't include the retired code 906", () => {
    expect(Object.keys(RETURN_CODES)).not.toContain("906")
  })
})
