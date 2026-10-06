import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { leg } from './data.ts'
import { fixtureDeal } from './fixtures.ts'
import { fmtAmt, round2, todayStr } from './format.ts'
import {
  firstUnreadyLeg,
  invoicesEditable,
  invoicesVisible,
  legForInvoice,
  searchDeals,
  toggleLeg,
  toolbarButtons,
} from './logic.ts'
import type { DealDb } from './types.ts'

describe('format', () => {
  it('fmtAmt groups, keeps the sign and shows — for NaN', () => {
    strictEqual(fmtAmt(1234.5), '1,234.50')
    strictEqual(fmtAmt(-6400), '-6,400.00')
    strictEqual(fmtAmt(95.5587, 4), '95.5587')
    strictEqual(fmtAmt(Number.NaN), '—')
    strictEqual(fmtAmt(undefined), '—')
  })
  it('todayStr is DD-MM-YYYY', () => {
    strictEqual(todayStr(new Date(2026, 8, 3)), '03-09-2026')
  })
  it('leg() stamps totPl', () => {
    const l = fixtureDeal().legs[0]!
    strictEqual(leg({ ...l, fxPl: 412.5, setPl: 118.2 }).totPl, round2(412.5 + 118.2))
    strictEqual(leg({ ...l, fxPl: 1.005, setPl: 0 }).totPl, 1.01)
  })
})

describe('searchDeals', () => {
  const db: DealDb = {
    a: fixtureDeal(),
    b: fixtureDeal({ dealId: '7000000006', dealRef: 'OGA-CORN', mcRefNo: '2000000005', traderCode: 'OGA', traderDesc: 'FX Desk', fxModel: 'M032' }),
  }
  it('lists every deal for an empty term', () => {
    strictEqual(searchDeals(db, '').length, 2)
    strictEqual(searchDeals(db, '   ').length, 2)
  })
  it('matches id, reference, MC ref, trader code/description and model, case-insensitively', () => {
    deepStrictEqual(searchDeals(db, '0011').map((d) => d.dealId), ['7000000011'])
    deepStrictEqual(searchDeals(db, 'soyoil').map((d) => d.dealId), ['7000000011'])
    deepStrictEqual(searchDeals(db, '2000000005').map((d) => d.dealId), ['7000000006'])
    deepStrictEqual(searchDeals(db, 'ovl').map((d) => d.dealId), ['7000000011'])
    deepStrictEqual(searchDeals(db, 'vietnam').map((d) => d.dealId), ['7000000011'])
    deepStrictEqual(searchDeals(db, 'm032').map((d) => d.dealId), ['7000000006'])
    strictEqual(searchDeals(db, 'nothing-like-this').length, 0)
  })
})

describe('toolbarButtons (SET PF-STATUS 111 EXCLUDING, ZSGTSFP017)', () => {
  it('status 01 excludes only REV; Edit Deal Pair needs a selected leg', () => {
    deepStrictEqual(toolbarButtons(fixtureDeal(), null), ['UPD', 'PRE', 'CAN', 'SS_DEALLOC', 'SS_DEAL', 'DMS', 'REF'])
    deepStrictEqual(toolbarButtons(fixtureDeal(), '5000456830'), [
      'UPD', 'PRE', 'DEAL_EDIT', 'CAN', 'SS_DEALLOC', 'SS_DEAL', 'DMS', 'REF',
    ])
  })
  it('SS_DEALLOC / SS_DEAL are never excluded, also for a non-SS deal', () => {
    deepStrictEqual(toolbarButtons(fixtureDeal({ isSS: false }), null), ['UPD', 'PRE', 'CAN', 'SS_DEALLOC', 'SS_DEAL', 'DMS', 'REF'])
  })
  it('REV only for 02/03 with TVARVC ZSGTSF_UNWIND; other statuses lose UPD / CAN / DEAL_EDIT', () => {
    deepStrictEqual(toolbarButtons(fixtureDeal({ status: '02', reversalAuthorized: true }), 'x'), [
      'PRE', 'SS_DEALLOC', 'SS_DEAL', 'REV', 'DMS', 'REF',
    ])
    deepStrictEqual(toolbarButtons(fixtureDeal({ status: '03', reversalAuthorized: true }), null), [
      'PRE', 'SS_DEALLOC', 'SS_DEAL', 'REV', 'DMS', 'REF',
    ])
    deepStrictEqual(toolbarButtons(fixtureDeal({ status: '02' }), null), ['PRE', 'SS_DEALLOC', 'SS_DEAL', 'DMS', 'REF'])
    deepStrictEqual(toolbarButtons(fixtureDeal({ status: '30', reversalAuthorized: true }), 'x'), [
      'PRE', 'SS_DEALLOC', 'SS_DEAL', 'DMS', 'REF',
    ])
    deepStrictEqual(toolbarButtons(fixtureDeal({ status: '01', reversalAuthorized: true }), null), [
      'UPD', 'PRE', 'CAN', 'SS_DEALLOC', 'SS_DEAL', 'DMS', 'REF',
    ])
  })
})

describe('invoice cards', () => {
  it('hidden for a no-invoice model and for status 30 only (STATUS_9000 group HID)', () => {
    strictEqual(invoicesVisible(fixtureDeal()), true)
    strictEqual(invoicesVisible(fixtureDeal({ noInvoiceModel: true })), false)
    strictEqual(invoicesVisible(fixtureDeal({ status: '30' })), false)
    strictEqual(invoicesVisible(fixtureDeal({ status: '50' })), true)
  })
  it('exchange rate editable only at 01', () => {
    strictEqual(invoicesEditable(fixtureDeal()), true)
    strictEqual(invoicesEditable(fixtureDeal({ status: '02' })), false)
  })
  it('an invoice line belongs to the leg of its ZDTYPE', () => {
    const d = fixtureDeal()
    strictEqual(legForInvoice(d, d.invoices[0]!)?.rfha, '5000456830')
    strictEqual(legForInvoice(d, { ...d.invoices[0]!, dtype: '' }), undefined)
  })
})

describe('Change / Confirm guard', () => {
  it('names the first leg below 07, skipping TXN_STATUS 02 rows (colour C501)', () => {
    const d = fixtureDeal()
    strictEqual(firstUnreadyLeg(d)?.rfha, '5000456830')
    const legs = d.legs.map((l) => ({ ...l, txnStatus: l.rfha === '5000456830' ? '02' : l.txnStatus }))
    strictEqual(firstUnreadyLeg({ ...d, legs }), undefined)
    strictEqual(firstUnreadyLeg({ ...d, legs: [] }), undefined)
  })
})

describe('toggleLeg', () => {
  it('selects and deselects', () => {
    strictEqual(toggleLeg(null, 'a'), 'a')
    strictEqual(toggleLeg('a', 'a'), null)
    strictEqual(toggleLeg('a', 'b'), 'b')
  })
})
