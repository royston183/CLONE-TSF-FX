/** Amounts as the legacy grids showed them: en-US, always two decimals. */
export const formatAmount = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
