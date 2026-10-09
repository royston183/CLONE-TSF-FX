const pad2 = (n: number): string => (n < 10 ? '0' + n : String(n))

/** ISO yyyy-mm-dd -> DD-MM-YYYY, as the legacy toDisplayDate did. */
export function toDisplayDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

/** DD-MM-YYYY -> a real Date, rejecting anything the calendar wouldn't round-trip. */
export function parseDisplayDate(value: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value || '')
  if (!m || !m[1] || !m[2] || !m[3]) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || (value as unknown as string) === '') return '—'
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Rates show 4 decimals; a string that is not a number (the grids' text cells) is shown as it is. */
export function formatRate(value: number | string | null | undefined): string {
  if (value === '' || value === null || value === undefined) return ''
  const n = Number(value)
  return Number.isNaN(n) ? String(value) : n.toFixed(4)
}

/** ISO date shifted by N days, still ISO — the legacy isoShift. */
export function isoShift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return dateToIso(d)
}

export function compactAmount(value: number): string {
  const n = Number(value || 0)
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return String(Math.round(n / 1000)) + 'K'
  return String(Math.round(n))
}
