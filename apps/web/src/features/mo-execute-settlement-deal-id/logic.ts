/** Pure business rules of the Execute Settlement for Deal ID screen. No DOM, no state. */
import { FX_POST_COMPANY_CODE, INV_POST_BANK, LETTER_SIGNATORY, STATUS_LIST } from './data.ts'
import { formatAmount } from './format.ts'
import type {
  Deal,
  DmsDoc,
  FxDeal,
  FxPostDefaults,
  Indexed,
  InvPostForm,
  Result,
  StatusMeta,
  TradeInvoice,
} from './types.ts'

export const DEAL_ID_REQUIRED = 'Please enter a Deal ID. (Deal ID is a mandatory field.)'
export const DATE_REQUIRED = 'Enter a date first.'

// ------------------------------------------------------------------ selection screen

/** The real program would SELECT on P_DEAL; here any non-blank value is accepted, upper-cased. */
export function normalizeDealId(raw: string): string | null {
  const v = raw.trim()
  return v === '' ? null : v.toUpperCase()
}

// ------------------------------------------------------------------ status

/** Unknown codes fall back to the first status, as the original did. */
export function statusMeta(code: string): StatusMeta {
  return STATUS_LIST.find((s) => s.code === code) ?? (STATUS_LIST[0] as StatusMeta)
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

export const statusChangedToast = (code: string): string =>
  `Deal ID Status changed to ${code} - ${statusMeta(code).text} (demo only; in SAP this is driven by settlement processing).`

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

// ------------------------------------------------------------------ Amend Deal End Date

export const amendDateInitial = (deal: Deal): string => deal.revisedEndDate || deal.dealEndDate

export const END_DATE_UPDATED = 'Deal End Date Updated Successfully.'

export function applyEndDate(deal: Deal, raw: string): Result<Deal> {
  const v = raw.trim()
  if (!v) return { ok: false, error: DATE_REQUIRED }
  return { ok: true, value: { ...deal, revisedEndDate: v } }
}

// ------------------------------------------------------------------ FX-Invoice Difference

/** Diff 1 Amt: (all-in rate - spot) x amount 1 / 100, two decimals. */
export const diff1Amount = (r: FxDeal): string => (((parseFloat(r.rate) - parseFloat(r.spot)) * r.amt1) / 100).toFixed(2)

/** Writes the edited spot rates back onto the FX deals; indexes without an edit are untouched. */
export function applySpotData(fxDeals: readonly FxDeal[], spots: readonly string[]): FxDeal[] {
  return fxDeals.map((r, i) => (spots[i] === undefined ? r : { ...r, spot: spots[i] as string }))
}

export const SPOT_SAVED = 'Details Saved Successfully..'

// ------------------------------------------------------------------ P&L

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

// ------------------------------------------------------------------ DMS

export function addDmsDocument(docs: readonly DmsDoc[], type: string, rawDate: string, dealId: string): Result<DmsDoc[]> {
  const date = rawDate.trim()
  if (!date) return { ok: false, error: DATE_REQUIRED }
  return { ok: true, value: [...docs, { type, file: `${type.replace(/\s+/g, '')}-${dealId}.pdf`, date, by: 'current.user' }] }
}

// ------------------------------------------------------------------ FX transaction posting (9003)

export const dealTypeLabel = (r: FxDeal): string =>
  `${r.dealType} - ${r.dealType === 'D1' ? 'Buy/Sell leg 1' : 'Buy/Sell leg 2'}`

export function fxPostDefaults(r: FxDeal): FxPostDefaults {
  return {
    bukrs: FX_POST_COMPANY_CODE,
    rfha: r.rfha,
    dealType: dealTypeLabel(r),
    partner: r.bp,
    bAmt: `${formatAmount(r.amt2)} ${r.curr2}`,
    sAmt: `${formatAmount(r.amt1)} ${r.curr1}`,
    bDoc: r.doc2 || '',
    sDoc: r.doc1 || '',
  }
}

/** Update: the partner is taken from the form, falling back to the current one when blank. */
export const updateFxPartner = (r: FxDeal, partner: string): FxDeal => ({ ...r, bp: partner || r.bp })

/** Post Accounting Entry: creates the two FI documents once and marks the leg Posted. */
export function postFxEntry(r: FxDeal, idx: number): FxDeal {
  return {
    ...r,
    doc1: r.doc1 || `19000${100 + idx}`,
    doc2: r.doc2 || `19000${200 + idx}`,
    status: 'Posted',
    statusChip: 'chip-t',
  }
}

export const POST_FX_FIRST = 'Post the accounting entry before marking settlement complete.'

export function completeFx(r: FxDeal): Result<FxDeal> {
  if (!r.doc1 || !r.doc2) return { ok: false, error: POST_FX_FIRST }
  return { ok: true, value: { ...r, status: 'Settled', statusChip: 'chip-done' } }
}

// ------------------------------------------------------------------ invoice posting (9002)

export function invPostDefaults(r: TradeInvoice, dealId: string): InvPostForm {
  const payment = r.recPay === 'Payment'
  return {
    date: r.dueDate,
    bank: INV_POST_BANK,
    sender: payment ? r.drPost : r.crPost,
    receiver: payment ? r.crPost : r.drPost,
    amt: `${formatAmount(r.invAmt)} ${r.curr}`,
    fiDoc: r.fiDoc || '',
    docMsg: `${r.trfDesc} - ${r.leg} settlement for Deal ID ${dealId}`,
  }
}

/** Update: the posting date becomes the date shown in the popup. */
export const updateInvPostDate = (r: TradeInvoice, date: string): TradeInvoice => ({ ...r, postDate: date })

/** Post Document: creates the FI document once. */
export const postInvDocument = (r: TradeInvoice, idx: number): TradeInvoice => ({
  ...r,
  fiDoc: r.fiDoc || `19500${300 + idx}`,
})

export const POST_INV_FIRST = 'Post the document before marking settlement complete.'

export function completeInv(r: TradeInvoice): Result<TradeInvoice> {
  if (!r.fiDoc) return { ok: false, error: POST_INV_FIRST }
  return { ok: true, value: { ...r, setCo: true, postDate: r.postDate || r.dueDate } }
}

// ------------------------------------------------------------------ letter preview (9001)

export function buildFxLetter(r: FxDeal, dealId: string): string {
  return [
    `RE: FX Settlement - Transaction ${r.rfha}, Deal ID ${dealId}`,
    '',
    `We hereby would like to request you to please remit the amount value date ${r.valDate}`,
    'to the beneficiary, details of which are as under, by debiting our current account.',
    '',
    `BENEFICIARY NAME        : ${r.bp}`,
    `AMOUNT                  : ${formatAmount(r.amt1)} ${r.curr1}`,
    `ALL-IN RATE             : ${r.rate}`,
    '',
    `Our treasury will fix the spot conversion price. Please Quote Deal ID ${dealId} on all correspondence.`,
  ].join('\n')
}

export function buildInvoiceLetter(r: TradeInvoice, dealId: string): string {
  return [
    `RE: Trade Invoice Settlement - ${r.leg}, Deal ID ${dealId}`,
    '',
    `Please arrange to remit ${r.curr} ${formatAmount(r.invAmt)} on value date ${r.dueDate}`,
    `debiting our current account, with equivalent funds credited as per invoice ${r.xblnr}.`,
    '',
    'Invoice wise details are as under:',
    `  ${r.trfDesc} - ${r.drPost} / ${r.crPost}`,
    '',
    'Yours Faithfully,',
    LETTER_SIGNATORY,
  ].join('\n')
}
