/**
 * What must be true before an invoice can be confirmed, as a business message instead of a failure half-way through the steps.
 * The invoice (T1, T2, T3 of "Trade Invoices") is built from the BLs assigned to the Deal ID; with no BLs, or with BLs
 * that have no invoice row yet, there is nothing to confirm and the confirmation would stop at its first check.
 */
import type { Deal, InvRow } from './types.ts'

const ADJ_KEY = ['ZDEAL_ID', 'ZINV_REF', 'ZINV_TYPE', 'ZPRE_T_REF'] as const

/**
 * Each invoice row is saved under (Deal ID, trade invoice reference, invoice type, pre-invoice ref). The trade invoice
 * reference (T1, T2, T3 of the Deal ID: ZSGTSFTR_INV_REF) tells the legs apart; without it the rows share one key, so saving
 * them would fail on the second row or overwrite the first. Returns the problem in words, '' when the keys are distinct.
 */
export function invoiceKeyProblem(dealId: string, rows: readonly InvRow[]): string {
  const todo = rows.filter((r) => !r.locked)
  if (todo.some((r) => !r.invTrmRef)) {
    return `Deal ID ${dealId} has no trade invoice references (T1, T2, T3 in ZSGTSFTR_INV_REF), so its invoices cannot be told apart and would overwrite each other. They are created with the Deal ID; ask for them to be maintained for this Deal ID, then reload.`
  }
  const seen = new Set<string>()
  for (const r of todo) {
    const key = ADJ_KEY.map((k) => String(r.rec[k] ?? '')).join('|')
    if (seen.has(key)) return `Two invoice rows of Deal ID ${dealId} would be saved under the same key (${r.invTrmRef || r.ttype}), so one would overwrite the other. Nothing was changed.`
    seen.add(key)
  }
  return ''
}

export type ConfirmBlocker = {
  /** '' = nothing in the way. */
  code: '' | 'loading' | 'bls-error' | 'no-bls' | 'no-rows' | 'no-refs' | 'nothing-left'
  /** What is missing and how to resolve it, for the user. */
  message: string
  /** True when the cause is missing master data, so no action on the screen can fix it. */
  blocked?: boolean
}

const NONE: ConfirmBlocker = { code: '', message: '' }

export function confirmBlocker(deal: Deal, bls: { loading: boolean; error: string; count: number }): ConfirmBlocker {
  if (bls.loading) return { code: 'loading', message: 'The assigned BLs are still being read from SAP. Wait a moment, then try again.' }
  if (bls.error) return { code: 'bls-error', message: `The BLs of Deal ID ${deal.dealId} could not be read from SAP (${bls.error}). Press Refresh and try again.` }
  // The invoice grid cannot be built for this Deal ID (missing master data): rows would not help, and the reason is the one SAP's data gives.
  if (deal.invReason && bls.count > 0) return { code: 'no-rows', blocked: true, message: deal.invReason }
  if (bls.count === 0) {
    const stale = deal.status === '04' ? ' Its status shows 04 (BL Assigned to Deal ID), but SAP holds no BL for it: the status was set outside a BL assignment.' : ''
    return { code: 'no-bls', message: `No BLs are assigned to Deal ID ${deal.dealId}. Assign them in Trade Flows → Propose Tradeflow first.${stale}` }
  }
  if (deal.inv.length === 0) {
    return {
      code: 'no-rows',
      message: `${bls.count} BL${bls.count === 1 ? ' is' : 's are'} assigned to Deal ID ${deal.dealId} in SAP, but the invoice rows (Trade Invoices: T1, T2, T3) have not been created from them yet. Use "Create invoice rows" to build them from the assigned BLs.`,
    }
  }
  const keys = invoiceKeyProblem(deal.dealId, deal.inv)
  if (keys) return { code: 'no-refs', message: keys }
  if (deal.inv.every((r) => r.locked)) return { code: 'nothing-left', message: `Every invoice row of Deal ID ${deal.dealId} already carries an invoice type, so there is nothing left to confirm.` }
  return NONE
}
