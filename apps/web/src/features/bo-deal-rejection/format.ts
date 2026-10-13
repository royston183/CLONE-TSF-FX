export function pad(n: number | string, w: number): string {
  let s = String(n)
  while (s.length < w) s = `0${s}`
  return s
}

/** dd-mm-yyyy text to a date, or null when malformed or not a real calendar day. */
export function parseDMY(str: string | null | undefined): Date | null {
  if (!str) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(str).trim())
  if (!m) return null
  const d = parseInt(m[1] ?? '', 10)
  const mo = parseInt(m[2] ?? '', 10) - 1
  const y = parseInt(m[3] ?? '', 10)
  const dt = new Date(y, mo, d)
  if (dt.getDate() !== d || dt.getMonth() !== mo || dt.getFullYear() !== y) return null
  return dt
}

export function formatDMY(date: Date): string {
  return `${pad(date.getDate(), 2)}-${pad(date.getMonth() + 1, 2)}-${date.getFullYear()}`
}

/** A dd-mm-yyyy date moved by a number of days. */
export function dateOffset(baseDmy: string, days: number): string {
  const b = parseDMY(baseDmy)
  if (!b) return ''
  return formatDMY(new Date(b.getFullYear(), b.getMonth(), b.getDate() + days))
}

export function formatAmount(n: number | string): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatRate(n: number | string): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** Swap points keep six decimals; only rates are cut to four. */
export function formatSwap(n: number | string): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
}

export function round(n: number, d: number): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}
