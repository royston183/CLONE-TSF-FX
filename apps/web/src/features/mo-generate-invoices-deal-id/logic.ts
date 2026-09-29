import { statusText } from './format.ts'
import type { Deal, InvRow, Sort } from './types.ts'

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

export function getDealUsdAmount(d: Deal | null): number {
  if (!d) return 0
  const d1 = d.fx.find((r) => r.dealType === 'D1')
  if (!d1) return 0
  return d1.curr1 === 'USD' ? Math.abs(d1.amt1) : Math.abs(d1.amt2)
}

export function getInvoiceUsdAmount(d: Deal | null): number {
  if (!d) return 0
  return d.inv.reduce((sum, r) => sum + Math.abs(Number(r.amtUsd || 0)), 0)
}

export function recalcInvoiceRow(r: InvRow): InvRow {
  const price = Number(r.usdPrice) * Number(r.rate)
  const amt = Number(r.qty) * price
  const amtUsd = Number(r.qty) * Number(r.usdPrice)
  return { ...r, price, amt, amtUsd }
}

export function hasRollover(d: Deal | null): boolean {
  if (!d) return false
  return d.fx.some((r) => r.roll === 'R1-D1' || r.roll === 'R1-D2')
}

export function invSearchText(r: InvRow, key: string): string {
  if (key === 'bank') return r.partnerBank || r.houseBank || ''
  if (key === 'assign') return 'Assign House Bank'
  return String((r as unknown as Record<string, unknown>)[key] ?? '')
}

export type InvoiceConfirmation = { status: '05' | '07'; message: string }

export function computeInvoiceConfirmation(d: Deal): InvoiceConfirmation {
  const invAmt = getInvoiceUsdAmount(d)
  const dealAmt = getDealUsdAmount(d)
  const tol = d.tolerance
  const upperLimit = dealAmt + (dealAmt * tol) / 100
  const diff = Math.abs(invAmt - dealAmt)
  const rate = dealAmt ? ((dealAmt - invAmt) / dealAmt) * 100 : 0
  const tolStr = tol.toFixed(2)
  const diffStr = diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (invAmt > dealAmt) {
    return {
      status: '05',
      message: `Inv Amt exceeds FX Deal Amt by USD ${diffStr}${invAmt < upperLimit ? ` within tol limit (${tolStr}%). Do you want to confirm invoice?` : ` exceeds tol limit (${tolStr}%). Do you want to confirm invoice?`}`,
    }
  }
  if (Math.abs(invAmt - dealAmt) < 0.005) {
    return { status: '05', message: `Inv Amt same as FX Deal Amt. Within tol limit (${tolStr}%). Do you want to generate invoice?` }
  }
  if (rate <= tol) {
    return { status: '05', message: `Inv Amt less than FX Deal Amt by USD ${diffStr} within tol limit (${tolStr}%). Do you want to confirm invoice?` }
  }
  return { status: '07', message: `Inv Amt less than FX Deal Amt by USD ${diffStr} exceeds tol limit (${tolStr}%). Do you want to confirm partial Invoice?` }
}

export function dealLookupText(d: Deal): string {
  return [d.dealId, d.dealRef, d.modelId, d.entityString, statusText(d.status), d.mcRef, d.trader].join(' ')
}
