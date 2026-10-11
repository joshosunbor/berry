import type { OpsItem } from "./queues"

/*
 * Templated customer messages for queue items, previewed before sending.
 * Simulated: nothing is sent. Screening and FINTRAC reviews have no
 * customer message, because those reviews aren't disclosed to the customer.
 */

export interface Message {
  subject: string
  body: string
}

export type MessageOrReason = { message: Message } | { none: string }

const SIGN_OFF = "If you have questions, reply to this message or call the number on your account documents."

export function messageFor(item: Pick<OpsItem, "queue" | "id" | "subject">): MessageOrReason {
  switch (item.queue) {
    case "verification":
      if (item.id.includes("screening")) return { none: "No customer message: screening reviews aren't disclosed to the customer." }
      return {
        message: {
          subject: "One more document for your application",
          body: `We couldn't confirm your business registration is up to date. Please send a copy of your latest annual filing, or a recent certificate of status. Your application stays open while we wait. ${SIGN_OFF}`,
        },
      }
    case "fintrac_review":
      return { none: "No customer message: reporting reviews aren't disclosed to the customer." }
    case "reconciliation":
      return { none: "No customer message: this is an internal accounting check." }
    case "credit_referral":
      return item.id.startsWith("q_referral")
        ? {
            message: {
              subject: "Your application: a lender is reviewing it",
              body: `A lender is reviewing your application in person. We may ask for one or two documents, such as recent statements. We'll be in touch within two business days. ${SIGN_OFF}`,
            },
          }
        : {
            message: {
              subject: "Your application: final sign-off",
              body: `Your application has been assessed and is with the person who signs off loans of this size. We'll confirm the outcome and next steps as soon as that's done. ${SIGN_OFF}`,
            },
          }
    case "collections":
      return {
        message: {
          subject: "A payment didn't go through",
          body: `Your scheduled payment didn't go through. You don't need to do anything today. We'd like to talk about what would work for you: a new date, new banking details, or other options if things are hard right now. ${SIGN_OFF}`,
        },
      }
    case "hardship":
      return {
        message: {
          subject: "Your payment break",
          body: `We've paused your payments for three months. No payments will be taken during that time, and we won't charge late fees. We'll contact you before payments start again to confirm the amount and date. ${SIGN_OFF}`,
        },
      }
    case "payee_confirmation":
      return {
        message: {
          subject: "Confirming where to send your loan",
          body: `Before we send your funds, we'll call you on the number already on your file to confirm your account details. We will never ask for your password, a one-time code or a payment from you. ${SIGN_OFF}`,
        },
      }
  }
}
