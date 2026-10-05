export const DASH = '—'
export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
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

const two = (n: number) => (n < 10 ? `0${n}` : String(n))

/** Thousands-separated fixed-decimal text; '' for empty, the raw text for a non-number. */
export function formatNumber(v: number | string | null | undefined, dec: number): string {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  const neg = n < 0
  const [int = '', frac] = Math.abs(n).toFixed(dec).split('.')
  let out = ''
  let count = 0
  for (let i = int.length - 1; i >= 0; i--) {
    out = int.charAt(i) + out
    count++
    if (count === 3 && i !== 0) {
      out = `,${out}`
      count = 0
    }
  }
  return (neg ? '-' : '') + out + (dec ? `.${frac ?? ''}` : '')
}

/** dd-mm-yyyy from an ISO yyyy-mm-dd string; '' when empty. */
export function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

/** Parses dd-mm-yyyy, rejecting impossible dates (31-02-2026); null otherwise. */
export function parseDisplayDate(s: string): Date | null {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(s)) return null
  const [dd, mm, yy] = s.split('-').map((p) => parseInt(p, 10)) as [number, number, number]
  const d = new Date(yy, mm - 1, dd)
  if (d.getFullYear() !== yy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null
  return d
}

export function parseIso(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map((p) => parseInt(p, 10)) as [number, number, number]
  return new Date(y, m - 1, d)
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

export function toDisplay(d: Date): string {
  return `${two(d.getDate())}-${two(d.getMonth() + 1)}-${d.getFullYear()}`
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso)
  if (!d) return iso
  d.setDate(d.getDate() + n)
  return toIso(d)
}

/** "Sep 2026" from an ISO date. */
export function monthYear(iso: string): string {
  const [y = '', m = '1'] = iso.split('-')
  return `${MONTH_ABBR[parseInt(m, 10) - 1] ?? ''} ${y}`
}

export function isMonthEnd(d: Date): boolean {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getDate() === 1
}

export function sameDay(a: Date | null, b: Date): boolean {
  return !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
