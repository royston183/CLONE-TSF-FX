// Date and number helpers ported from the legacy page. Dates are ISO strings (YYYY-MM-DD) and all
// day arithmetic goes through UTC, as the original did, so it never drifts across a DST change.

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n
}

export function padLeft(value: string | number, len: number, ch: string): string {
  return String(value).padStart(len, ch)
}

function isoToUTC(iso: string): number {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function utcToISO(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function addDaysISO(iso: string, n: number): string {
  return utcToISO(isoToUTC(iso) + n * 86400000)
}

/** Whole days from b to a. */
export function diffDays(aIso: string, bIso: string): number {
  return Math.round((isoToUTC(aIso) - isoToUTC(bIso)) / 86400000)
}

/** Last day of a month; m1 is the 1-based month. */
export function lastDayOfMonthISO(y: number, m1: number): string {
  return utcToISO(Date.UTC(y, m1, 0))
}

export function isMonthEndISO(iso: string): boolean {
  return lastDayOfMonthISO(Number(iso.slice(0, 4)), Number(iso.slice(5, 7))) === iso
}

/** ISO to DD-MM-YYYY; blank stays blank. */
export function isoToDMY(iso: string): string {
  return iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : ''
}

/** DD-MM-YYYY to ISO, or null when malformed or not a real calendar day. */
export function dmyToISO(text: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(text || '').trim())
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2])
  const y = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return null
  if (d > Number(lastDayOfMonthISO(y, mo).slice(8, 10))) return null
  return `${y}-${pad2(mo)}-${pad2(d)}`
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/** 1234.5 with 2 decimals is "1,234.50" (en-US grouping). */
export function formatNumber(n: number | string, dec: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

/** "Sep 2027" from an ISO date. */
export function monthYear(iso: string): string {
  return `${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

/** Key Date typing aid: eight digits become DD-MM-YYYY. */
export function maskKeyDate(text: string): string {
  return /^\d{8}$/.test(text) ? `${text.slice(0, 2)}-${text.slice(2, 4)}-${text.slice(4)}` : text
}
