/**
 * Step 2 of the invoice wizard: each invoice leg (a row of the Trade Invoices) is verified on its own. A leg is known by its own
 * identity, not by its position, and its verification holds only for the values that were on screen when it was ticked: if the
 * leg is recalculated or edited, it is unticked again. No amount is added or combined here.
 */
import type { InvRow } from './types.ts'

/** What identifies a leg among the rows of one Deal ID. */
export const legId = (r: Pick<InvRow, 'ttype' | 'invTrmRef' | 'invType' | 'commodity' | 'gtComm' | 'invDate'>): string =>
  [r.ttype, r.invTrmRef, r.invType, r.commodity, r.gtComm, r.invDate].join('|')

/** The values a verification stands for. */
export const legFingerprint = (r: Pick<InvRow, 'qty' | 'usdPrice' | 'rate' | 'price' | 'amt' | 'amtUsd' | 'planned' | 'invDate' | 'dueDate'>): string =>
  [r.qty, r.usdPrice, r.rate, r.price, r.amt, r.amtUsd, r.planned, r.invDate, r.dueDate].join('|')

export type Verified = Readonly<Record<string, string>>

export const isVerified = (verified: Verified, r: InvRow): boolean => verified[legId(r)] === legFingerprint(r)

/** True when every leg is verified (a deal with no leg to verify has nothing to wait for). */
export const allVerified = (verified: Verified, legs: readonly InvRow[]): boolean => legs.every((r) => isVerified(verified, r))

export const toggled = (verified: Verified, r: InvRow, on: boolean): Verified => {
  const next = { ...verified }
  if (on) next[legId(r)] = legFingerprint(r)
  else delete next[legId(r)]
  return next
}
