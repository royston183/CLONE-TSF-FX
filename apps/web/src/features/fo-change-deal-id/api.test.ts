import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FxRow } from '../../shared/fx/mw.ts'
import { fxKey, legs, toDeal, toMasterContract, type Related } from './api.ts'
import { hasUnverifiedLegs, isMcChangeBlocked, legStatus, mcChangeError } from './logic.ts'
import type { Deal } from './types.ts'

// Rows as the middleware served them on 2026-10-01 (Deal ID 7000000009 and its MC / legs).
const dealRow: FxRow = {
  CLIENT: '100', ZDEAL_ID: '7000000009', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_DESC: 'Deal 9', ZDEAL_REF: '',
  ZDEAL_STAT: '01', ZMC_REF: '2000000028', ZTSF_MODEL: 'M033', ZTRD_CODE: 'C', ZS_DATE: '2026-10-01', ZE_DATE: '2026-12-31',
  ZBUKRS1: 'SG03', ZRFHA1: '3000000000015', ZBUKRS2: 'SG03', ZRFHA2: '2000000000001',
}
const mcRow: FxRow = {
  ZMC_REF_NO: '2000000028', ZMC_DESC: 'MC 28', ZMC_DATE: '2026-09-30', ZORIGIN: 'OSIPL', ZAMT: '100000.00', ZCURR: 'USD',
  ZMOD_ID: 'M033', ZMOD_DESC: 'INR-INR-INR Forward', ZENT_DESC: 'OGA-OSIPL-DMCC', ZCURR_DESC: 'INR-INR-INR',
  ZSHIP_START: '2026-10-01', ZSHIP_END: '2026-12-31', ZMC_STAT: '03',
}
const fxRow: FxRow = {
  BUKRS: 'SG03', RFHA: '2000000000001', XTEXT: '631 - NDF - TSF', BP_NAME: '0400000002 - FMC Corporation', KONTRH: '0400000002',
  DBLFZ: '2026-09-30', DELFZ: '2026-10-05', BS_1: 'Sell', CURR1: 'USD', AMT1: '-40000.00', BS_2: 'Buy', CURR2: 'INR',
  AMT2: '3328000.00', OSPOT: '83.2000000', OSWAP: '0', OTOT_RATE: '', ZCOM_ID: 'OGA',
}
const rel: Related = {
  mcByRef: new Map([['2000000028', mcRow]]),
  fxByKey: new Map([[fxKey('SG03', '2000000000001'), fxRow]]),
  traderName: new Map([['C', 'Charlie']]),
  plans: [{ ZDEAL_ID: '7000000009', ZTTYPE: 'T1', ZTRD_SELL: 'OGA', ZTRD_BUY: 'DMCC', ZTRD_CURR: 'USD', ZINV_TRM_NO: '8000000001', ZAMT: '100.00', ZEX_RATE: '83.0000000', ZINV_AMT: '8300.00' }],
}

describe('a Deal ID from MySQL', () => {
  const deal = toDeal(dealRow, rel)

  it('takes its header from DEALID and its MC, model and strings from the Master Contract', () => {
    strictEqual(deal.dealId, '7000000009')
    strictEqual(deal.status, '01')
    strictEqual(deal.sDate, '01-10-2026')
    strictEqual(deal.mcRef, '2000000028')
    strictEqual(deal.mcDesc, 'MC 28')
    strictEqual(deal.modId, 'M033')
    strictEqual(deal.entStr, 'OGA-OSIPL-DMCC')
    strictEqual(deal.currStr, 'INR-INR-INR')
    strictEqual(deal.trdDesc, 'Charlie')
  })

  it('shows one leg per filled slot, in slot order and named D1, D2 …', () => {
    deepStrictEqual(deal.top.map((l) => [l.dealType, l.rfha]), [['D1', '3000000000015'], ['D2', '2000000000001']])
  })

  it('fills a leg from the FX view and leaves it bare when the view lacks it', () => {
    const [d1, d2] = deal.top
    strictEqual(d1!.bpName, '')
    strictEqual(d1!.curr1, '')
    strictEqual(d2!.bpName, '0400000002 - FMC Corporation')
    strictEqual(d2!.amt1, -40000)
    strictEqual(d2!.dblfz, '30-09-2026')
    strictEqual(d2!.otot_rate, '')
    strictEqual(d2!.txnStatus, '')
  })

  it('reads the planned invoice lines of the deal from INV_REF', () => {
    deepStrictEqual(deal.inv, [{ zttype: 'T1', sell: 'OGA', buy: 'DMCC', curr: 'USD', trmNo: '8000000001', amt: 100, exRate: 83, invAmt: 8300 }])
  })

  it('skips empty slots', () => {
    strictEqual(legs({ ...dealRow, ZRFHA2: '', ZBUKRS2: '' }, rel).length, 1)
  })
})

describe('a leg status', () => {
  it('is unknown, not Open, when the source gives no TXN_STATUS', () => {
    const [d1] = toDeal(dealRow, rel).top
    strictEqual(legStatus(d1!), '')
    strictEqual(legStatus({ ...d1!, txnStatus: '03' }), '02')
  })
})

describe('an MC in the picker', () => {
  it('carries its model and currency string for the change check', () => {
    const mc = toMasterContract(mcRow)
    strictEqual(mc.ref, '2000000028')
    strictEqual(mc.model, 'M033')
    strictEqual(mc.currStr, 'INR-INR-INR')
    strictEqual(mc.entstr, 'OGA-OSIPL-DMCC')
  })
})

describe('changing the MC Ref No', () => {
  const deal = toDeal(dealRow, rel)
  const mc = toMasterContract(mcRow)

  it('accepts an MC with the deal\'s own model and strings', () => {
    strictEqual(mcChangeError(deal, mc), null)
  })

  it('refuses another model, entity string or currency string', () => {
    strictEqual(mcChangeError(deal, { ...mc, model: 'M042' }), 'MC 2000000028 is under FX model M042; this Deal ID is under M033.')
    strictEqual(mcChangeError(deal, { ...mc, entstr: 'OGA-DMCC-OSIPL' })?.startsWith('MC 2000000028 has entity string'), true)
    strictEqual(mcChangeError(deal, { ...mc, currStr: 'USD-USD-INR' })?.startsWith('MC 2000000028 has currency string'), true)
  })

  it('cannot pass the leg-status rule while TXN_STATUS is missing, and says why', () => {
    strictEqual(hasUnverifiedLegs(deal), true)
    strictEqual(isMcChangeBlocked(deal), true)
  })

  it('passes once every leg carries TXN_STATUS 03, or the deal has no legs', () => {
    const matched: Deal = { ...deal, top: deal.top.map((l) => ({ ...l, txnStatus: '03' })) }
    strictEqual(hasUnverifiedLegs(matched), false)
    strictEqual(isMcChangeBlocked(matched), false)
    strictEqual(hasUnverifiedLegs({ ...deal, top: [] }), false)
  })
})
