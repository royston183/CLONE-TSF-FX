/** 1234567.5 -> "1,234,567.50"; the page's own grouping, not toLocaleString. */
export function fmtNum(n: number): string {
  const neg = n < 0
  const abs = Math.abs(n || 0)
  const [int = '0', dec = '00'] = abs.toFixed(2).split('.')
  return (neg ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec
}

/** DD-MM-YYYY, or '' for no date. */
export function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

export function fmtDateTime(d: Date | null | undefined, t?: string): string {
  return d ? fmtDate(d) + (t ? ` ${t}` : '') : ''
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** YYYY-MM-DD, the value format of <input type="date">. */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseISO(s: string | null | undefined): Date | null {
  if (!s) return null
  const [y = '', m = '', d = ''] = s.split('-')
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10))
}

/** The seed block's DD.MM.YYYY dates. */
export function parseDMY(s: string): Date {
  const [d = '', m = '', y = ''] = s.split('.')
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10))
}

/**
 * Plain numbers (commas allowed) and the shorthand suffixes M (million) / T (thousand), as in
 * ABAP modules AMT_CONVERT1 / AMOUNT_STRING_CONVERT. Anything unreadable is 0, as it was.
 */
export function parseAmountShorthand(raw: string | null | undefined): number {
  if (!raw) return 0
  const str = String(raw).trim().replace(/,/g, '')
  const m = /^([\d.]+)\s*([MT])$/i.exec(str)
  if (m) {
    const num = parseFloat(m[1] ?? '')
    return (m[2] ?? '').toUpperCase() === 'M' ? num * 1e6 : num * 1e3
  }
  const plain = parseFloat(str)
  return Number.isNaN(plain) ? 0 : plain
}

/** What the amount inputs show after blur: the shorthand expanded and formatted. */
export function commitAmount(raw: string): string {
  return fmtNum(parseAmountShorthand(raw))
}
