/** The page's fmtAmt(): two decimals with en-US grouping; '' for a missing value. */
export function fmtAmt(n: number | '' | null | undefined): string {
  if (n === undefined || n === null || n === '') return ''
  const neg = n < 0
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (neg ? '-' : '') + s
}

/** The top table's rate cells: four decimals, blank for a zero or missing rate. */
export function fmtRate(n: number | ''): string {
  return n ? Number(n).toFixed(4) : ''
}

/** The Premium modal's rates: `(x||0).toFixed(4)`. */
export function fixed4(n: number | undefined): string {
  return (n || 0).toFixed(4)
}

/** "1 record" / "2 records". */
export function recordCount(n: number): string {
  return `${n} record${n === 1 ? '' : 's'}`
}
