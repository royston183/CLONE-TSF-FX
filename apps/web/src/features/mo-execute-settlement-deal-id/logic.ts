/** Pure business rules of the Execute Settlement for Deal ID screen. No DOM, no state. */
import { formatAmount } from './format.ts'
import type { Deal, FxDeal, FxPostDefaults, Indexed, InvPostForm, Result, StatusMeta, TradeInvoice } from './types.ts'

export const DEAL_ID_REQUIRED = 'Please enter a Deal ID. (Deal ID is a mandatory field.)'
export const DATE_REQUIRED = 'Enter a date first.'
export const dealNotFound = (id: string): string => `Deal ID ${id} does not exist in ZSGTSFTR_DEALID.`

// ------------------------------------------------------------------ selection screen

/** P_DEAL: any non-blank value, upper-cased; the program then reads ZSGTSFTR_DEALID by it. */
export function normalizeDealId(raw: string): string | null {
  const v = raw.trim()
  return v === '' ? null : v.toUpperCase()
}

// ------------------------------------------------------------------ status

/** Pill colour by status code band (display only; the codes are ZSGTSFTR_DEAL_ST's). */
export function statusClass(code: string): string {
  const n = parseInt(code, 10)
  if (!Number.isFinite(n) || n < 5) return 'pill-early'
  if (n < 15) return 'pill-progress'
  if (n < 20) return 'pill-due'
  if (n === 20) return 'pill-init'
  return 'pill-done'
}

/** The status's ZSGTSFTR_DEAL_ST text; an unknown code keeps its code and has no text. */
export function statusMeta(code: string, statuses: readonly StatusMeta[]): StatusMeta {
  return statuses.find((s) => s.code === code) ?? { code, text: '', cls: statusClass(code) }
}

export type ToolbarVisibility = { showInit: boolean; showExeC: boolean }

/**
 * Status-driven toolbar: Initiate Settlement is offered for 05..19, Execution Complete only at
 * 20, neither at or below 04 or from 21 up.
 */
export function toolbarVisibility(statusCode: string): ToolbarVisibility {
  const stat = parseInt(statusCode, 10)
  if (stat >= 5 && stat <= 19) return { showInit: true, showExeC: false }
  if (stat === 20) return { showInit: false, showExeC: true }
  return { showInit: false, showExeC: false }
}

/** Execution Complete needs every FX leg and (unless there is no invoice) every invoice leg settled. */
export function settlementComplete(fxDeals: readonly FxDeal[], invoices: readonly TradeInvoice[], noInvoiceFlag: boolean): boolean {
  const allFxDone = fxDeals.every((r) => r.statusChip === 'chip-done')
  const allInvDone = noInvoiceFlag || invoices.every((r) => r.setCo)
  return allFxDone && allInvDone
}

export const REMAINING_LEGS_MESSAGE = 'Please also do the settlement of all remaining legs. Do you want to continue?'

// ------------------------------------------------------------------ grids

const includesQuery = (haystack: string, q: string) => haystack.toLowerCase().includes(q.toLowerCase())

export function filterFxDeals(rows: readonly FxDeal[], query: string): Indexed<FxDeal>[] {
  return rows
    .map((row, idx) => ({ row, idx }))
    .filter(
      ({ row: r }) =>
        !query ||
        includesQuery(`${r.rfha} ${r.bp} ${r.dealType} ${r.entity} ${r.curr1} ${r.curr2} ${r.mcRefNo} ${r.status}`, query),
    )
}

export function filterInvoices(rows: readonly TradeInvoice[], query: string): Indexed<TradeInvoice>[] {
  return rows
    .map((row, idx) => ({ row, idx }))
    .filter(
      ({ row: r }) =>
        !query || includesQuery(`${r.leg} ${r.trfDesc} ${r.xblnr} ${r.curr} ${r.recPay} ${r.trfType}`, query),
    )
}

/** Clicking the selected row again clears the selection. */
export const toggleRowSelection = (current: number | null, idx: number): number | null => (current === idx ? null : idx)

// ------------------------------------------------------------------ Amend Deal End Date / Edit DMS

export const amendDateInitial = (deal: Deal): string => deal.revisedEndDate || deal.dealEndDate

/** The popups' only validation: a date is required. */
export function validateDate(raw: string): Result<string> {
  const v = raw.trim()
  return v ? { ok: true, value: v } : { ok: false, error: DATE_REQUIRED }
}

// ------------------------------------------------------------------ FX-Invoice Difference / P&L

/** Diff 1 Amt: (all-in rate - spot) x amount 1 / 100, two decimals. */
export const diff1Amount = (r: FxDeal): string => (((parseFloat(r.rate) - parseFloat(r.spot)) * r.amt1) / 100).toFixed(2)

/**
 * Realised profit shown on the D2 leg only: (D2 all-in rate - D1 all-in rate) x D1 amount 1,
 * as the original computed it from the first two FX rows. Other legs have none.
 */
export function plAmount(fxDeals: readonly FxDeal[], r: FxDeal): number | null {
  if (r.dealType !== 'D2') return null
  const d1 = fxDeals[0]
  const d2 = fxDeals[1]
  if (!d1 || !d2) return 0
  return (parseFloat(d2.rate) - parseFloat(d1.rate)) * d1.amt1
}

// ------------------------------------------------------------------ FX transaction posting (9003)

export const dealTypeLabel = (r: FxDeal): string =>
  `${r.dealType} - ${r.dealType === 'D1' ? 'Buy/Sell leg 1' : 'Buy/Sell leg 2'}`

export function fxPostDefaults(r: FxDeal): FxPostDefaults {
  return {
    bukrs: r.bukrs,
    rfha: r.rfha,
    dealType: dealTypeLabel(r),
    partner: r.bp,
    bAmt: `${formatAmount(r.amt2)} ${r.curr2}`,
    sAmt: `${formatAmount(r.amt1)} ${r.curr1}`,
    bDoc: r.doc2 || '',
    sDoc: r.doc1 || '',
  }
}

export const POST_FX_FIRST = 'Post the accounting entry before marking settlement complete.'

/** Settlement Complete is only allowed once both FI documents exist. */
export function completeFx(r: FxDeal): Result<FxDeal> {
  if (!r.doc1 || !r.doc2) return { ok: false, error: POST_FX_FIRST }
  return { ok: true, value: r }
}

// ------------------------------------------------------------------ invoice posting (9002)

/** The house bank comes from ZSGTSFTR_TRD_POS ZHBKID, which is not served: left blank. */
export function invPostDefaults(r: TradeInvoice, dealId: string): InvPostForm {
  const payment = r.recPay === 'Payment'
  return {
    date: r.dueDate,
    bank: '',
    sender: payment ? r.drPost : r.crPost,
    receiver: payment ? r.crPost : r.drPost,
    amt: `${formatAmount(r.invAmt)} ${r.curr}`,
    fiDoc: r.fiDoc || '',
    docMsg: `${r.trfDesc} - ${r.leg} settlement for Deal ID ${dealId}`,
  }
}

export const POST_INV_FIRST = 'Post the document before marking settlement complete.'

/** Settlement Complete is only allowed once the FI document exists. */
export function completeInv(r: TradeInvoice): Result<TradeInvoice> {
  if (!r.fiDoc) return { ok: false, error: POST_INV_FIRST }
  return { ok: true, value: r }
}
