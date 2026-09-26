/** 1234567.8 → "1,234,567.80"; the page's own grouping. Anything not a number shows "0.00". */
export function fmtNum(n: number | null | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '0.00'
  const neg = n < 0
  const s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + s
}

/** Exchange rates always carry seven decimals. */
export function fmtRate(n: number | null | undefined): string {
  return n === undefined || n === null || Number.isNaN(n) ? '0.0000000' : n.toFixed(7)
}

/** DD.MM.YYYY, the SAP date format every date on the screen uses. */
export function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}
