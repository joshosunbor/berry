import { describe, expect, it } from "vitest"
import { buildAftFile, julian, RECORD_LENGTH } from "@/lib/engine/aft"

const input = {
  originatorId: "0000099901",
  fileCreationNumber: 17,
  createdOn: "2026-10-05",
  destinationDataCentre: "00990",
  originatingDataCentre: "00990",
  shortName: "NORTHGATE CU",
  longName: "NORTHGATE CREDIT UNION",
  returnsInstitutionId: "099900010",
  returnsAccount: "1000200030",
  credits: [
    { amountCents: 6_000_000, fundsAvailableOn: "2026-10-06", institutionId: "099900021", account: "7700112233", payeeName: "Hollis Family Farm", crossReference: "loan_hollis-cu" },
    { amountCents: 1_500_000, fundsAvailableOn: "2026-10-06", institutionId: "099900033", account: "5500998877", payeeName: "Priya Raman-Clarke", crossReference: "loan_priya-cu" },
  ],
}

describe("AFT disbursement file (Standard 005 layout)", () => {
  const file = buildAftFile(input)

  it("is a header, one credit record per payment, and a trailer", () => {
    expect(file.records.map((r) => r.type)).toEqual(["A", "C", "C", "Z"])
  })

  it("makes every record exactly 1,464 characters", () => {
    for (const r of file.records) expect(r.text).toHaveLength(RECORD_LENGTH)
    expect(file.text.split("\n").filter(Boolean).every((l) => l.length === RECORD_LENGTH)).toBe(true)
  })

  it("places fields at the positions in the standard", () => {
    const [a, c, , z] = file.records
    expect(a.text.slice(0, 1)).toBe("A")
    expect(a.text.slice(1, 10)).toBe("000000001")
    expect(a.text.slice(20, 24)).toBe("0017")
    expect(a.text.slice(24, 30)).toBe(julian("2026-10-05"))
    expect(a.text.slice(55, 58)).toBe("CAD")
    expect(c.text.slice(27, 37)).toBe("0006000000") // amount, positions 28–37
    expect(c.text.slice(89, 104).trim()).toBe("NORTHGATE CU") // short name, 90–104
    expect(c.text.slice(264).trim()).toBe("") // segments two to six blank
    expect(z.text.slice(46, 60)).toBe(String(7_500_000).padStart(14, "0")) // total value of credits, 47–60
    expect(z.text.slice(60, 68)).toBe("00000002")
  })

  it("numbers records in sequence and repeats the origination control data", () => {
    const counts = file.records.map((r) => r.text.slice(1, 10))
    expect(counts).toEqual(["000000001", "000000002", "000000003", "000000004"])
    const control = file.records[0].text.slice(10, 24)
    for (const r of file.records.slice(1)) expect(r.text.slice(10, 24)).toBe(control)
  })

  it("trailer totals match the credits", () => {
    expect(file.totalCents).toBe(7_500_000)
  })

  it("explains every field, and the explainer covers each record end to end", () => {
    for (const r of file.records) {
      expect(r.fields.reduce((s, f) => s + f.length, 0)).toBe(RECORD_LENGTH)
      expect(r.fields.map((f) => f.value).join("")).toBe(r.text)
    }
    expect(file.records[1].fields.filter((f) => f.illustrative).map((f) => f.name)).toEqual(["Transaction type", "Amount"])
  })

  it("writes dates as 0yyddd", () => {
    expect(julian("2026-01-01")).toBe("026001")
    expect(julian("2026-12-31")).toBe("026365")
  })

  it("rejects zero amounts and oversized numbers", () => {
    expect(() => buildAftFile({ ...input, credits: [{ ...input.credits[0], amountCents: 0 }] })).toThrow()
    expect(() => buildAftFile({ ...input, credits: [{ ...input.credits[0], amountCents: 100_000_000_000 }] })).toThrow()
  })
})
