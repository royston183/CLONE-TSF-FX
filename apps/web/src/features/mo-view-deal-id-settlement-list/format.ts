/** 1234.5 -> "1,234.50"; negatives keep a leading "-". */
export function fmtNum(n: number): string {
  const neg = n < 0
  const [whole = '0', frac = '00'] = Math.abs(n).toFixed(2).split('.')
  return `${neg ? '-' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`
}

/** Rates to four decimals, ungrouped; '' for a non-number. */
export function fmtRate(n: number): string {
  return Number.isFinite(n) ? n.toFixed(4) : ''
}

export function fmtCompactUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** DD.MM.YYYY; '' for an absent date. */
export function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

/** Parses DD.MM.YYYY into a local date. */
export function parseDate(s: string): Date {
  const p = s.split('.')
  return new Date(parseInt(p[2] ?? '', 10), parseInt(p[1] ?? '', 10) - 1, parseInt(p[0] ?? '', 10))
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
