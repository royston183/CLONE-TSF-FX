const pad2 = (n: number): string => (n < 10 ? '0' + n : String(n))

/** DD-MM-YYYY, as the legacy page's formatDMYDate wrote it. */
export function formatDate(d: Date): string {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** DD-MM-YYYY -> Date, rejecting anything the calendar wouldn't round-trip. */
export function parseDMY(s: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s || '').trim())
  if (!m || !m[1] || !m[2] || !m[3]) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  d.setHours(0, 0, 0, 0)
  return d
}

/** Grouped thousands, two decimals, "-" prefix only when negative, "-" alone for NaN. */
export function fmtAmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  const neg = n < 0
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (neg ? '-' : '') + s
}

export function todayStr(): string {
  return formatDate(new Date(2026, 8, 28))
}
