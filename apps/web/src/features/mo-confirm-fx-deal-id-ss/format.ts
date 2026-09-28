/** The original's round2: rounds to cents, nudged by EPSILON so 1.005 rounds up. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** en-US grouping with a fixed number of decimals; '—' for a missing or NaN value. */
export function fmtAmt(n: number | null | undefined, dp = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  const neg = n < 0
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  return (neg ? '-' : '') + s
}

/** Today (or the given date) as DD-MM-YYYY. */
export function todayStr(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

/** CSS class the original gave a P&L figure. */
export function plClass(n: number): string {
  return n < 0 ? 'pl-neg' : n > 0 ? 'pl-pos' : ''
}
