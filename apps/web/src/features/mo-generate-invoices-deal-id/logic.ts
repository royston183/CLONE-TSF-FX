import { DEAL_INVOICE_STATUS, canPrintLetterAt, canReverseInvoice, type InvoiceFinalStatus } from './invoice-status.ts'
import { d1UsdAmount } from './invoice.ts'
import type { Deal, DealListRow, InvRow, Sort } from './types.ts'

function upper(v: unknown): string {
  return String(v ?? '').toUpperCase()
}

export function sortRows<T extends Record<string, unknown>>(rows: T[], sort: Sort<string>): T[] {
  const copy = rows.slice()
  copy.sort((a, b) => {
    const av = a[sort.key as keyof T]
    const bv = b[sort.key as keyof T]
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
    const au = upper(av)
    const bu = upper(bv)
    return (au < bu ? -1 : au > bu ? 1 : 0) * sort.dir
  })
  return copy
}

export function searchRows<T extends Record<string, unknown>>(rows: T[], q: string, keys: string[]): T[] {
  if (!q) return rows
  const u = upper(q)
  return rows.filter((r) => keys.some((k) => upper(r[k]).indexOf(u) >= 0))
}

export function paginate<T>(rows: T[], page: number, size: number): { rows: T[]; total: number; pages: number; start: number; page: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const clampedPage = Math.min(page, pages)
  const start = (clampedPage - 1) * size
  return { rows: rows.slice(start, start + size), total: rows.length, pages, start, page: clampedPage }
}

/** PAI 'UPD': the D1 deal's USD amount (curr1 USD ? |amt1| : |amt2|). */
export function getDealUsdAmount(d: Deal | null): number {
  return d ? d1UsdAmount(d.fx) : 0
}

/** PAI 'UPD' (GSDK938092): Σ |ZAMT_USD| of the invoice rows sold by OIL or OGA only. */
export const INVOICING_SELLERS = ['OIL', 'OGA'] as const

export function getInvoiceUsdAmount(d: Deal | null): number {
  if (!d) return 0
  return d.inv.filter((r) => (INVOICING_SELLERS as readonly string[]).includes(r.seller)).reduce((sum, r) => sum + Math.abs(Number(r.amtUsd || 0)), 0)
}

/** The ALV toolbar's CALC: price = USD price × rate, amount = qty × price, USD amount = qty × USD price. */
export function recalcInvoiceRow(r: InvRow): InvRow {
  const price = Number(r.usdPrice) * Number(r.rate)
  const amt = Number(r.qty) * price
  const amtUsd = Number(r.qty) * Number(r.usdPrice)
  return { ...r, price, amt, amtUsd }
}

/** STATUS_9000: AMD_DEAL is offered only when gt_top has an R1-D1 or R1-D2 roll-over deal. */
export function hasRollover(d: Deal | null): boolean {
  if (!d) return false
  return d.fx.some((r) => r.roll === 'R1-D1' || r.roll === 'R1-D2')
}

export function invSearchText(r: InvRow, key: string): string {
  if (key === 'bank') return r.partnerBank || r.houseBank || ''
  if (key === 'assign') return 'Assign House Bank'
  return String((r as unknown as Record<string, unknown>)[key] ?? '')
}

export type InvoiceConfirmation = { status: InvoiceFinalStatus; message: string }

/**
 * PAI 'UPD': invoice total vs the D1 deal amount against tolerance T02. Above the deal amount, or
 * below it within tolerance, confirms ('05'); below it beyond tolerance confirms partially ('07').
 * Texts are TEXT-028 … TEXT-035.
 */
export function computeInvoiceConfirmation(d: Deal): InvoiceConfirmation {
  const invAmt = getInvoiceUsdAmount(d)
  const dealAmt = getDealUsdAmount(d)
  const tol = d.tolerance ?? 0
  const upperLimit = dealAmt + (dealAmt * tol) / 100
  const diff = Math.abs(invAmt - dealAmt)
  const rate = dealAmt ? ((dealAmt - invAmt) / dealAmt) * 100 : 0
  const tolStr = tol.toFixed(2)
  const diffStr = diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (invAmt > dealAmt) {
    return {
      status: DEAL_INVOICE_STATUS.INVOICE_CREATED,
      message: `Inv Amt exceeds FX Deal Amt by USD ${diffStr}${invAmt < upperLimit ? ` within tol limit (${tolStr}%). Do you want to confirm invoice?` : ` exceeds tol limit (${tolStr}%). Do you want to confirm invoice?`}`,
    }
  }
  if (Math.abs(rate) < 0.005) {
    return { status: DEAL_INVOICE_STATUS.INVOICE_CREATED, message: `Inv Amt same as FX Deal Amt. Within tol limit (${tolStr}%). Do you want to generate invoice?` }
  }
  if (rate <= tol) {
    return { status: DEAL_INVOICE_STATUS.INVOICE_CREATED, message: `Inv Amt less than FX Deal Amt by USD ${diffStr} within tol limit (${tolStr}%). Do you want to confirm invoice?` }
  }
  return { status: DEAL_INVOICE_STATUS.PARTIAL_INVOICE_CREATED, message: `Inv Amt less than FX Deal Amt by USD ${diffStr} exceeds tol limit (${tolStr}%). Do you want to confirm partial Invoice?` }
}

/** PAI 'UPD' first check: outside region R01 a profit percent (ZSGTSFTR_ORG_PRO) must cover today. */
export function profitCheckError(d: Deal): string {
  return d.region !== 'R01' && !d.profitMaintained ? 'Profit percent is not maintained for the current quarter' : ''
}

/** PAI 'CAN': only a Deal ID at 04, 05 or 07 can have its TRM invoice cancelled (TEXT-005 otherwise). */
export const canCancelInvoice = canReverseInvoice

/** PAI 'IMPORT' / 'EXPORT': letters only above status 04. */
export const canPrintLetters = canPrintLetterAt

export function dealLookupText(d: DealListRow): string {
  return [d.dealId, d.dealRef, d.modelId, d.entityString, d.statusLabel, d.mcRef, d.trader].join(' ')
}
