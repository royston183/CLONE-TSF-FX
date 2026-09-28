/** ISO yyyy-mm-dd to the page's dd-mm-yyyy; anything not in three dash-separated parts passes through. */
export function formatDateDMY(iso: string | null | undefined): string {
  if (!iso) return ''
  const p = String(iso).trim().split('-')
  if (p.length !== 3) return iso
  return `${p[2]}-${p[1]}-${p[0]}`
}

export function fmtAmt(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function pad2(n: number): string {
  return String(n).length < 2 ? `0${n}` : String(n)
}

/** ISO date from a year, zero-based month and day. */
export function isoOf(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`
}

/** "Today" as the original computes it for the calendar highlight: the UTC date. */
export function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10)
}
