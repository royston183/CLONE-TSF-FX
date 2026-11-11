/*
 * The decimals SAP keeps for a currency (TCURX; 2 when a currency has no entry). The FTR create BAPIs refuse an amount
 * that carries more places than its currency has ("Currency amount ... passed with wrong decimal place"), so an amount
 * derived from a rate is rounded to its own currency before it is sent.
 */
const ZERO = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'PYG', 'UGX', 'XAF', 'XOF', 'XPF', 'DJF', 'GNF', 'KMF', 'RWF', 'VUV', 'BIF', 'IDR'])
const THREE = new Set(['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD'])

export function currencyDecimals(currency: string): number {
  const c = currency.trim().toUpperCase()
  if (ZERO.has(c)) return 0
  if (THREE.has(c)) return 3
  return 2
}

/** `value` rounded (half away from zero) to the decimals of `currency`. */
export function roundToCurrency(value: number, currency: string): number {
  const factor = 10 ** currencyDecimals(currency)
  return (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor
}

/** A SAP currency key: three letters. Anything else (such as the "IN_KA" the invoice currency string holds) cannot be sent to SAP. */
export const isCurrencyCode = (currency: string): boolean => /^[A-Z]{3}$/.test(currency.trim().toUpperCase())

/** The refusal for a spot whose currency is not a currency, or '' when both are. */
export function invalidCurrencyMessage(currencies: readonly string[]): string {
  const bad = [...new Set(currencies.map((c) => c.trim()).filter((c) => !isCurrencyCode(c)))]
  if (!bad.length) return ''
  return `Currency ${bad.map((c) => `'${c || '(blank)'}'`).join(', ')} is not a valid currency, so SAP cannot book this spot. It comes from the invoice's currency string (ZSGTSFTR_CUR_STR, ZCURR1 / ZCURR2 / ZCURR3) or its saved difference row (ZSGTSFTR_IN_SPOT ZCURR): correct that master data, then try again.`
}
