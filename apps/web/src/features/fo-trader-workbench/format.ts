/** Formatting and parsing helpers, as the original defines them. Dates on screen are dd-mm-yyyy, in data ISO. */

export function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n
}

/** dd-mm-yyyy -> Date, or null for anything else (including impossible dates). */
export function parseDMY(str: string | null | undefined): Date | null {
  if (!str) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(str).trim())
  if (!m) return null
  const d = parseInt(m[1]!, 10)
  const mo = parseInt(m[2]!, 10) - 1
  const y = parseInt(m[3]!, 10)
  const dt = new Date(y, mo, d)
  if (dt.getDate() !== d || dt.getMonth() !== mo || dt.getFullYear() !== y) return null
  return dt
}

export const formatDMY = (date: Date) => `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`

export function isoToDMY(iso: string | null | undefined): string {
  if (!iso) return ''
  const p = iso.split('-')
  return `${p[2]}-${p[1]}-${p[0]}`
}

export function dmyToIso(dmy: string): string {
  const d = parseDMY(dmy)
  return d ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : ''
}

export function formatAmount(n: number | string | null | undefined, dec = 2): string {
  if (n === undefined || n === null || n === '') return ''
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function formatRate(n: number | null | undefined): string {
  return n === undefined || n === null || Number(n) === 0
    ? ''
    : Number(n).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** Amount text -> number; NaN for blank or non-numeric. */
export function parseNum(str: string | number | null | undefined): number {
  if (typeof str === 'number') return str
  const s = String(str || '').replace(/,/g, '').trim()
  if (s === '' || isNaN(Number(s))) return NaN
  return Number(s)
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** An amount box: blank for 0 / NaN. */
export function numStr(n: number | null | undefined, dec = 2): string {
  return n === 0 || n === undefined || n === null || isNaN(n) ? '' : formatAmount(n, dec)
}

export function kpiCompact(n: number): string {
  const a = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (a >= 1e9) return s + (a / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B'
  if (a >= 1e6) return s + (a / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'
  if (a >= 1e3) return s + (a / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K'
  return s + Math.round(a)
}

export function optionIndex(index: number, key: string, count: number): number {
  if (!count) return -1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return Math.min(count - 1, index + 1)
  if (key === 'ArrowUp') return index < 0 ? count - 1 : Math.max(0, index - 1)
  return index
}

/** Calendar navigation changes focus only; it does not change settlement rules. */
export function moveCalendarDate(date: Date, key: string, shift = false): Date | null {
  const day = date.getDate(), month = date.getMonth(), year = date.getFullYear()
  const days: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -date.getDay(), End: 6 - date.getDay() }
  if (key in days) return new Date(year, month, day + days[key]!)
  if (key === 'PageUp' || key === 'PageDown') {
    const target = new Date(year, month + (key === 'PageUp' ? -1 : 1) * (shift ? 12 : 1), 1)
    target.setDate(Math.min(day, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()))
    return target
  }
  return null
}
