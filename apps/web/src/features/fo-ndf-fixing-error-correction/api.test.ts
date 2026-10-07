import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ndfRecord, type FxTransaction } from '../../shared/fx/ndf.ts'
import { rowFromRecord } from './api.ts'
import { calcSettlement, filterRows } from './logic.ts'

const near = (a: number | null, b: number) => ok(a !== null && Math.abs(a - b) < 1e-6, `${a} != ${b}`)

/* An SG03 NDF as FxTransaction serves it, sent back by MO (TrmFxApp TxnStatus 11). */
const fx: FxTransaction = {
  CompanyCode: 'SG03', FinancialTransaction: '2000000000001', ProductType: '12D', TransactionType: '631', Partner: '400000002',
  BuyCurrency: 'INR', SellCurrency: 'USD', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyAmount: 3328000, SellAmount: 40000,
  ValueDate: '2026-11-03', ForwardRate: 83.2, ActiveStatus: '0',
}
const rec = ndfRecord(
  fx,
  { CompanyCode: 'SG03', FinancialTransaction: '2000000000001', TxnStatus: '11', Ztrcode: 'C14', NdfMoRem: 'Incorrect fixing rate' },
  { BUKRS: 'SG03', RFHA: '2000000000001', BUTXT: 'SG03 - OLAM GlobalAgri', NDF_DATE: '2026-10-30', NDF_REF: 'RBI', BP_NAME: 'FMC Corporation' },
)
const row = rowFromRecord(rec, { RBI: 'RBI USD/INR Reference Rate' }, { '11': 'MO: NDF Fixing Correction Req' }, { C14: 'Ashon V' })

describe('rowFromRecord (GET_DATA of ZSGTSF_RFX_NDF_FIX_FO)', () => {
  it('maps the queued deal: NDF date, reference text, status text, trader, MO remark', () => {
    deepStrictEqual(
      [row.rfha, row.company, row.fixDate, row.fixRef, row.fixRefName, row.status, row.statusText, row.trader, row.partner, row.moRemark],
      ['2000000000001', 'SG03 - OLAM GlobalAgri', '30-10-2026', 'RBI', 'RBI USD/INR Reference Rate', '11', 'MO: NDF Fixing Correction Req', 'Ashon V', 'FMC Corporation', 'Incorrect fixing rate'],
    )
  })

  it('has no old fixing rate: BAPI_FTR_FXT_NDF_FIXING writes it and no service exposes it', () => {
    strictEqual(row.oldRate, 0)
  })

  it('settles in SAP\'s following currency, CURR1 being the lead (amt1 + amt2 / rate)', () => {
    deepStrictEqual([row.curr1, row.curr2, row.amt1, row.amt2, row.settleCurr, row.foreignFirst], ['USD', 'INR', -40000, 3328000, 'INR', false])
    near(calcSettlement(row, 84.25), -40000 + 3328000 / 84.25)
  })
})

describe('worklist filters', () => {
  it('blank NDF date shows the whole status-11 queue; a date narrows it', () => {
    strictEqual(filterRows([row], '', '', '').length, 1)
    strictEqual(filterRows([row], '', '', '30-10-2026').length, 1)
    strictEqual(filterRows([row], '', '', '31-10-2026').length, 0)
    strictEqual(filterRows([row, { ...row, rfha: 'x', status: '12' }], '', '', '').length, 1)
  })
})
