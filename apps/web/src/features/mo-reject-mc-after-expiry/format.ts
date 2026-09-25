/**
 * Parses the page's DD-MM-YYYY dates; null for anything malformed or impossible (31-02).
 * Kept as lenient as the original: it splits on "-" and reads each part with parseInt, so
 * "1-8-2026" is accepted too.
 */
export function parseDMY(str: string | null | undefined): Date | null {
  if (!str) return null
  const parts = str.split('-')
  if (parts.length !== 3) return null
  const d = parseInt(parts[0] ?? '', 10)
  const m = parseInt(parts[1] ?? '', 10)
  const y = parseInt(parts[2] ?? '', 10)
  if (Number.isNaN(d) || Number.isNaN(m) || Number.isNaN(y)) return null
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return dt
}

export function formatDMY(dt: Date | null): string {
  if (!dt) return ''
  const d = String(dt.getDate()).padStart(2, '0')
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  return `${d}-${m}-${dt.getFullYear()}`
}

export function formatAmount(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return ''
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
