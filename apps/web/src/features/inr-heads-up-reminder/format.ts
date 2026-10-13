export function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n
}

/** dd-mm-yyyy from an ISO yyyy-mm-dd string; '' for no date. */
export function isoToDMY(iso: string | null | undefined): string {
  if (!iso) return ''
  const p = iso.split('-')
  return `${p[2] ?? ''}-${p[1] ?? ''}-${p[0] ?? ''}`
}

/** ISO yyyy-mm-dd (local) from a Date. */
export function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** dd-mm-yyyy from a Date. */
export function formatDMY(d: Date): string {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** Accepts dd-mm-yyyy (also dd/mm/yyyy, dd.mm.yyyy); returns a Date, or null when malformed or impossible. */
export function parseDMY(str: string | null | undefined): Date | null {
  if (!str) return null
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(String(str).trim())
  if (!m) return null
  const d = parseInt(m[1] ?? '', 10)
  const mo = parseInt(m[2] ?? '', 10) - 1
  const y = parseInt(m[3] ?? '', 10)
  const dt = new Date(y, mo, d)
  if (dt.getDate() !== d || dt.getMonth() !== mo || dt.getFullYear() !== y) return null
  return dt
}

/** ISO date n days after (or before, when negative) an ISO date. */
export function addDaysISO(iso: string, n: number): string {
  const p = iso.split('-')
  const d = new Date(parseInt(p[0] ?? '', 10), parseInt(p[1] ?? '', 10) - 1, parseInt(p[2] ?? '', 10) + n)
  return dateToISO(d)
}

export function formatAmount(n: number | string): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatRate(n: number | string): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** 1,500,000 -> 1.5M, 22,500 -> 22.5K; smaller amounts as they are. */
export function compactAmount(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

/** Millions with trailing zeros trimmed: 500000 -> "0.5". */
export function trimMillions(n: number): string {
  return String(parseFloat((n / 1e6).toFixed(6)))
}
