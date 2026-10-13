import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { tradeCurrencies, tradeCurrency } from './currency-string.ts'

describe('invoice currencies of a currency string row', () => {
  it('reads the shifted dev rows (ZCURR3 = IN_KA) as the string\'s own T1-T2-T3 chain', () => {
    // The rows as SAP and the middleware hold them.
    deepStrictEqual(tradeCurrencies({ ZCURR_ID: 'USD-USD-INR', ZCURR_DESC: 'USD', ZCURR1: 'USD', ZCURR2: 'INR', ZCURR3: 'IN_KA' }), ['USD', 'USD', 'INR'])
    deepStrictEqual(tradeCurrencies({ ZCURR_ID: 'INR-INR-INR', ZCURR_DESC: 'INR', ZCURR1: 'INR', ZCURR2: 'INR', ZCURR3: 'IN_KA' }), ['INR', 'INR', 'INR'])
    deepStrictEqual(tradeCurrencies({ ZCURR_ID: 'INR-INR-USD', ZCURR_DESC: 'INR', ZCURR1: 'INR', ZCURR2: 'USD', ZCURR3: 'IN_KA' }), ['INR', 'INR', 'USD'])
    deepStrictEqual(tradeCurrencies({ ZCURR_ID: 'THB-USD-USD', ZCURR_DESC: 'THB', ZCURR1: 'USD', ZCURR2: 'USD', ZCURR3: 'IN_KA' }), ['THB', 'USD', 'USD'])
  })

  it('uses ZCURR1..3 as the original does once all three are currencies (the table corrected in SAP)', () => {
    deepStrictEqual(tradeCurrencies({ ZCURR_ID: 'C1', ZCURR_DESC: 'INR', ZCURR1: 'INR', ZCURR2: 'INR', ZCURR3: 'USD' }), ['INR', 'INR', 'USD'])
    strictEqual(tradeCurrency({ ZCURR1: 'EUR', ZCURR2: 'GBP', ZCURR3: 'INR' }, 3), 'INR')
  })

  it('falls back to the plain columns when neither reading is made of currencies, and to blanks without a row', () => {
    deepStrictEqual(tradeCurrencies({ ZCURR_DESC: 'X', ZCURR1: 'INR', ZCURR2: 'INR', ZCURR3: 'IN_KA' }), ['INR', 'INR', 'IN_KA'])
    deepStrictEqual(tradeCurrencies(undefined), ['', '', ''])
  })
})
