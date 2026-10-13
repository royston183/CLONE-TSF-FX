import { strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { currencyDecimals, roundToCurrency } from './currency-decimals.ts'

describe('currency decimals', () => {
  it('rounds an amount to the places its currency has', () => {
    strictEqual(roundToCurrency(1922912.8071, 'USD'), 1922912.81)
    strictEqual(roundToCurrency(182890160, 'INR'), 182890160)
    strictEqual(roundToCurrency(1234.5, 'JPY'), 1235)
    strictEqual(roundToCurrency(10.12345, 'KWD'), 10.123)
  })
  it('defaults to two places', () => {
    strictEqual(currencyDecimals('EUR'), 2)
    strictEqual(currencyDecimals('xyz'), 2)
  })
})

import { invalidCurrencyMessage, isCurrencyCode } from './currency-decimals.ts'

describe('currency keys', () => {
  it('accepts three letters and refuses anything else, such as the IN_KA the invoice currency string holds', () => {
    strictEqual(isCurrencyCode('USD'), true)
    strictEqual(isCurrencyCode('inr'), true)
    for (const bad of ['IN_KA', '', 'US', 'U1D']) strictEqual(isCurrencyCode(bad), false)
  })
  it('words the refusal with the offending currency and where it comes from', () => {
    strictEqual(invalidCurrencyMessage(['USD', 'INR']), '')
    const message = invalidCurrencyMessage(['USD', 'IN_KA', 'IN_KA'])
    strictEqual(message.includes("'IN_KA'") && message.includes('ZSGTSFTR_CUR_STR'), true)
  })
})
