/** Dates are ISO yyyy-mm-dd internally and dd-mm-yyyy on screen. */

export function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n
}

/** dd-mm-yyyy (also '.' or '/' separated, 1-2 digit day and month) to a date, or null when not a real day. */
export function parseDMY(str: string): Date | null {
  if (!str) return null
  const m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(str.trim())
  if (!m) return null
  const d = parseInt(m[1] ?? '', 10)
  const mo = parseInt(m[2] ?? '', 10) - 1
  const y = parseInt(m[3] ?? '', 10)
  const dt = new Date(y, mo, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null
  return dt
}

export function formatDMY(date: Date): string {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`
}

export function toISO(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function isoToDMY(iso: string): string {
  return iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : ''
}

export function isoToDate(iso: string): Date {
  return new Date(parseInt(iso.slice(0, 4), 10), parseInt(iso.slice(5, 7), 10) - 1, parseInt(iso.slice(8, 10), 10))
}

export function addDaysISO(iso: string, n: number): string {
  const d = isoToDate(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function isMonthEnd(date: Date): boolean {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getDate() === 1
}

/** Whole calendar months from the key date's month to the value date's month (may be negative). */
export function monthsBetween(keyISO: string, valISO: string): number {
  return (
    parseInt(valISO.slice(0, 4), 10) * 12 +
    parseInt(valISO.slice(5, 7), 10) -
    (parseInt(keyISO.slice(0, 4), 10) * 12 + parseInt(keyISO.slice(5, 7), 10))
  )
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** 1,234.50 with two decimals; values that round to zero show as 0.00 (never -0.00). */
export function formatAmount(n: number | null | undefined): string {
  let v = Number(n) || 0
  if (Math.abs(v) < 0.005) v = 0
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Four-decimal rate. */
export function formatRate(n: number | null | undefined): string {
  const v = Number(n) || 0
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** Six-decimal swap points (not a rate, so not cut to four). */
export function formatSwap(n: number | null | undefined): string {
  const v = Number(n) || 0
  return v.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function round6(n: number): number {
  return Math.round(n * 1000000) / 1000000
}
