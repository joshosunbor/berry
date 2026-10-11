import type { QueueName } from "@/lib/schemas"

/** Standard operating procedures: the steps for each kind of queue item, so work is consistent. */
export const PLAYBOOKS: Record<QueueName, { title: string; steps: string[] }> = {
  verification: {
    title: "Review a verification check",
    steps: [
      "Open the check and read why it needs review.",
      "For a watch-list match: compare date of birth and other identifiers with the list entry; clear it only if they don't match.",
      "For a registration issue: ask the business for proof of its latest annual filing.",
      "Record the outcome and the evidence you relied on.",
      "Send to a second reviewer if you can't clear it.",
    ],
  },
  credit_referral: {
    title: "Prepare a credit sign-off",
    steps: [
      "Read the decision, its reasons and conditions.",
      "Check the documents the lender asked for are in.",
      "Confirm the amount is within the approver's delegated authority; if not, it escalates.",
      "Prepare the sign-off with a one-line summary. A different person approves it.",
    ],
  },
  fintrac_review: {
    title: "Review a large cash transaction",
    steps: [
      "Confirm the cash deposits were made by or for the same customer within 24 hours.",
      "Check whether the branch filed the Large Cash Transaction Report within 15 calendar days of receiving the cash.",
      "If it wasn't filed, file it now and record why it was late.",
      "Record that the review doesn't affect the credit decision.",
    ],
  },
  collections: {
    title: "Contact a borrower about a missed payment",
    steps: [
      "Read the loan timeline: what was returned, why, and what's been tried.",
      "Contact the borrower in plain language; listen for signs of hardship.",
      "Agree next steps: new banking details, a new payment date, or a hardship review.",
      "Don't schedule any debit inside the 2-business-day NSF window.",
      "Record the outcome on the loan.",
    ],
  },
  reconciliation: {
    title: "Resolve a reconciliation break",
    steps: [
      "Match the bank line to the ledger by reference and amount.",
      "Timing difference: confirm it clears on the next statement; no entry needed.",
      "Returned item not applied: prepare a ledger entry applying the return, and start recovery on the loan. A second person approves the entry.",
      "Record what caused the break.",
    ],
  },
  hardship: {
    title: "Approve a hardship arrangement",
    steps: [
      "Read the returned-payment history and the borrower's situation.",
      "Check the proposed deferral or re-amortization is affordable for the borrower.",
      "Prepare the arrangement with the payments it moves. A lead or above approves it.",
      "Send the borrower a plain-language confirmation.",
    ],
  },
  payee_confirmation: {
    title: "Confirm a payee before an instant send",
    steps: [
      "Read why the account check was a close match.",
      "Call the borrower on a number already on file, not one from the application or an email.",
      "Confirm the account details match what they expect.",
      "Prepare the release. A second person approves it before funds are sent.",
    ],
  },
}
