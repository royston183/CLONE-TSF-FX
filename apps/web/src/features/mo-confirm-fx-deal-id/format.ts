/** The page's fmtAmt: two decimals, en-US grouping, "-" for a missing or NaN value. */
export function fmtAmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  const neg = n < 0
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (neg ? '-' : '') + s
}

/** The page's fmtRate: `dp` decimals (4 when omitted or 0, as `dp||4` read), "-" for NaN. */
export function fmtRate(n: number | null | undefined, dp?: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  const d = dp || 4
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
