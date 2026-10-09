/** Parses the page's DD-MM-YYYY dates; null for anything malformed or impossible (31-02). */
export function parseDMY(str: string | null | undefined): Date | null {
  if (!str) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(str.trim())
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2]) - 1
  const y = Number(m[3])
  const dt = new Date(y, mo, d)
  if (dt.getDate() !== d || dt.getMonth() !== mo || dt.getFullYear() !== y) return null
  return dt
}

export function formatDMY(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${d}-${m}-${date.getFullYear()}`
}

export function formatAmount(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatRate(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** 3459 → "0.003459M", 46215 → "0.046215M", 2000000 → "2.0M" — the MC description's amount tag. */
export function compactMillions(amt: number): string {
  let s = (amt / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  if (!s.includes('.')) s = `${s}.0`
  return `${s}M`
}

/**
 * The original reads amounts with parseFloat after dropping thousands separators, so a
 * trailing non-number ("12abc") still counts as 12 and anything unreadable is NaN.
 */
export function parseLooseAmount(raw: string | null | undefined): number {
  return parseFloat(String(raw ?? '').replace(/,/g, ''))
}
