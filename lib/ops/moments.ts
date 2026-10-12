/** Points in the simulation the operations console can jump to (lender's local time). */
export const OPS_MOMENTS = [
  { at: "2026-10-01T10:00", label: "Oct 1, 10:00", note: "Decisions reach operations" },
  { at: "2026-10-05T09:00", label: "Oct 5, 9:00", note: "Large sign-offs wait for the Credit Committee" },
  { at: "2026-10-06T10:05", label: "Oct 6, 10:05", note: "Funding morning: a payee to confirm" },
  { at: "2026-12-01T09:05", label: "Dec 1, 9:05", note: "Accounts that can't take debits" },
  { at: "2027-01-13T09:05", label: "Jan 13, 2027, 9:05", note: "A retry failed" },
  { at: "2027-02-01T09:05", label: "Feb 1, 2027, 9:05", note: "Month-end reconciliation breaks" },
  { at: "2027-02-04T09:05", label: "Feb 4, 2027, 9:05", note: "A hardship request" },
  { at: "2027-10-06T17:00", label: "Oct 6, 2027", note: "Twelve months on" },
] as const

export type OpsMoment = (typeof OPS_MOMENTS)[number]["at"]
export const OPS_START: OpsMoment = OPS_MOMENTS[0].at
/** The dashboard opens on a book with a year of history; on day one every figure would be zero. */
export const DASHBOARD_START: OpsMoment = OPS_MOMENTS[OPS_MOMENTS.length - 1].at
