/**
 * Deal ID status (ZSGTSFTR_DEALID-ZDEAL_STAT, texts in ZSGTSFTR_DEAL_ST).
 *
 * A different lifecycle from the transaction status (TXN_STATUS in ZSGTSFTR_APP_STR, shared/fx/txn-status.ts).
 * The two share digits and nothing else: ZDEAL_STAT 02 is not TXN_STATUS 02, and a Deal ID reaching 02 never
 * writes a transaction status.  Keep them in separate constants and never map one to the other.
 */
export const DEAL_STATUS = {
  /** Created: normal maintenance (Change / Confirm, Edit Deal Pair, Cancel). */
  CREATED: '01',
  /** Confirmed by the deal-analysis screen (ZCONFIRM = X); Reverse MO Confirmation applies. */
  CONFIRMED: '02',
  /** Confirmed by MO; Reverse MO Confirmation applies. */
  MO_CONFIRMED: '03',
  /** Deal ID Cancelled. */
  CANCELLED: '30',
} as const

export type DealStatus = (typeof DEAL_STATUS)[keyof typeof DEAL_STATUS]

/** Statuses in which Reverse MO Confirmation is offered. */
export const REVERSIBLE_DEAL_STATUSES: readonly string[] = [DEAL_STATUS.CONFIRMED, DEAL_STATUS.MO_CONFIRMED]
