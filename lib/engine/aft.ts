/*
 * Automated funds transfer (AFT) disbursement file in the Payments Canada
 * Standard 005 layout: header (A), credit (C) and trailer (Z) records of
 * 1,464 characters. Field positions and widths follow Standard 005
 * (amendment 23, July 22, 2024):
 * https://www.payments.ca/sites/default/files/standard005eng.pdf
 *
 * ILLUSTRATIVE, NOT FOR SUBMISSION:
 * - real files are EBCDIC; Berry writes ASCII with a line break between
 *   records so the file can be read
 * - amounts are written in cents, which the standard's sample implies but
 *   does not state
 * - the transaction type code comes from Standard 007, which Berry has not
 *   checked; a placeholder code is used
 * - every institution number, account, originator ID and data centre is
 *   fictional
 */

export const RECORD_LENGTH = 1464
export const SEGMENT_LENGTH = 240

type Kind = "N" | "AN"

export interface FieldSpec {
  name: string
  start: number
  length: number
  kind: Kind
  description: string
  illustrative?: string
}

export interface FieldValue extends FieldSpec {
  value: string
}

export interface AftRecord {
  type: "A" | "C" | "Z"
  text: string
  fields: FieldValue[]
}

/** Numeric: right-justified, zero-filled. Alphanumeric: left-justified here, space-filled. */
function fit(value: string | number, length: number, kind: Kind): string {
  const s = String(value)
  if (kind === "N") {
    if (!/^\d*$/.test(s)) throw new Error(`numeric field got "${s}"`)
    if (s.length > length) throw new Error(`"${s}" exceeds ${length} digits`)
    return s.padStart(length, "0")
  }
  const ascii = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
  return ascii.slice(0, length).padEnd(length, " ")
}

function record(type: AftRecord["type"], specs: FieldSpec[], values: (string | number)[]): AftRecord {
  let text = ""
  const fields: FieldValue[] = specs.map((spec, i) => {
    if (text.length + 1 !== spec.start) throw new Error(`${type}: ${spec.name} expected at ${text.length + 1}, specified ${spec.start}`)
    const v = fit(values[i] ?? "", spec.length, spec.kind)
    text += v
    return { ...spec, value: v }
  })
  if (text.length !== RECORD_LENGTH) throw new Error(`${type} record is ${text.length} characters`)
  return { type, text, fields }
}

/** Date as 0yyddd: a zero, two-digit year and three-digit day of year. */
export function julian(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const start = Date.UTC(d.getUTCFullYear(), 0, 1)
  const day = Math.floor((d.getTime() - start) / 86_400_000) + 1
  return `0${String(d.getUTCFullYear()).slice(2)}${String(day).padStart(3, "0")}`
}

const A_SPEC: FieldSpec[] = [
  { name: "Logical record type", start: 1, length: 1, kind: "AN", description: "A for the header record." },
  { name: "Logical record count", start: 2, length: 9, kind: "N", description: "Always 1 for the header; each following record adds one." },
  { name: "Originator's ID", start: 11, length: 10, kind: "AN", description: "Identifies the originating institution's file sender (fictional)." },
  { name: "File creation number", start: 21, length: 4, kind: "N", description: "Increases by one per file, 0001 to 9999; a duplicate is rejected." },
  { name: "Creation date", start: 25, length: 6, kind: "N", description: "0yyddd. A file more than 7 days old may be rejected." },
  { name: "Destination data centre", start: 31, length: 5, kind: "N", description: "Data centre that receives the file (fictional)." },
  { name: "Reserved customer–direct clearer area", start: 36, length: 20, kind: "AN", description: "Blank here." },
  { name: "Currency code", start: 56, length: 3, kind: "AN", description: "CAD or USD." },
  { name: "Filler", start: 59, length: 1406, kind: "AN", description: "Spaces." },
]

const C_PREFIX: FieldSpec[] = [
  { name: "Logical record type", start: 1, length: 1, kind: "AN", description: "C for a credit record." },
  { name: "Logical record count", start: 2, length: 9, kind: "N", description: "Position of this record in the file." },
  { name: "Origination control data", start: 11, length: 14, kind: "AN", description: "Originator's ID plus file creation number, repeated from the header." },
]

const SEGMENT: Omit<FieldSpec, "start">[] = [
  { name: "Transaction type", length: 3, kind: "N", description: "Payment type code from Standard 007.", illustrative: "Placeholder code; Standard 007 not checked." },
  { name: "Amount", length: 10, kind: "N", description: "Amount of the credit, greater than zero.", illustrative: "Written in cents: implied by the standard's sample, not stated." },
  { name: "Date funds to be available", length: 6, kind: "N", description: "0yyddd; no more than 14 days after creation." },
  { name: "Institutional ID number", length: 9, kind: "N", description: "0 + 3-digit institution + 5-digit branch of the borrower's account (fictional)." },
  { name: "Payee account number", length: 12, kind: "AN", description: "Borrower's account (fictional)." },
  { name: "Item trace number", length: 22, kind: "N", description: "Destination data centre (4) + originating data centre (5) + file number (4) + sequence (9)." },
  { name: "Stored transaction type", length: 3, kind: "N", description: "Zeros on first presentation." },
  { name: "Originator's short name", length: 15, kind: "AN", description: "Short lender name shown to the borrower." },
  { name: "Payee name", length: 30, kind: "AN", description: "Borrower's name." },
  { name: "Originator's long name", length: 30, kind: "AN", description: "Full lender name." },
  { name: "Originating direct clearer's user ID", length: 10, kind: "AN", description: "Optional; blank here." },
  { name: "Originator's cross reference number", length: 19, kind: "AN", description: "Lender's own reference: the loan number." },
  { name: "Institutional ID for returns", length: 9, kind: "N", description: "Where a returned item goes (fictional)." },
  { name: "Account number for returns", length: 12, kind: "AN", description: "Lender's account for returned items (fictional)." },
  { name: "Originator's sundry information", length: 15, kind: "AN", description: "Optional; blank here." },
  { name: "Filler", length: 22, kind: "AN", description: "Spaces." },
  { name: "Originator–direct clearer settlement code", length: 2, kind: "AN", description: "Optional; blank here." },
  { name: "Invalid data element ID", length: 11, kind: "N", description: "Zeros on first presentation." },
]

const Z_SPEC: FieldSpec[] = [
  { name: "Logical record type", start: 1, length: 1, kind: "AN", description: "Z for the trailer record." },
  { name: "Logical record count", start: 2, length: 9, kind: "N", description: "Total number of records, including this one." },
  { name: "Origination control data", start: 11, length: 14, kind: "AN", description: "Repeated from the header." },
  { name: "Total value of debits", start: 25, length: 14, kind: "N", description: "Zero: this file has no debits." },
  { name: "Total number of debits", start: 39, length: 8, kind: "N", description: "Zero." },
  { name: "Total value of credits", start: 47, length: 14, kind: "N", description: "Sum of every credit amount; must match or the file is rejected." },
  { name: "Total number of credits", start: 61, length: 8, kind: "N", description: "Number of credit transactions." },
  { name: "Total value of error corrections E", start: 69, length: 14, kind: "N", description: "Zero." },
  { name: "Total number of error corrections E", start: 83, length: 8, kind: "N", description: "Zero." },
  { name: "Total value of error corrections F", start: 91, length: 14, kind: "N", description: "Zero." },
  { name: "Total number of error corrections F", start: 105, length: 8, kind: "N", description: "Zero." },
  { name: "Filler", start: 113, length: 1352, kind: "AN", description: "Spaces." },
]

export interface AftCredit {
  amountCents: number
  fundsAvailableOn: string
  institutionId: string
  account: string
  payeeName: string
  crossReference: string
}

export interface AftFileInput {
  originatorId: string
  fileCreationNumber: number
  createdOn: string
  destinationDataCentre: string
  originatingDataCentre: string
  shortName: string
  longName: string
  returnsInstitutionId: string
  returnsAccount: string
  credits: AftCredit[]
}

/** Placeholder payment type code (Standard 007 not checked). */
export const PLACEHOLDER_TRANSACTION_TYPE = "450"

export function buildAftFile(input: AftFileInput): { records: AftRecord[]; text: string; totalCents: number } {
  if (!input.credits.length) throw new Error("an AFT file needs at least one credit")
  const fileNo = String(input.fileCreationNumber).padStart(4, "0")
  const control = `${fit(input.originatorId, 10, "AN")}${fileNo}`
  const records: AftRecord[] = []

  records.push(record("A", A_SPEC, ["A", 1, input.originatorId, fileNo, julian(input.createdOn), input.destinationDataCentre, "", "CAD", ""]))

  input.credits.forEach((c, i) => {
    if (c.amountCents <= 0) throw new Error("credit amounts must be greater than zero")
    const trace = `${input.destinationDataCentre.slice(-4).padStart(4, "0")}${input.originatingDataCentre.padStart(5, "0")}${fileNo}${String(i + 1).padStart(9, "0")}`
    const segmentValues = [
      PLACEHOLDER_TRANSACTION_TYPE,
      c.amountCents,
      julian(c.fundsAvailableOn),
      c.institutionId,
      c.account,
      trace,
      0,
      input.shortName,
      c.payeeName,
      input.longName,
      "",
      c.crossReference,
      input.returnsInstitutionId,
      input.returnsAccount,
      "",
      "",
      "",
      0,
    ]
    let start = 25
    const segment: FieldSpec[] = SEGMENT.map((f) => {
      const spec = { ...f, start }
      start += f.length
      return spec
    })
    // Segments two to six are unused: initialized entirely to spaces (Standard 005).
    const blank: FieldSpec = { name: "Segments two to six (unused)", start: 265, length: 5 * SEGMENT_LENGTH, kind: "AN", description: "Unused segments are filled entirely with spaces." }
    records.push(record("C", [...C_PREFIX, ...segment, blank], ["C", records.length + 1, control, ...segmentValues, ""]))
  })

  const total = input.credits.reduce((s, c) => s + c.amountCents, 0)
  records.push(record("Z", Z_SPEC, ["Z", records.length + 1, control, 0, 0, total, input.credits.length, 0, 0, 0, 0, ""]))
  return { records, text: records.map((r) => r.text).join("\n") + "\n", totalCents: total }
}
