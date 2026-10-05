import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EXTRA_ORIGIN_COMPANY_CODES, fromChildRow, toChildRow, toChildStore, toContract, toMasCon, toOriginEntities } from './api.ts'
import { FIRST_CHILD_REFS } from './data.ts'
import { ensureChildContracts } from './logic.ts'

const row = {
  ZMC_REF_NO: '2000000001',
  ZMC_DESC: 'MC/OSIPL/2026/001',
  ZMC_DATE: '2026-09-23',
  ZORIGIN: 'OSIPL',
  ZAMT: '100000.00',
  ZCURR: 'USD',
  ZORG_AMT: '9571200.00',
  ZOCURR: 'INR',
  ZEX_RATE: '95.7120000',
  ZSHIP_START: '2026-10-01',
  ZSHIP_END: '2026-10-31',
  ZCOMMODITY: 'C105',
  ZCOM_DESC: 'CORN',
  ZCOM_DESC_LONG: 'CORN',
  ZENT_ID: 'E015',
  ZENT_DESC: 'OGA-DMCC-OSIPL',
  ZCURR_ID: 'C002',
  ZCURR_DESC: 'USD-USD-INR',
  ZMOD_ID: 'M032',
  ZMOD_DESC: 'INR Long Forward',
  ZMC_STAT: '01',
  ZPAY_TERMS: 'P01',
  ZPAY_TERMS_TEXT: '270 days from bill of lading date',
  ZPOS: 'Mumbai',
  ZPOD: 'Singapore',
}

describe('toContract', () => {
  it('reads a MAS_CON row into the screen shape', () => {
    const c = toContract(row, '12000031')
    strictEqual(c.mcNumber, 2000000001)
    strictEqual(c.status, 'Created')
    strictEqual(c.statusCode, '01')
    strictEqual(c.mcDate, '23-09-2026')
    strictEqual(c.shipEnd, '31-10-2026')
    strictEqual(c.mcAmountUsd, 100000)
    strictEqual(c.exchangeRate, 95.712)
    strictEqual(c.fxModelId, 'M032')
    strictEqual(c.entityString, 'OGA-DMCC-OSIPL')
    strictEqual(c.linkedDealId, '12000031')
    // No payment-date column: the form's own default, shipment end, stands in.
    strictEqual(c.paymentDate, '31-10-2026')
  })

  it('shows MC_STAT text for a status this screen has no word for', () => {
    strictEqual(toContract({ ...row, ZMC_STAT: '09' }, null).status, '09')
  })
})

describe('toMasCon', () => {
  it('writes the columns back, amounts as DECIMAL strings at the column scale', () => {
    const cols = toMasCon(toContract(row, null))
    strictEqual(cols['ZAMT'], '100000.00')
    strictEqual(cols['ZEX_RATE'], '95.7120000')
    strictEqual(cols['ZMC_DATE'], '2026-09-23')
    strictEqual(cols['ZSHIP_START'], '2026-10-01')
    strictEqual(cols['ZMOD_ID'], 'M032')
    strictEqual(cols['ZCURR_DESC'], 'USD-USD-INR')
    strictEqual('ZMC_STAT' in cols, false)
    strictEqual('ZMC_REF_NO' in cols, false)
  })
})

describe('child rows', () => {
  it('round-trips the six T1/T2/T3 combinations', () => {
    const contract = toContract(row, null)
    const { children } = ensureChildContracts({ byMc: {}, nextRef: { ...FIRST_CHILD_REFS } }, contract)
    const rows = children.map((ch) => toChildRow(ch, contract))
    strictEqual(rows.length, 6)
    deepStrictEqual(rows[0], {
      ZMC_REF: '2000000001',
      ZMC_CHILD: '110001',
      ZCHILD_TYPE: '02',
      ZCHILD_AMT: '100000.00',
      ZCHILD_CURR: 'USD',
      ZMC_NO: '2026 / 2000000001 / T1S',
      ZMC_DESC: 'OGA-DMCC-S',
      ZSELL: 'OGA',
      ZBUY: 'DMCC',
      ZPS: 'S',
      ZTRADE: 'T1',
    })
    const back = rows.map((r) => fromChildRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))))
    deepStrictEqual(back, children)
  })

  it('continues each trade type past the highest stored reference', () => {
    const store = toChildStore([
      { ZMC_REF: '2000000001', ZMC_CHILD: '110004', ZCHILD_TYPE: '02', ZPS: 'S', ZTRADE: 'T1' },
      { ZMC_REF: '2000000001', ZMC_CHILD: '220002', ZCHILD_TYPE: '02', ZPS: 'S', ZTRADE: 'T2' },
    ])
    deepStrictEqual(store.nextRef, { T1: 110005, T2: 220003, T3: FIRST_CHILD_REFS.T3 })
    strictEqual(store.byMc['2000000001']?.length, 2)
  })
})

describe('origin entities', () => {
  const comp = (code: string, bukrs: string, origin: string, currency: string) => ({ ZCOM_ID: code, ZBUKRS: bukrs, ZBUTXT: code + ' Ltd', ZWAERS: currency, ZORIGIN: origin })
  const rows = [comp('DMCC', 'AE13', '', 'AED'), comp('OSIPL', 'IN11', 'X', 'INR'), comp('OGA', 'SG03', '', 'USD'), comp('OTL', 'TH10', 'X', 'THB'), comp('OVL', 'VN10', 'X', 'VND'), comp('OGAT', 'SG39', '', 'USD')]

  it('offers the flagged origin entities and SG03, and no other unflagged company', () => {
    deepStrictEqual(toOriginEntities(rows).map((e) => e.code), ['OSIPL', 'OGA', 'OTL', 'OVL'])
    deepStrictEqual(EXTRA_ORIGIN_COMPANY_CODES, ['SG03'])
  })

  it('maps the code, company code, name and currency of each', () => {
    deepStrictEqual(toOriginEntities(rows)[1], { code: 'OGA', companyCode: 'SG03', name: 'OGA Ltd', currency: 'USD' })
  })

  it('lists SG03 once even when the master data flags it too', () => {
    deepStrictEqual(toOriginEntities([comp('OGA', 'SG03', 'X', 'USD')]).map((e) => e.code), ['OGA'])
  })
})
