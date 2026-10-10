import type { Rng } from "@/lib/rng"
import type { Account, Channel, Transaction, TransactionCategory } from "@/lib/schemas"

/**
 * Collects draft transactions in any order, then sorts them and assigns
 * stable ids (`txn_<slug>-00001`) so output is deterministic.
 */

export interface Draft {
  key: number
  accountId: string
  date: string
  time: string
  amountCents: number
  memo: "CREDIT" | "DEBIT"
  description: string
  category: TransactionCategory
  channel: Channel
  merchant?: string
  returnOf?: { draft: Draft; reasonCode: string }
}

export interface DraftOptions {
  merchant?: string
  /** `HH:MM` local time. Random within the channel's usual hours if omitted. */
  time?: string
}

/** Typical local hours by channel, as [earliest, latest] minutes after midnight. */
const HOURS: Record<Channel, [number, number]> = {
  EFT: [5 * 60, 7 * 60],
  PAD: [3 * 60, 6 * 60],
  CARD: [8 * 60, 21 * 60],
  CASH: [9 * 60, 17 * 60],
  ETRANSFER: [7 * 60, 22 * 60],
  CHEQUE: [10 * 60, 16 * 60],
  ATM: [8 * 60, 22 * 60],
  INTERNAL: [6 * 60, 23 * 60],
}

export class TxnBuilder {
  private drafts: Draft[] = []

  constructor(
    readonly slug: string,
    readonly rng: Rng,
    /** Fixed UTC offset for the applicant's province (standard time). */
    readonly utcOffset: string,
  ) {}

  private add(memo: Draft["memo"], accountId: string, date: string, amountCents: number, category: TransactionCategory, description: string, channel: Channel, opts: DraftOptions = {}): Draft {
    const cents = Math.round(amountCents)
    if (cents <= 0) throw new Error(`${this.slug}: non-positive amount for "${description}" on ${date}`)
    const [lo, hi] = HOURS[channel]
    const minutes = this.rng.int(lo, hi)
    const time = opts.time ?? `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
    const draft: Draft = { key: this.drafts.length, accountId, date, time, amountCents: cents, memo, description, category, channel, merchant: opts.merchant }
    this.drafts.push(draft)
    return draft
  }

  credit(accountId: string, date: string, amountCents: number, category: TransactionCategory, description: string, channel: Channel, opts?: DraftOptions): Draft {
    return this.add("CREDIT", accountId, date, amountCents, category, description, channel, opts)
  }

  debit(accountId: string, date: string, amountCents: number, category: TransactionCategory, description: string, channel: Channel, opts?: DraftOptions): Draft {
    return this.add("DEBIT", accountId, date, amountCents, category, description, channel, opts)
  }

  /**
   * A debit returned unpaid: the debit, its reversal credit carrying the
   * Payments Canada return reason code, and the bank's NSF fee if any.
   */
  returnedDebit(accountId: string, date: string, amountCents: number, category: TransactionCategory, description: string, opts: { reasonCode: string; nsfFeeCents: number; merchant?: string }): Draft {
    const original = this.debit(accountId, date, amountCents, category, description, "PAD", { merchant: opts.merchant, time: "04:30" })
    const reversal = this.credit(accountId, date, amountCents, "PAYMENT_REVERSAL", `Returned item: ${description}`, "PAD", { time: "15:00" })
    reversal.returnOf = { draft: original, reasonCode: opts.reasonCode }
    if (opts.nsfFeeCents > 0) {
      this.debit(accountId, date, opts.nsfFeeCents, "NSF_FEE", "NSF fee", "INTERNAL", { time: "23:00" })
    }
    return original
  }

  /** Moves money between two of the applicant's own accounts. */
  transfer(fromId: string, toId: string, date: string, amountCents: number, description: string, outCategory: TransactionCategory = "TRANSFER_OUT", inCategory: TransactionCategory = "TRANSFER_IN"): void {
    const time = "07:00"
    this.debit(fromId, date, amountCents, outCategory, description, "INTERNAL", { time })
    this.credit(toId, date, amountCents, inCategory, description, "INTERNAL", { time })
  }

  build(windowStart: string, windowEnd: string): Transaction[] {
    const inWindow = this.drafts.filter((d) => d.date >= windowStart && d.date <= windowEnd)
    const sorted = [...inWindow].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.key - b.key)
    const ids = new Map<Draft, string>()
    sorted.forEach((d, i) => ids.set(d, `txn_${this.slug}-${String(i + 1).padStart(5, "0")}`))
    return sorted.map((d) => {
      const txn: Transaction = {
        transactionId: ids.get(d)!,
        accountId: d.accountId,
        postedDate: d.date,
        transactionTimestamp: `${d.date}T${d.time}:00${this.utcOffset}`,
        amountCents: d.amountCents,
        debitCreditMemo: d.memo,
        description: d.description,
        category: d.category,
        channel: d.channel,
      }
      if (d.merchant) txn.merchant = d.merchant
      if (d.returnOf) {
        const originalId = ids.get(d.returnOf.draft)
        if (!originalId) throw new Error(`${this.slug}: returned item outside the window`)
        txn.returnOf = { transactionId: originalId, reasonCode: d.returnOf.reasonCode }
      }
      return txn
    })
  }
}

const DEPOSIT_TYPES = new Set<Account["accountType"]>(["CHECKING", "SAVINGS", "BUSINESS_CHECKING", "BUSINESS_SAVINGS"])

/**
 * Raises a deposit account's opening balance, if needed, so its running
 * balance never drops below `floorCents`. Credit accounts are left alone.
 */
export function settleOpeningBalance(account: Account, transactions: Transaction[], floorCents: number): Account {
  if (!DEPOSIT_TYPES.has(account.accountType)) return account
  let balance = 0
  let min = 0
  for (const t of transactions) {
    if (t.accountId !== account.accountId) continue
    balance += t.debitCreditMemo === "CREDIT" ? t.amountCents : -t.amountCents
    min = Math.min(min, balance)
  }
  const needed = floorCents - min
  return { ...account, openingBalanceCents: Math.max(account.openingBalanceCents, needed) }
}
