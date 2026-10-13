import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { paymentAmount } from './payment-amount.ts'

const ds1 = { dealType: 'DS1', rate: 83.1 }

describe('paymentAmount', () => {
  it('is the invoice amount when the currencies match, or the settlement currency is blank', () => {
    deepStrictEqual(paymentAmount({ invAmt: 79552200, curr: 'USD', setCurr: 'USD', dMap: 'D1' }, []).amount, 79552200)
    strictEqual(paymentAmount({ invAmt: 10, curr: 'INR', setCurr: '', dMap: '' }, []).amount, 10)
  })

  it('divides by the mapped deal\'s all-in rate when the currencies differ (T3 INR -> USD)', () => {
    const r = paymentAmount({ invAmt: 79790856.6, curr: 'INR', setCurr: 'USD', dMap: 'DS1' }, [{ dealType: 'D1', rate: 1 }, ds1])
    strictEqual(r.amount, 960178.78)
    strictEqual(r.rate, 83.1)
    strictEqual(r.reason, '')
  })

  it('gives a reason and zero, never a silent amount, when the mapped deal or its rate is missing', () => {
    const noDeal = paymentAmount({ invAmt: 100, curr: 'INR', setCurr: 'USD', dMap: 'DS1' }, [{ dealType: 'D1', rate: 83 }])
    strictEqual(noDeal.amount, 0)
    strictEqual(/DS1 does not exist yet/.test(noDeal.reason), true)
    strictEqual(paymentAmount({ invAmt: 100, curr: 'INR', setCurr: 'USD', dMap: '' }, [ds1]).reason.includes('no mapped FX deal'), true)
    strictEqual(paymentAmount({ invAmt: 100, curr: 'INR', setCurr: 'USD', dMap: 'DS1' }, [{ dealType: 'DS1', rate: 0 }]).reason.includes('no all-in rate'), true)
  })

  it('deducts the premium of the adjustment deal, as an absolute amount', () => {
    const r = paymentAmount({ invAmt: 1000, curr: 'USD', setCurr: 'USD', dMap: 'D1', premAdj: 'DO1' }, [{ dealType: 'DO1', rate: 0, preAmt: -125.5, preCurr: 'USD' }])
    deepStrictEqual([r.amount, r.premium, r.premiumCurr], [874.5, 125.5, 'USD'])
    strictEqual(paymentAmount({ invAmt: 1000, curr: 'USD', setCurr: 'USD', dMap: 'D1', premAdj: 'DO9' }, []).amount, 1000)
  })
})
