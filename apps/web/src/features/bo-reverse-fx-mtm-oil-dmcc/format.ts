export function two(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 1,234.50 style grouping with a fixed number of decimals; blank for null/undefined/''. */
export function formatNumber(v: number | string | null | undefined, dec: number): string {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  const neg = n < 0
  const parts = Math.abs(n).toFixed(dec).split('.')
  const x = parts[0] ?? ''
  let out = ''
  let c = 0
  for (let i = x.length - 1; i >= 0; i--) {
    out = x.charAt(i) + out
    c++
    if (c === 3 && i !== 0) {
      out = `,${out}`
      c = 0
    }
  }
  return (neg ? '-' : '') + out + (dec ? `.${parts[1] ?? ''}` : '')
}

/** yyyy-mm-dd to dd-mm-yyyy. */
export function formatDate(iso: string): string {
  if (!iso) return ''
  const p = iso.split('-')
  return `${p[2]}-${p[1]}-${p[0]}`
}

/** dd-mm-yyyy text to a date, or null when malformed or not a real calendar day. */
export function parseDisplayDate(s: string): Date | null {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(s)) return null
  const p = s.split('-')
  const d = parseInt(p[0] ?? '', 10)
  const m = parseInt(p[1] ?? '', 10)
  const y = parseInt(p[2] ?? '', 10)
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return date
}

export function parseIso(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const p = s.split('-')
  return new Date(parseInt(p[0] ?? '', 10), parseInt(p[1] ?? '', 10) - 1, parseInt(p[2] ?? '', 10))
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

export function toDisplay(d: Date): string {
  return `${two(d.getDate())}-${two(d.getMonth() + 1)}-${d.getFullYear()}`
}

export function isMonthEnd(d: Date): boolean {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getDate() === 1
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** yyyy-mm-dd to "Jan 2027". */
export function monthYear(iso: string): string {
  const p = iso.split('-')
  return `${MONTH_SHORT[parseInt(p[1] ?? '', 10) - 1]} ${p[0]}`
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso)
  if (!d) return ''
  d.setDate(d.getDate() + n)
  return toIso(d)
}

/** A CSV cell: always quoted, quotes doubled. */
export function csvCell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`
}
