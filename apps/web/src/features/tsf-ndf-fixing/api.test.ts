import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { VIEW_REQUIRED_COLUMNS, companyOptions, dealFromView, eligible, invertedDate, missingColumns, traderOptions } from './api.ts'
import { applyFilters, calcCashSettlement, checkRate, leadCurr } from './logic.ts'
import type { NdfDeal } from './types.ts'

const near = (a: number, b: number) => ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)

describe('screen 1000 value helps', () => {
  it('Trader: ZSGTRMTR_TRD_GRP sorted, one row per ZTCODE, "<code> - <name>"', () => {
    // As served on 2026-10-01: a trader repeats once per trader group.
    const rows = [
      { ZTCODE: 'C20', ZTRADER: 'Nidhi S', ZGRP: 'G02' },
      { ZTCODE: 'C14', ZTRADER: 'Ashon V', ZGRP: 'G00' },
      { ZTCODE: 'C14', ZTRADER: 'Ashon V', ZGRP: 'G01' },
      { ZTCODE: '', ZTRADER: 'blank code', ZGRP: 'G01' },
    ]
    deepStrictEqual(traderOptions(rows), [
      { value: 'C14', label: 'C14 - Ashon V' },
      { value: 'C20', label: 'C20 - Nidhi S' },
    ])
  })

  it('Company Code: T001 keys as SAP holds them, by code', () => {
    deepStrictEqual(
      companyOptions([
        { CompanyCode: 'SG03', CompanyCodeName: 'OLAM GlobalAgri Pte. Ltd' },
        { CompanyCode: '0001', CompanyCodeName: 'SAP SE' },
      ]).map((o) => o.value),
      ['0001', 'SG03'],
    )
  })
})

describe('GET_DATA', () => {
  it('names the ZSGTSFV_FX fields the middleware view does not serve (as registered on 2026-10-01)', () => {
    // prettier-ignore
    const served = ['MANDT','BUKRS','RFHA','SAKTIV','SGSART','BUTXT','LTX','SFHAART','XTEXT','BP_NAME','RFHAZUL','KONTRH','RBUSA','BA_NAME','RPORTB','XPORTB','ZUONR','ZUOND','ASSIGN_DESC','REFER','INT_REF_DESC','OBJNR','REFNR','DBLFZ','DELFZ','SFGTYP','SANLF','ZWAERS','ZCOM_ID','RDEALER','GSPPART','NORDEXT','NDF_DATE','NDF_REF','BS','BS_O','BS_1','BS_2','CURR1','CURR2','AMT1','AMT2','CURR_ST1','ZAMT_ST1','CURR_ST2','ZAMT_ST2','OSPOT','OSWAP','OTOT_RATE','T_RATE','DCRDAT','CRUSER','TCRTIM','DUPDAT','UPUSER','TUPTIM']
    deepStrictEqual(missingColumns(served, VIEW_REQUIRED_COLUMNS), ['TXN_STATUS', 'V_DATE', 'ZTRCODE', 'TRD_NAME', 'CPAIR', 'CASH_CURR', 'ZCASH_AMT', 'EXT_STAT_DESC'])
  })

  it('keeps TXN_STATUS 07, SAKTIV <> 3, NDF product types (sgsart+2(1) = D) and the trader', () => {
    const rows = [
      { RFHA: '1', TXN_STATUS: '07', SAKTIV: '1', SGSART: '12D', ZTRCODE: 'C14' },
      { RFHA: '2', TXN_STATUS: '10', SAKTIV: '1', SGSART: '12D', ZTRCODE: 'C14' }, // already fixed
      { RFHA: '3', TXN_STATUS: '07', SAKTIV: '3', SGSART: '12D', ZTRCODE: 'C14' }, // reversed
      { RFHA: '4', TXN_STATUS: '07', SAKTIV: '1', SGSART: '12B', ZTRCODE: 'C14' }, // forward, not NDF
      { RFHA: '5', TXN_STATUS: '07', SAKTIV: '1', SGSART: '12D', ZTRCODE: 'C20' },
    ]
    deepStrictEqual(eligible(rows, '').map((r) => r.RFHA), ['1', '5'])
    deepStrictEqual(eligible(rows, 'C14').map((r) => r.RFHA), ['1'])
  })

  it('maps a view row, keeping RFHA leading zeros and showing NDF_DATE / filtering on V_DATE', () => {
    const d = dealFromView({
      BUKRS: 'IN11', RFHA: '0000005000000', ZTRCODE: 'C14', TRD_NAME: 'Ashon V', BS_1: 'Buy', CURR1: 'USD', CURR2: 'INR',
      AMT1: '1000000.00', AMT2: '-96200000.00', OSPOT: '96.1', OSWAP: '0.1', OTOT_RATE: '96.2', NDF_DATE: '2026-10-12',
      V_DATE: '2026-10-14', ZCASH_AMT: '0.00', CASH_CURR: 'USD', CPAIR: 'USD:INR', NDF_REF: 'RBI', EXT_STAT_DESC: 'Validated', TXN_STATUS: '07',
    })
    deepStrictEqual([d.id, d.traderCode, d.date, d.vDate, d.fwd, d.cpair, d.txnStatus], ['0000005000000', 'C14', '12-10-2026', '14-10-2026', 96.2, 'USD:INR', '07'])
  })

  it('reads TCURR by inverted date', () => {
    strictEqual(invertedDate('2026-10-01'), '79738998') // 99999999 - 20261001
  })
})

const deal = (o: Partial<NdfDeal>): NdfDeal => ({
  id: '1', company: 'IN11', trader: '', traderCode: '', side: 'Buy', pair: 'USD/INR', amt1: 0, c1: 'USD', amt2: 0, c2: 'INR',
  spot: 0, swap: 0, fwd: 0, date: '', vDate: '', ndf: 0, cashCurr: '', cpair: '', ref: '', status: '', txnStatus: '07', remarks: '', moRemarks: '', ...o,
})

describe('FORM cash_settelment (screen 9001)', () => {
  it('settles the following-currency leg at the fixing rate against the other leg', () => {
    // USD/INR: INR follows, curr1 (USD) is not the follow -> amt1 + amt2 / rate
    near(calcCashSettlement(deal({ amt1: 1_000_000, amt2: -96_200_000 }), 95.8425), 1_000_000 + -96_200_000 / 95.8425)
    // VND/USD: VND follows and is curr1, quoted per 100 -> amt2 + amt1 * 100 / rate
    near(calcCashSettlement(deal({ c1: 'VND', c2: 'USD', amt1: 2_500_000_000, amt2: -100_000 }), 25_000), -100_000 + (2_500_000_000 * 100) / 25_000)
    strictEqual(calcCashSettlement(deal({ amt1: 1, amt2: 1 }), 0), 0)
  })

  it('scales the rate with TCURF kurst MTM when the factors differ (CHECK_RATE)', () => {
    strictEqual(checkRate({ c1: 'VND', c2: 'USD' }, 250, { 'VND>USD': { ffact: 100, tfact: 1 } }), 25000)
    strictEqual(checkRate({ c1: 'USD', c2: 'INR' }, 95, {}), 95)
    deepStrictEqual(leadCurr('INR', 'USD'), { lead: 'USD', follow: 'INR' })
  })
})

describe('worklist filters', () => {
  it('compares the Fixing Date with V_DATE and the trader with ZTRCODE', () => {
    const list = [deal({ id: 'a', vDate: '14-10-2026', date: '12-10-2026', traderCode: 'C14' }), deal({ id: 'b', vDate: '15-10-2026', traderCode: 'C20' })]
    const f = { search: '', company: '', trader: '', fixingDate: '14-10-2026' }
    deepStrictEqual(applyFilters(list, f, true).map((d) => d.id), ['a'])
    deepStrictEqual(applyFilters(list, { ...f, fixingDate: '', trader: 'C20' }, true).map((d) => d.id), ['b'])
  })
})
