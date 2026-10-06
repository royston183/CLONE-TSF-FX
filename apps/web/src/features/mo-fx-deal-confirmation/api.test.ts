import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '@slc/api-client'
import { QUEUE_UNAVAILABLE, actionUnavailable, companyOptions, dealIdsByTransaction, dealKey, sapMessage, traderOptions } from './api.ts'
import { filterComboOptions } from './logic.ts'

describe('Company Code value help (T001 / A_CompanyCode)', () => {
  it('keeps leading zeros, sorts by code and reads "<code> - <name>"', () => {
    const opts = companyOptions([
      { CompanyCode: 'SG03', CompanyCodeName: 'OLAM GlobalAgri Pte. Ltd' },
      { CompanyCode: '0001', CompanyCodeName: 'SAP SE' },
      { CompanyCode: 'IN11', CompanyCodeName: '' },
      { CompanyCodeName: 'no code' },
    ])
    deepStrictEqual(
      opts.map((o) => [o.code, o.display, o.sub]),
      [
        ['0001', '0001 - SAP SE', 'SAP SE'],
        ['IN11', 'IN11', ''],
        ['SG03', 'SG03 - OLAM GlobalAgri Pte. Ltd', 'OLAM GlobalAgri Pte. Ltd'],
      ],
    )
    deepStrictEqual(
      filterComboOptions(opts, 'olam').map((o) => o.code),
      ['SG03'],
    )
  })
})

describe('Trader value help (ZSGTRMTR_TRADER)', () => {
  it('one option per ZTCODE, blank codes dropped, sorted, "<code> - <ZNAME>"', () => {
    // As served on 2026-10-05 (middleware "trmTrader").
    const opts = traderOptions([
      { ZTCODE: 'C15', ZNAME: 'Karthik Ramaswamy', ZTRADER: 'Karthik R' },
      { ZTCODE: 'C14', ZNAME: 'Ashon Vallado', ZTRADER: 'Ashon V' },
      { ZTCODE: 'C14', ZNAME: 'duplicate', ZTRADER: 'dup' },
      { ZTCODE: '', ZNAME: 'blank code', ZTRADER: '' },
      { ZTCODE: 'V12', ZNAME: '', ZTRADER: 'CHARUTHA V' },
    ])
    deepStrictEqual(
      opts.map((o) => o.display),
      ['C14 - Ashon Vallado', 'C15 - Karthik Ramaswamy', 'V12 - CHARUTHA V'],
    )
    deepStrictEqual(
      filterComboOptions(opts, 'c1').map((o) => o.code),
      ['C14', 'C15'],
    )
  })
})

describe('gated without the ZSGTSFR024 source', () => {
  it('says why the queue is empty and that actions post nothing', () => {
    ok(QUEUE_UNAVAILABLE.startsWith('WAITING FOR API — ABAP source for ZSGTSFR024 not exported'))
    const msg = actionUnavailable('Match & Release')
    ok(msg.startsWith('WAITING FOR ACTION API — Match & Release ('))
    strictEqual(msg.endsWith('Nothing was posted to SAP.'), true)
  })
})

describe('helpers kept for fo-fx-error-correction / fo-change-deal-id', () => {
  it('maps each transaction on a live Deal ID to the lowest Deal ID, skipping cancelled (30) ones', () => {
    const m = dealIdsByTransaction([
      { ZDEAL_ID: '7000000020', ZDEAL_STAT: '01', ZBUKRS1: 'SG03', ZRFHA1: '5' },
      { ZDEAL_ID: '7000000010', ZDEAL_STAT: '01', ZBUKRS3: 'SG03', ZRFHA3: '5' },
      { ZDEAL_ID: '7000000003', ZDEAL_STAT: '30', ZBUKRS1: 'SG03', ZRFHA1: '9' },
    ])
    strictEqual(m.get(dealKey('SG03', '5')), '7000000010')
    ok(!m.has('SG03-9'))
  })

  it('takes the cause out of a BAPI refusal', () => {
    const e = new ApiError('BAPI processing was terminated', 400, {
      error: { details: [{ code: 'FTR0/161', message: 'BAPI processing was terminated' }, { code: 'X/1', message: 'Cause' }] },
    })
    strictEqual(sapMessage(e), 'Cause')
    strictEqual(sapMessage(new Error('boom')), 'boom')
  })
})
