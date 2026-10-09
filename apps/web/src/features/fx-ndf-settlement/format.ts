export function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n
}

export function padLeft(s: string | number, len: number, ch: string): string {
  let out = String(s)
  while (out.length < len) out = ch + out
  return out
}

export function round(n: number, dec: number): number {
  const f = Math.pow(10, dec)
  return Math.round(n * f) / f
}

/** Local-time Date of an ISO yyyy-mm-dd string. */
export function isoToDate(iso: string): Date {
  const [y = '', m = '', d = ''] = iso.split('-')
  return new Date(+y, +m - 1, +d)
}

export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** dd-mm-yyyy from an ISO yyyy-mm-dd string; empty for empty input. */
export function isoToDmy(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y = '', m = '', d = ''] = iso.split('-')
  return `${d}-${m}-${y}`
}

export function addDays(iso: string, n: number): string {
  const d = isoToDate(iso)
  d.setDate(d.getDate() + n)
  return dateToIso(d)
}

export function rollBackWeekend(iso: string): string {
  const d = isoToDate(iso)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  return dateToIso(d)
}

/** The date n business days (Mon-Fri) before the given one. */
export function prevBusinessDay(iso: string, n: number): string {
  const d = isoToDate(iso)
  let count = 0
  while (count < n) {
    d.setDate(d.getDate() - 1)
    const w = d.getDay()
    if (w !== 0 && w !== 6) count++
  }
  return dateToIso(d)
}

/** Lenient date parser: dd-mm-yyyy (also / or . separators, or ddmmyyyy) to ISO; null when invalid. */
export function parseDateInput(str: string | null | undefined): string | null {
  const s = String(str ?? '').trim()
  if (!s) return null
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(s)
  if (!m) return null
  const d = +(m[1] ?? '')
  const mo = +(m[2] ?? '')
  const y = +(m[3] ?? '')
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return `${y}-${pad2(mo)}-${pad2(d)}`
}

export function formatAmount(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatRate(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** Swap points keep six decimals; only rates are cut to four. */
export function formatSwap(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
}
