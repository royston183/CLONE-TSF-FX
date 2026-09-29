const pad2 = (n: number): string => (n < 10 ? '0' + n : String(n))

export function cloneDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, days: number): Date {
  const x = cloneDate(d)
  x.setDate(x.getDate() + days)
  return x
}

/** DD-MM-YYYY, as the legacy page's formatDate wrote it. */
export function formatDate(d: Date): string {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** DD-MM-YYYY -> Date, rejecting anything the calendar wouldn't round-trip (31-02-2026, etc). */
export function parseDate(s: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || '')
  if (!m || !m[1] || !m[2] || !m[3]) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

/** Grouped thousands, two decimals, sign only when negative — the legacy fmtAmount. */
export function fmtAmount(n: number): string {
  const v = Math.abs(Number(n) || 0)
    .toFixed(2)
    .split('.')
  v[0] = (v[0] ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (Number(n) < 0 ? '-' : '') + v.join('.')
}

/** Amount input -> a finite number, or NaN for anything unreadable (comma-grouped is fine). */
export function parseAmountInput(s: string): number {
  return Number(String(s ?? '').replace(/,/g, ''))
}
