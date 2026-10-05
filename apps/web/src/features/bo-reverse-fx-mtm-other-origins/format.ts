export function two(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 1234.5 with 2 decimals is "1,234.50". Null/undefined/blank give "". */
export function formatNumber(v: number | string | null | undefined, dec: number): string {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  const neg = n < 0
  const [int = '', frac] = Math.abs(n).toFixed(dec).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + grouped + (dec && frac !== undefined ? `.${frac}` : '')
}

/** ISO (YYYY-MM-DD) to DD-MM-YYYY. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const p = iso.split('-')
  return `${p[2]}-${p[1]}-${p[0]}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Jan 2027" from an ISO date. */
export function monthYear(iso: string): string {
  const p = iso.split('-')
  return `${MONTHS[parseInt(p[1] ?? '1', 10) - 1]} ${p[0]}`
}

/** DD-MM-YYYY text to a date, or null when malformed or not a real calendar day. */
export function parseDisplayDate(s: string): Date | null {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(s)) return null
  const [dd = 0, mm = 0, yy = 0] = s.split('-').map((x) => parseInt(x, 10))
  const d = new Date(yy, mm - 1, dd)
  if (d.getFullYear() !== yy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null
  return d
}

/** YYYY-MM-DD to a local date, or null. */
export function parseIso(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [yy = 0, mm = 0, dd = 0] = s.split('-').map((x) => parseInt(x, 10))
  return new Date(yy, mm - 1, dd)
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

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso)
  if (!d) return iso
  d.setDate(d.getDate() + n)
  return toIso(d)
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
