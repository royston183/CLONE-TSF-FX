/** sy-datum: the day counts run against today, as the report computes them. */
export const TODAY = ((d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))(new Date())

const pad2 = (n: number): string => (n < 10 ? '0' + n : String(n))

export function formatDate(d: Date): string {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** DD-MM-YYYY -> Date, rejecting anything the calendar wouldn't round-trip. */
export function parseDate(value: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value || '')
  if (!m || !m[1] || !m[2] || !m[3]) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

export function addDays(dateValue: string, days: number): string {
  const d = parseDate(dateValue)
  if (!d) return ''
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

export function dateDiff(dateValue: string, baseDate: Date): number {
  const d = parseDate(dateValue)
  if (!d) return 0
  return Math.round((d.getTime() - baseDate.getTime()) / 86400000)
}

export function formatAmount(value: number | null | undefined): string {
  const num = Number(value || 0)
  const neg = num < 0
  const parts = Math.abs(num).toFixed(2).split('.')
  const withCommas = (parts[0] ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + withCommas + '.' + parts[1]
}

export function formatRate(value: number | '' | null | undefined): string {
  if (value === '' || value === null || value === undefined) return ''
  return Number(value).toFixed(4)
}

/** Swap (forward) points are not a rate: they keep their 6 decimals. */
export function formatPoints(value: number | '' | null | undefined): string {
  if (value === '' || value === null || value === undefined) return ''
  return Number(value).toFixed(6)
}
