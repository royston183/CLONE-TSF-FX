/** Number as the legacy grids show it: grouped, always two decimals. */
export function fmtAmt(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "USD 5,000,000.00" */
export function fmtMoney(curr: string, n: number): string {
  return `${curr} ${fmtAmt(n)}`
}

/** All-in rate to four decimals. */
export function fmtRate(rate: number): string {
  return rate.toFixed(4)
}

/** Fiscal year shown in the document preview: the last four characters of the MC date (DD.MM.YYYY). */
export function fiscalYear(mcDate: string): string {
  return mcDate.slice(-4)
}
