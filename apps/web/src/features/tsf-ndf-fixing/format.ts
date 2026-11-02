const pad = (n: number) => String(n).padStart(2, '0')

/** DD-MM-YYYY, the format every date on the screen uses. */
export function fmtDate(d: Date): string {
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** The page's isoFromDisplay: DD-MM-YYYY -> Date, or null if it isn't a real calendar date. */
export function isoFromDisplay(s: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || '')
  if (!m) return null
  const [, dd = '', mm = '', yyyy = ''] = m
  const day = +dd
  const month = +mm
  const year = +yyyy
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null
}

export function money(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Rates (spot, forward, fixing) to 4 decimals: 94.1234. */
export function rate(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** Swap points keep their own precision (4 to 6 decimals). */
export function points(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

/** The Fixing Rate field mid-typing: digits and no more than 4 decimals. */
export const isRateInput = (v: string): boolean => /^\d*\.?\d{0,4}$/.test(v)
