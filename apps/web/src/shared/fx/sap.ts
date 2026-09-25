import { apiFetch } from '@slc/api-client'

/**
 * Value conversions between the FX screens and the migrated SAP columns. Pure, apart from
 * `sapUser`, so the screens' api modules can be tested without a backend.
 */

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** A local calendar date as the middleware stores DATS: YYYY-MM-DD. */
export function isoFromDate(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** YYYY-MM-DD (or YYYYMMDD) -> a local Date at midnight; null for a blank or initial date. */
export function dateFromIso(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(value ?? ''))
  if (!m || m[1] === '0000') return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** DD-MM-YYYY or DD.MM.YYYY, as the screens type dates -> YYYY-MM-DD. */
export function isoFromDmy(value: string | null | undefined): string | null {
  const m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(String(value ?? '').trim())
  if (!m) return null
  return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`
}

/** YYYY-MM-DD -> DD-MM-YYYY (or another separator); '' for a blank date. */
export function dmyFromIso(value: string | null | undefined, sep = '-'): string {
  const d = dateFromIso(value)
  return d ? `${pad(d.getDate())}${sep}${pad(d.getMonth() + 1)}${sep}${d.getFullYear()}` : ''
}

/** A DECIMAL column value -> number; 0 for blank. */
export function num(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * number -> the DECIMAL(p, scale) string the middleware accepts. It rejects a value with
 * more decimals than the column holds rather than rounding, so the rounding happens here.
 */
export function dec(value: number, scale: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(scale)
}

/** Trims a text value to a CHAR/VARCHAR column's length; the middleware rejects overflow. */
export function clip(value: string | null | undefined, length: number): string {
  return String(value ?? '').slice(0, length)
}

/** The current date and time as ZCREATED_DATE / ZCREATED_TIME store them. */
export function sapNow(now: Date = new Date()): { date: string; time: string } {
  return {
    date: isoFromDate(now) ?? '',
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  }
}

let user: Promise<string> | undefined

/**
 * The signed-in user as the audit columns hold it (SY-UNAME: upper case, 12 characters).
 * Read once from the gateway's session rather than threaded through every screen.
 */
export function sapUser(): Promise<string> {
  user ??= apiFetch<{ user?: { username?: string } }>('/auth/me')
    .then((data) => clip(String(data?.user?.username ?? '').toUpperCase(), 12))
    .catch(() => '')
  return user
}

/** The audit columns a change writes. The FX tables all name them ZCHANGED_*. */
export async function changedStamp(now: Date = new Date()): Promise<Record<string, string>> {
  const { date, time } = sapNow(now)
  return { ZCHANGED_BY: await sapUser(), ZCHANGED_DATE: date, ZCHANGED_TIME: time }
}

/** The audit columns an insert writes. */
export async function createdStamp(now: Date = new Date()): Promise<Record<string, string>> {
  const { date, time } = sapNow(now)
  return { ZCREATED_BY: await sapUser(), ZCREATED_DATE: date, ZCREATED_TIME: time }
}
