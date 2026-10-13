/*
 * Payment maths, in integer cents. Rates are illustrative APRs in basis
 * points, compounded monthly.
 */

const monthlyRate = (aprBps: number) => aprBps / 10_000 / 12

/** Level monthly payment that repays `principal` over `termMonths`, rounded up to the cent. */
export function amortizedPaymentCents(principalCents: number, aprBps: number, termMonths: number): number {
  if (principalCents <= 0) return 0
  const r = monthlyRate(aprBps)
  if (r === 0) return Math.ceil(principalCents / termMonths)
  return Math.ceil((principalCents * r) / (1 - Math.pow(1 + r, -termMonths)))
}

/** Largest principal a monthly payment can repay over `termMonths`, rounded down to the cent. */
export function maxPrincipalCents(paymentCents: number, aprBps: number, termMonths: number): number {
  if (paymentCents <= 0) return 0
  const r = monthlyRate(aprBps)
  if (r === 0) return Math.floor(paymentCents * termMonths)
  return Math.floor((paymentCents * (1 - Math.pow(1 + r, -termMonths))) / r)
}

/** Monthly payment used to assess a revolving limit: `rate` (the lender's revolvingAssessmentRate) of the limit. */
export function revolvingAssessedPaymentCents(limitCents: number, rate: number): number {
  return Math.ceil(limitCents * rate)
}

/** Interest-only monthly cost of a fully drawn line. */
export function interestOnlyCents(limitCents: number, aprBps: number): number {
  return Math.ceil(limitCents * monthlyRate(aprBps))
}

/** Rounds down to a whole step, e.g. to the nearest $500 below. */
export function roundDownCents(cents: number, stepCents: number): number {
  return Math.max(0, Math.floor(cents / stepCents) * stepCents)
}
