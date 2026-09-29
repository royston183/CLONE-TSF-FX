const pad2 = (n: number): string => (n < 10 ? '0' + n : String(n))

export function formatDate(d: Date): string {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** DD-MM-YYYY -> Date, rejecting anything the calendar wouldn't round-trip. */
export function parseDMY(value: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value || '')
  if (!m || !m[1] || !m[2] || !m[3]) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

export function money(v: number): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function rate(v: number): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(6)
}
