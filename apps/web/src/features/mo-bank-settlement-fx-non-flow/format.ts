export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const DASH = '—'

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return DASH
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtRate(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return DASH
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** dd-mm-yyyy from an ISO yyyy-mm-dd string or a Date; an em dash for empty or invalid input. */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return DASH
  const dt = d instanceof Date ? d : new Date(`${d}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return DASH
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${dt.getFullYear()}`
}

/** Parses the page's dd-mm-yyyy text; null when it does not match the pattern. */
export function parseDMY(s: string | null | undefined): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s ?? '')
  if (!m) return null
  return new Date(parseInt(m[3] ?? '', 10), parseInt(m[2] ?? '', 10) - 1, parseInt(m[1] ?? '', 10))
}
