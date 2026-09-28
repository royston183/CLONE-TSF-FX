export function pad(n: number | string, l: number): string {
  let s = String(n)
  while (s.length < l) s = `0${s}`
  return s
}

/** DD-MM-YYYY, as the page shows every date; '' for a missing one. */
export function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  return `${pad(d.getDate(), 2)}-${pad(d.getMonth() + 1, 2)}-${d.getFullYear()}`
}

export function fmtAmount(n: number | null | undefined): string {
  if (n === undefined || n === null) return ''
  const neg = n < 0
  const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (neg ? '-' : '') + v
}

export function fmtRate(n: number | null | undefined): string {
  if (n === undefined || n === null) return ''
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** Inverse of fmtDate: a strict DD-MM-YYYY string as a Date, or null if malformed or impossible. */
export function parseDMY(str: string | null | undefined): Date | null {
  if (!str) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(str.trim())
  if (!m) return null
  const d = parseInt(m[1] ?? '', 10)
  const mo = parseInt(m[2] ?? '', 10) - 1
  const y = parseInt(m[3] ?? '', 10)
  const dt = new Date(y, mo, d)
  if (dt.getDate() !== d || dt.getMonth() !== mo || dt.getFullYear() !== y) return null
  return dt
}
