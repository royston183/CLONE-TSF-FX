export function pad(n: number | string, len: number): string {
  let s = String(n)
  while (s.length < len) s = '0' + s
  return s
}

/** DD-MM-YYYY, the page's display format; '' for no date. */
export function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  return pad(d.getDate(), 2) + '-' + pad(d.getMonth() + 1, 2) + '-' + d.getFullYear()
}

/** YYYY-MM-DD (local), used for the generator seed and the CSV file name. */
export function isoOf(d: Date | null | undefined): string {
  if (!d) return ''
  return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2)
}

/** Parses DD-MM-YYYY; null for anything malformed or impossible (31-02). */
export function parseDMY(str: string | null | undefined): Date | null {
  if (!str) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(str.trim())
  if (!m) return null
  const d = parseInt(m[1] ?? '', 10)
  const mo = parseInt(m[2] ?? '', 10) - 1
  const y = parseInt(m[3] ?? '', 10)
  const dt = new Date(y, mo, d)
  if (dt.getDate() !== d || dt.getMonth() !== mo || dt.getFullYear() !== y) return null
  return dt
}

/** The original's comma-grouped fixed-decimal number; '' for a missing value. */
export function fmtNum(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined) return ''
  const neg = n < 0
  const parts = Math.abs(n).toFixed(dec).split('.')
  parts[0] = (parts[0] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + parts.join('.')
}
