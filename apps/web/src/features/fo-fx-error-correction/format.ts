export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 1234567.8 → "1,234,567.80"; the page's own grouping, not the browser locale's. */
export function fmtNum(n: number): string {
  const neg = n < 0
  const parts = Math.abs(n).toFixed(2).split('.')
  const whole = (parts[0] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}${whole}.${parts[1] ?? ''}`
}

/** Rates are always shown to four places. */
export const fmtRate = (n: number) => n.toFixed(4)

/** DD-MM-YYYY, the format every date on the screen uses. */
export function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

/** The seed block's DD.MM.YYYY dates. */
export function parseSeedDate(s: string): Date {
  const [d = '', m = '', y = ''] = s.split('.')
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10))
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Parses the pickers' DD-MM-YYYY; null for anything malformed or impossible (31-02). */
export function safeParseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim())
  if (!m) return null
  const day = parseInt(m[1] ?? '', 10)
  const monthIdx = parseInt(m[2] ?? '', 10) - 1
  const year = parseInt(m[3] ?? '', 10)
  if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return null
  const d = new Date(year, monthIdx, day)
  if (d.getFullYear() !== year || d.getMonth() !== monthIdx || d.getDate() !== day) return null
  return d
}

/**
 * The SAP amount field's shorthand: "5M" is 5 million and "250T" 250 thousand; anything else
 * is read as a plain number, and text that is not one becomes 0 — exactly as the legacy page did.
 */
export function parseAmountShorthand(input: string | null | undefined): number {
  if (!input) return 0
  const str = String(input).trim().replace(/,/g, '')
  const m = /^([\d.]+)\s*([MT])$/i.exec(str)
  if (m) {
    const num = parseFloat(m[1] ?? '')
    return (m[2] ?? '').toUpperCase() === 'M' ? num * 1e6 : num * 1e3
  }
  const plain = parseFloat(str)
  return Number.isNaN(plain) ? 0 : plain
}

/** A rate input's text as a number, thousands separators ignored; NaN when it is not one. */
export const parseRate = (s: string) => parseFloat(s.replace(/,/g, ''))
