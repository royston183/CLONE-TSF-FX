import { deepStrictEqual, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LIST_UNAVAILABLE, actionUnavailable, companyItems, traderItems } from './api.ts'
import { filterDropdownItems } from './logic.ts'

describe('Company Code value help (T001 / A_CompanyCode)', () => {
  it('keeps the code (leading zeros) as the value, the name as the second line, sorted by code', () => {
    const items = companyItems([
      { CompanyCode: 'SG03', CompanyCodeName: 'OLAM GlobalAgri Pte. Ltd' },
      { CompanyCode: '0001', CompanyCodeName: 'SAP SE' },
      { CompanyCode: 'IN11', CompanyCodeName: ' ' },
      { CompanyCodeName: 'no code' },
    ])
    deepStrictEqual(items, [
      { primary: '0001', secondary: 'SAP SE', code: '0001' },
      { primary: 'IN11', code: 'IN11' },
      { primary: 'SG03', secondary: 'OLAM GlobalAgri Pte. Ltd', code: 'SG03' },
    ])
    deepStrictEqual(
      filterDropdownItems(items, 'olam').map((i) => i.primary),
      ['SG03'],
    )
  })
})

describe('Trader value help (ZSGTRMTR_TRADER)', () => {
  it('one item per ZTCODE, blank codes dropped, sorted, "<code> - <ZNAME>"', () => {
    // As served on 2026-10-05 (middleware "trmTrader").
    const items = traderItems([
      { ZTCODE: 'C15', ZNAME: 'Karthik Ramaswamy', ZTRADER: 'Karthik R' },
      { ZTCODE: 'C14', ZNAME: 'Ashon Vallado', ZTRADER: 'Ashon V' },
      { ZTCODE: 'C14', ZNAME: 'duplicate', ZTRADER: 'dup' },
      { ZTCODE: '', ZNAME: 'blank code', ZTRADER: '' },
    ])
    deepStrictEqual(items, [
      { primary: 'C14 - Ashon Vallado', code: 'C14' },
      { primary: 'C15 - Karthik Ramaswamy', code: 'C15' },
    ])
  })
})

describe('gated without the ZSGTSFR026 source', () => {
  it('says why the list is empty and that actions post nothing', () => {
    ok(LIST_UNAVAILABLE.startsWith('WAITING FOR API — ABAP source for ZSGTSFR026 not exported'))
    const msg = actionUnavailable('Correction Required')
    ok(msg.startsWith('WAITING FOR ACTION API — Correction Required ('))
    ok(msg.endsWith('Nothing was posted to SAP.'))
  })
})
