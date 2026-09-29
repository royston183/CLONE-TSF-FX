export function money(v: number | '' | undefined, decimals = 2): string {
  if (v === '' || v == null || !Number.isFinite(v)) return ''
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function parseDMY(s: string): Date | null {
  if (!s) return null
  const p = s.split('-')
  if (p.length !== 3) return null
  const d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]))
  return Number.isNaN(d.getTime()) ? null : d
}

export function daysBetween(a: string, b: string): number {
  const da = parseDMY(a)
  const db = parseDMY(b)
  if (!da || !db) return 99999
  return Math.abs(Math.round((db.getTime() - da.getTime()) / 86400000))
}

export function dealStatusLabel(code: string): string {
  if (code === '01') return '01 - Created'
  if (code === '02') return '02 - Confirmed'
  if (code === 'X') return 'X - Status X'
  return code || ''
}
