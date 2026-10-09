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

/**
 * The page's parseDMY: split on "-" and hand the parts to the Date constructor as they are,
 * so an impossible day rolls over and anything unreadable gives an Invalid Date.
 */
export function parseDMY(str: string): Date {
  const [d = '', m = '', y = ''] = str.split('-')
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10))
}

/** DD-MM-YYYY, the format every date on the screen uses. */
export function formatDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

export function addDays(d: Date, days: number): Date {
  const nd = new Date(d.getTime())
  nd.setDate(nd.getDate() + days)
  return nd
}

/** 1234567.8 → "1,234,567.80", en-US grouping as the page used. */
export function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 83.2 → "83.2000": rates show exactly 4 decimals, en-US grouping. */
export function formatRate(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}
