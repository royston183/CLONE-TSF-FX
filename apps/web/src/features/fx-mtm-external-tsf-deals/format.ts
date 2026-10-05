/**
 * Date and number helpers. Dates are held internally as 'YYYYMMDD' strings (like SAP DATS) and
 * shown as DD-MM-YYYY, exactly as the original page does.
 */

export function pad2(n: number | string): string {
  const s = String(n)
  return s.length < 2 ? '0' + s : s
}

/** Whole days since 1970-01-01 (UTC) for a 'YYYYMMDD' date. */
export function dayNumber(ymd: string): number {
  return Math.floor(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)) / 86400000)
}

export function ymdFromDayNumber(n: number): string {
  const d = new Date(n * 86400000)
  return String(d.getUTCFullYear()) + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate())
}

export function addDaysYmd(ymd: string, days: number): string {
  return ymdFromDayNumber(dayNumber(ymd) + days)
}

/** m = 1..12 */
export function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function isMonthEndYmd(ymd: string): boolean {
  return +ymd.slice(6, 8) === lastDayOfMonth(+ymd.slice(0, 4), +ymd.slice(4, 6))
}

/** 0 = Sunday */
export function weekdayOf(ymd: string): number {
  return new Date(dayNumber(ymd) * 86400000).getUTCDay()
}

export function roundTo(x: number, dp: number): number {
  const f = Math.pow(10, dp)
  return Math.round(x * f) / f
}

export function formatAmount(n: number | string): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatRate(n: number | string, dp: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

/** 'YYYYMMDD' to 'DD-MM-YYYY'; '' for no date. */
export function ymdToDmy(ymd: string): string {
  return ymd ? ymd.slice(6, 8) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(0, 4) : ''
}

/** Parses DD-MM-YYYY; null for anything malformed or impossible (31-02). */
export function parseDMY(str: string | null | undefined): Date | null {
  if (!str) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(str).trim())
  if (!m) return null
  const d = +(m[1] ?? '')
  const mo = +(m[2] ?? '') - 1
  const y = +(m[3] ?? '')
  const dt = new Date(y, mo, d)
  if (dt.getDate() !== d || dt.getMonth() !== mo || dt.getFullYear() !== y) return null
  return dt
}

export function formatDMY(date: Date): string {
  return pad2(date.getDate()) + '-' + pad2(date.getMonth() + 1) + '-' + date.getFullYear()
}

/** DD-MM-YYYY text to 'YYYYMMDD'; '' when it is not a real date. */
export function dmyToYmd(str: string): string {
  const d = parseDMY(str)
  return d ? String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate()) : ''
}

/** Accepts dd-mm-yyyy, dd.mm.yyyy, dd/mm/yyyy and ddmmyyyy; anything else comes back trimmed. */
export function normalizeDate(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  const m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(s) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(s)
  if (!m) return s
  return pad2(m[1] ?? '') + '-' + pad2(m[2] ?? '') + '-' + (m[3] ?? '')
}
