import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SAMPLE_DEAL, invRow } from './fixtures.ts'
import { canCancelInvoice, canPrintLetters, computeInvoiceConfirmation, getDealUsdAmount, getInvoiceUsdAmount, hasRollover, profitCheckError, recalcInvoiceRow } from './logic.ts'

describe("PAI 'UPD' amounts", () => {
  it('sums |ZAMT_USD| of the OIL / OGA-sold rows only (GSDK938092) against D1 in USD', () => {
    strictEqual(getInvoiceUsdAmount(SAMPLE_DEAL), 1300500 + 893200)
    strictEqual(getDealUsdAmount(SAMPLE_DEAL), 3500000)
  })

  it('partial (07) below the deal amount beyond tolerance, full (05) within it or above', () => {
    strictEqual(computeInvoiceConfirmation(SAMPLE_DEAL).status, '07')
    const within = { ...SAMPLE_DEAL, inv: [invRow({ seller: 'OGA', amtUsd: 3450000 })] }
    strictEqual(computeInvoiceConfirmation(within).status, '05')
    const above = { ...SAMPLE_DEAL, inv: [invRow({ seller: 'OIL', amtUsd: 3600000 })] }
    deepStrictEqual(computeInvoiceConfirmation(above).status, '05')
    const same = { ...SAMPLE_DEAL, inv: [invRow({ seller: 'OGA', amtUsd: 3500000 })] }
    strictEqual(computeInvoiceConfirmation(same).message.startsWith('Inv Amt same as FX Deal Amt'), true)
  })

  it('outside region R01 a profit percent must be maintained', () => {
    strictEqual(profitCheckError({ ...SAMPLE_DEAL, region: 'R04', profitMaintained: false }), 'Profit percent is not maintained for the current quarter')
    strictEqual(profitCheckError({ ...SAMPLE_DEAL, region: 'R01', profitMaintained: false }), '')
  })
})

describe('function code gates', () => {
  it("CAN only at 04 / 05 / 07; IMPORT / EXPORT only above 04; AMD_DEAL needs an R1 roll", () => {
    deepStrictEqual(['03', '04', '05', '07', '08'].map(canCancelInvoice), [false, true, true, true, false])
    deepStrictEqual(['', '04', '05', '21'].map(canPrintLetters), [false, false, true, true])
    strictEqual(hasRollover(SAMPLE_DEAL), false)
    strictEqual(hasRollover({ ...SAMPLE_DEAL, fx: [{ ...SAMPLE_DEAL.fx[0]!, roll: 'R1-D2' }] }), true)
  })

  it('CALC: price = USD price × rate, amounts from quantity', () => {
    const r = recalcInvoiceRow(invRow({ qty: 10, usdPrice: 100, rate: 83.5 }))
    deepStrictEqual([r.price, r.amt, r.amtUsd], [8350, 83500, 1000])
  })
})
