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
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
}

export function formatCompactUSD(n: number): string {
  let v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  v = Math.abs(v)
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(0)}K`
  return `${sign}$${formatAmount(v)}`
}

const AMOUNT_MULTIPLIERS: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, l: 1e5, cr: 1e7 }

/**
 * Plain numbers (with or without commas) and the shorthand suffixes K / M / B / L (lakh) /
 * Cr (crore), case-insensitive. NaN when the text is not a recognisable amount.
 */
export function parseAmountInput(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return NaN
  const cleaned = String(raw).replace(/,/g, '').trim()
  if (cleaned === '') return NaN
  const m = /^(-?\d+(\.\d+)?)\s*(k|m|b|l|cr)?$/i.exec(cleaned)
  if (!m) return NaN
  const suffix = (m[3] ?? '').toLowerCase()
  return parseFloat(m[1] ?? '') * (suffix ? (AMOUNT_MULTIPLIERS[suffix] ?? 1) : 1)
}

/** Shorthand (10K, 2.5M, 1Cr...) becomes a formatted number; invalid text is left untouched. */
export function commitAmount(raw: string): string {
  if (raw.trim() === '') return raw
  const val = parseAmountInput(raw)
  return Number.isNaN(val) ? raw : formatAmount(val)
}
