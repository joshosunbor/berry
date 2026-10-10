import { describe, expect, it } from "vitest"
import {
  Approval,
  ComplianceFlag,
  Consent,
  Decision,
  LedgerEntry,
  Mode,
  Transaction,
} from "@/lib/schemas"

const txn = {
  transactionId: "txn_a-1",
  accountId: "acc_a-chq",
  postedDate: "2026-03-02",
  transactionTimestamp: "2026-03-02T09:15:00-05:00",
  amountCents: 125_000,
  debitCreditMemo: "CREDIT",
  description: "Payroll deposit",
  category: "PAYROLL",
  channel: "EFT",
}

describe("money is integer cents", () => {
  it("accepts a valid transaction", () => {
    expect(Transaction.safeParse(txn).success).toBe(true)
  })
  it("rejects fractional cents", () => {
    expect(Transaction.safeParse({ ...txn, amountCents: 1250.5 }).success).toBe(false)
  })
  it("rejects negative and zero transaction amounts", () => {
    expect(Transaction.safeParse({ ...txn, amountCents: -100 }).success).toBe(false)
    expect(Transaction.safeParse({ ...txn, amountCents: 0 }).success).toBe(false)
  })
  it("allows signed ledger amounts but not floats", () => {
    const entry = {
      id: "led_1",
      loanId: "loan_1",
      seq: 0,
      type: "payment",
      amountCents: -45_000,
      effectiveDate: "2026-04-01",
      postedAt: "2026-04-01T10:00:00-04:00",
      memo: "PAD payment",
    }
    expect(LedgerEntry.safeParse(entry).success).toBe(true)
    expect(LedgerEntry.safeParse({ ...entry, amountCents: -450.25 }).success).toBe(false)
  })
})

describe("enums and ids", () => {
  it("rejects an unknown mode", () => {
    expect(Mode.safeParse("credit_union").success).toBe(true)
    expect(Mode.safeParse("neobank").success).toBe(false)
  })
  it("rejects an id with the wrong prefix", () => {
    expect(Transaction.safeParse({ ...txn, transactionId: "loan_1" }).success).toBe(false)
  })
})

describe("compliance flags are never credit factors", () => {
  const flag = {
    type: "FINTRAC_LCTR_CANDIDATE",
    summary: "Two cash deposits totalling $10,400 within 24 hours",
    transactionIds: ["txn_a-1", "txn_a-2"],
    totalCents: 1_040_000,
    rule: "24_hour",
    creditFactor: false,
    source: "https://fintrac-canafe.canada.ca/guidance-directives/transaction-operation/lctr-doie/lctr-doie-eng",
  }
  it("accepts creditFactor false", () => {
    expect(ComplianceFlag.safeParse(flag).success).toBe(true)
  })
  it("rejects creditFactor true", () => {
    expect(ComplianceFlag.safeParse({ ...flag, creditFactor: true }).success).toBe(false)
  })
})

describe("decision invariants", () => {
  const base = {
    id: "dec_priya-cu",
    applicantId: "apl_priya",
    mode: "credit_union",
    institutionId: "northgate",
    outcome: "decline",
    product: "personal_loan",
    limitCents: 0,
    aprBps: null,
    termMonths: null,
    structure: null,
    reasons: [],
    counterfactuals: [],
    flags: [],
    inputsUsed: [],
    paymentCents: null,
    decidedAt: "2026-10-01T12:00:00-04:00",
    engineVersion: "0.1.0",
    policyVersion: 1,
  }
  it("a decline has no limit", () => {
    expect(Decision.safeParse(base).success).toBe(true)
    expect(Decision.safeParse({ ...base, limitCents: 100_000 }).success).toBe(false)
  })
  it("a conditional approval needs conditions", () => {
    const conditional = { ...base, outcome: "approve_with_conditions", limitCents: 500_000 }
    expect(Decision.safeParse(conditional).success).toBe(false)
    expect(Decision.safeParse({ ...conditional, conditions: ["Provide 2025 financial statements"] }).success).toBe(true)
  })
})

describe("maker-checker", () => {
  const approval = {
    id: "apv_1",
    kind: "limit_override",
    subject: { kind: "decision", id: "dec_1" },
    makerId: "usr_ana",
    madeAt: "2026-10-01T12:00:00-04:00",
    status: "pending",
    reason: "Long-standing member, seasonal income",
  }
  it("rejects the maker approving their own item", () => {
    expect(
      Approval.safeParse({ ...approval, status: "approved", checkerId: "usr_ana", checkedAt: "2026-10-01T13:00:00-04:00" })
        .success,
    ).toBe(false)
  })
  it("rejects approval without a checker", () => {
    expect(Approval.safeParse({ ...approval, status: "approved" }).success).toBe(false)
  })
  it("accepts a different checker", () => {
    expect(
      Approval.safeParse({ ...approval, status: "approved", checkerId: "usr_lead", checkedAt: "2026-10-01T13:00:00-04:00" })
        .success,
    ).toBe(true)
  })
})

describe("consent", () => {
  const consent = {
    id: "cns_1",
    applicantId: "apl_priya",
    dataCategories: ["balances", "transactions"],
    notRequested: ["investments", "registered_accounts"],
    purpose: "Assess your application for a personal loan",
    recipient: "Northgate Credit Union",
    accountIds: ["acc_priya-chq"],
    grantedAt: "2026-10-01T12:00:00-04:00",
    expiresAt: "2027-01-01T12:00:00-05:00",
  }
  it("accepts consent within 12 months", () => {
    expect(Consent.safeParse(consent).success).toBe(true)
  })
  it("rejects consent longer than 12 months", () => {
    expect(Consent.safeParse({ ...consent, expiresAt: "2027-12-01T12:00:00-05:00" }).success).toBe(false)
  })
})
