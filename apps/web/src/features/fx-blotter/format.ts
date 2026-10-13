import type { Num } from './types.ts'

/** DD-MM-YYYY, or '' for no date — the page's only date format. */
export function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

/**
 * 1234567.5 → "1,234,567.50" with the page's own grouping. Like the original, a blank cell
 * ('') reads as 0 and only a missing or unreadable number prints nothing.
 */
export function fmtNum(n: Num | null | undefined, dp = 2): string {
  if (n === null || n === undefined) return ''
  const v = Number(n)
  if (Number.isNaN(v)) return ''
  const [int = '0', dec = ''] = Math.abs(v).toFixed(dp).split('.')
  return (v < 0 ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dp > 0 ? `.${dec}` : '')
}

/** Rates (all in, spot, deal) are kept and shown to 4 decimals: 94.1234. */
export const RATE_DP = 4

/** A rate rounded to RATE_DP decimals, as it is entered, stored and sent. */
export const roundRate = (n: number): number => +n.toFixed(RATE_DP)

/** A rate field mid-typing: digits (grouping commas allowed) and no more than RATE_DP decimals. */
export const isRateInput = (v: string): boolean => /^[\d,]*\.?\d{0,4}$/.test(v)

/** A rate as typed in an uploaded file: 4 decimals when it reads as a number, else as it was. */
export function fmtRateText(raw: string | null | undefined): string {
  const v = parseAmount(raw)
  return Number.isNaN(v) ? String(raw ?? '') : fmtNum(v, RATE_DP)
}

/** The Overview's Total Notional: $5.00M, $1.2K, $2.10B. */
export function fmtCompactUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** YYYY-MM-DD, the holiday list's format. */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The grid's date cells accept only DD-MM-YYYY. The day and month are not range-checked, so
 * 31-02-2026 rolls over into March exactly as it did.
 */
export function parseGridDate(v: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v.trim())
  return m ? new Date(parseInt(m[3] ?? '', 10), parseInt(m[2] ?? '', 10) - 1, parseInt(m[1] ?? '', 10)) : null
}

/** The popups' parseUiDate: DD-MM-YYYY, DD.MM.YYYY or YYYY-MM-DD. */
export function parseUiDate(v: string | null | undefined): Date | null {
  const s = String(v ?? '').trim()
  let m = /^(\d{2})[-.](\d{2})[-.](\d{4})$/.exec(s)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return null
}

/** parseFloat after dropping thousands separators; NaN when unreadable, as parseFloat is. */
export function parseAmount(raw: string | null | undefined): number {
  return parseFloat(String(raw ?? '').replace(/,/g, ''))
}
