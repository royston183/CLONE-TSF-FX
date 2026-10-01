import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FxRow } from '../../shared/fx/mw.ts'
import { fxKey, splitPartner, spotId, spotKey, toSpotRow, type SpotContext } from './spotList.ts'

// IN_SPOT rows as the middleware serves them (EXPORT_IN_SPOT.XLSX, loaded 2026-10-01).
const created: FxRow = {
  CLIENT: '100', ZMOD_ID: 'M032', ZDEAL_ID: '1100000981', ZDEAL_TYPE: 'D1', ZDSS_TYPE: 'DSS1', ZBUKRS: 'IN11',
  ZRFHA: '6205000000288', ZT_TYPE: 'T1', ZF_AMT: '4998.00', ZFX_AMT: '1000.00', ZCURR: 'USD', ZD_AMT: '-3998.00',
  ZBS: 'Buy', ZSBUKRS: 'OSIPL', ZSPOT_TXN: '6005000000281', ZSPOT_CREATE: 'X', ZEXPIRY: '',
  ZCREATED_BY: 'TINNIDHIS', ZCREATED_DATE: '2026-02-26',
}
/** A leg with no company or transaction of its own, and a blank DSS type. */
const leg: FxRow = {
  CLIENT: '100', ZMOD_ID: 'M032', ZDEAL_ID: '1100000981', ZDEAL_TYPE: 'D2', ZDSS_TYPE: '', ZBUKRS: '', ZRFHA: '',
  ZT_TYPE: 'T3', ZF_AMT: '164934.00', ZFX_AMT: '33000.00', ZCURR: 'INR', ZD_AMT: '-131934.00', ZBS: 'Sell',
  ZSBUKRS: 'OSIPL', ZSPOT_TXN: '', ZSPOT_CREATE: '', ZEXPIRY: '', ZCREATED_BY: 'TINNIDHIS', ZCREATED_DATE: '2026-02-26',
}
const fxRow: FxRow = {
  BUKRS: 'IN11', RFHA: '6205000000288', CURR1: 'USD', CURR2: 'INR', KONTRH: '0400000002',
  BP_NAME: '0400000002 - FMC Corporation', DBLFZ: '2026-02-27', DELFZ: '2026-03-02',
}
const ctx: SpotContext = {
  companies: new Map([['IN11', 'Olam Agri India Pvt Ltd']]),
  fx: new Map([[fxKey('IN11', '6205000000288'), fxRow]]),
}

describe('partner text', () => {
  it('splits "code - name" and keeps a bare name whole', () => {
    deepStrictEqual(splitPartner('0400000002 - FMC Corporation'), { code: '0400000002', name: 'FMC Corporation' })
    deepStrictEqual(splitPartner('FMC Corporation'), { code: '', name: 'FMC Corporation' })
  })
})

describe('an IN_SPOT row', () => {
  it('maps the table columns and joins the company name', () => {
    const row = toSpotRow(created, ctx)
    strictEqual(row.dealId, '1100000981')
    strictEqual(row.dealType, 'D1')
    strictEqual(row.dssType, 'DSS1')
    strictEqual(row.companyCode, 'IN11')
    strictEqual(row.companyName, 'Olam Agri India Pvt Ltd')
    strictEqual(row.originalTxn, '6205000000288')
    strictEqual(row.finalAmt, 4998)
    strictEqual(row.fxDealAmt, 1000)
    strictEqual(row.diffAmt, -3998)
    strictEqual(row.side, 'Buy')
    strictEqual(row.tsfEntity, 'OSIPL')
    strictEqual(row.spotTxn, '6005000000281')
    strictEqual(row.createdBy, 'TINNIDHIS')
    strictEqual(row.createdDate, '26-02-2026')
  })

  it('takes dates, partner and the other currency from the FX deal when the view has it', () => {
    const row = toSpotRow(created, ctx)
    strictEqual(row.tradeDate, '27-02-2026')
    strictEqual(row.valueDate, '02-03-2026')
    strictEqual(row.partner, '0400000002')
    strictEqual(row.partnerName, 'FMC Corporation')
    strictEqual(row.otherCurrency, 'INR')
  })

  it('leaves those blank when the original transaction is not in the view', () => {
    const row = toSpotRow(created, { ...ctx, fx: new Map() })
    strictEqual(row.tradeDate, '')
    strictEqual(row.partner, '')
    strictEqual(row.otherCurrency, '')
  })

  it('shows a leg without a transaction as a New Spot candidate', () => {
    const row = toSpotRow(leg, ctx)
    strictEqual(row.spotTxn, '')
    strictEqual(row.originalTxn, '')
    strictEqual(row.companyName, '')
    strictEqual(row.side, 'Sell')
    strictEqual(row.diffAmt, -131934)
  })
})

describe('the IN_SPOT key', () => {
  it('is model + deal + deal type + DSS type, blank DSS included, and the row id carries it', () => {
    deepStrictEqual(spotKey(toSpotRow(leg, ctx)), { ZMOD_ID: 'M032', ZDEAL_ID: '1100000981', ZDEAL_TYPE: 'D2', ZDSS_TYPE: '' })
    strictEqual(spotId(leg), 'M032|1100000981|D2|')
  })
})
