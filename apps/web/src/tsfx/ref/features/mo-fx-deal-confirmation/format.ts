export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** DD-MM-YYYY, the format every date on the screen uses. */
export function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

/**
 * The page's parseDDMMYYYY: strict DD-MM-YYYY shape, then handed to the Date constructor, so
 * an out-of-range day rolls over (31-02-2026 is 3 March) exactly as the original accepted it.
 */
export function parseDDMMYYYY(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim())
  if (!m) return null
  const d = new Date(parseInt(m[3] ?? '', 10), parseInt(m[2] ?? '', 10) - 1, parseInt(m[1] ?? '', 10))
  if (Number.isNaN(d.getTime())) return null
  return d
}

export function addDays(d: Date, days: number): Date {
  const nd = new Date(d.getTime())
  nd.setDate(nd.getDate() + days)
  return nd
}

/** 1234567.8 → "1,234,567.80"; a negative (Sell) amount carries SAP's trailing minus: "5.00-". */
export function fmtAmount(n: number): string {
  const neg = n < 0
  const parts = Math.abs(n).toFixed(2).split('.')
  const whole = (parts[0] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const out = `${whole}.${parts[1] ?? ''}`
  return neg ? `${out}-` : out
}

/** All in Rate, four decimals. */
export const fmtRate = (n: number): string => n.toFixed(4)
