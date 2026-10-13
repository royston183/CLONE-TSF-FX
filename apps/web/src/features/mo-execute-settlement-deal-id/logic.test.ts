import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { STATUS_LIST, seedDeal, seedFxDeals, seedTradeInvoices } from './fixtures.ts'
import { formatAmount } from './format.ts'
import {
  DATE_REQUIRED,
  amendDateInitial,
  diff1Amount,
  filterFxDeals,
  filterInvoices,
  fxPostDefaults,
  invPostDefaults,
  normalizeDealId,
  plAmount,
  statusClass,
  statusMeta,
  toggleRowSelection,
  toolbarVisibility,
  validateDate,
} from './logic.ts'
import type { FxDeal, TradeInvoice } from './types.ts'

describe('selection screen', () => {
  it('requires a Deal ID and upper-cases it', () => {
    strictEqual(normalizeDealId('   '), null)
    strictEqual(normalizeDealId(' tsf-9081 '), 'TSF-9081')
  })
})

describe('status and toolbar', () => {
  it('shows Initiate Settlement for 05..19, Execution Complete only at 20', () => {
    deepStrictEqual(toolbarVisibility('01'), { showInit: false, showExeC: false })
    deepStrictEqual(toolbarVisibility('04'), { showInit: false, showExeC: false })
    deepStrictEqual(toolbarVisibility('05'), { showInit: true, showExeC: false })
    deepStrictEqual(toolbarVisibility('19'), { showInit: true, showExeC: false })
    deepStrictEqual(toolbarVisibility('20'), { showInit: false, showExeC: true })
    deepStrictEqual(toolbarVisibility('21'), { showInit: false, showExeC: false })
    deepStrictEqual(toolbarVisibility('25'), { showInit: false, showExeC: false })
  })

  it('looks status meta up in the given list; an unknown code keeps its code and has no text', () => {
    strictEqual(statusMeta('20', STATUS_LIST).text, 'Settlement Initiated')
    deepStrictEqual(statusMeta('99', STATUS_LIST), { code: '99', text: '', cls: 'pill-done' })
  })

  it('colours the pill by code band', () => {
    strictEqual(statusClass('01'), 'pill-early')
    strictEqual(statusClass('07'), 'pill-progress')
    strictEqual(statusClass('15'), 'pill-due')
    strictEqual(statusClass('20'), 'pill-init')
    strictEqual(statusClass('22'), 'pill-done')
    strictEqual(statusClass(''), 'pill-early')
  })
})

describe('grid search and selection', () => {
  it('filters FX deals case-insensitively and keeps the original index', () => {
    const fx = seedFxDeals()
    strictEqual(filterFxDeals(fx, '').length, 2)
    const hit = filterFxDeals(fx, 'oaipl')
    strictEqual(hit.length, 1)
    strictEqual(hit[0]?.idx, 1)
    strictEqual(filterFxDeals(fx, 'zzz').length, 0)
  })

  it('filters invoice legs', () => {
    const inv = seedTradeInvoices()
    deepStrictEqual(filterInvoices(inv, 'payment').map((x) => x.idx), [1])
    deepStrictEqual(filterInvoices(inv, 'letter').map((x) => x.idx), [2])
  })

  it('toggles a row selection', () => {
    strictEqual(toggleRowSelection(null, 1), 1)
    strictEqual(toggleRowSelection(1, 1), null)
    strictEqual(toggleRowSelection(1, 0), 0)
  })
})

describe('amend end date / edit DMS validation', () => {
  it('starts from the revised date when there is one', () => {
    const deal = seedDeal()
    strictEqual(amendDateInitial(deal), '15-03-2026')
    strictEqual(amendDateInitial({ ...deal, revisedEndDate: '01-04-2026' }), '01-04-2026')
  })

  it('requires a date', () => {
    deepStrictEqual(validateDate('  '), { ok: false, error: DATE_REQUIRED })
    deepStrictEqual(validateDate(' 01-04-2026 '), { ok: true, value: '01-04-2026' })
  })
})

describe('difference and P&L', () => {
  it('computes Diff 1 from rate, spot and amount 1', () => {
    const [d1, d2] = seedFxDeals() as [FxDeal, FxDeal]
    strictEqual(diff1Amount(d1), '0.00')
    strictEqual(diff1Amount({ ...d2, spot: '83.0000' }), '4250.00')
  })

  it('is shown on the D2 leg only, from the D2 and D1 all-in rates', () => {
    const fx = seedFxDeals() as [FxDeal, FxDeal]
    strictEqual(plAmount(fx, fx[0]), null)
    const pl = plAmount(fx, fx[1])
    strictEqual(pl !== null && Math.round(pl), 425000)
    strictEqual(formatAmount(pl ?? 0), '425,000.00')
  })
})

describe('FX transaction posting', () => {
  it('fills the popup defaults from the leg (company code included)', () => {
    const [d1, d2] = seedFxDeals() as [FxDeal, FxDeal]
    const d = fxPostDefaults(d1)
    strictEqual(d.bukrs, 'AE13')
    strictEqual(d.dealType, 'D1 - Buy/Sell leg 1')
    strictEqual(d.bAmt, '415,000,000.00 INR')
    strictEqual(d.sAmt, '5,000,000.00 USD')
    strictEqual(fxPostDefaults(d2).dealType, 'D2 - Buy/Sell leg 2')
  })

  it('shows the BO documents read-only and starts the house banks blank', () => {
    const d = fxPostDefaults({ ...(seedFxDeals()[0] as FxDeal), doc1: '6800237281' })
    strictEqual(d.sDoc, '6800237281')
    deepStrictEqual([d.bHouseBank, d.bAccountId, d.sHouseBank, d.sAccountId], ['', '', '', ''])
  })
})

describe('invoice settlement pop-up', () => {
  it('the buyer pays and the seller receives, on a Receipt leg as on a Payment one', () => {
    const [t1, t2] = seedTradeInvoices() as [TradeInvoice, TradeInvoice]
    const receipt = invPostDefaults({ ...t1, buy: 'OGA', sell: 'DMCC' }, 'TSF-9081')
    strictEqual(receipt.sender, 'OGA')
    strictEqual(receipt.receiver, 'DMCC')
    const payment = invPostDefaults({ ...t2, buy: 'OGA', sell: 'DMCC' }, 'TSF-9081')
    strictEqual(payment.sender, 'OGA')
    strictEqual(payment.receiver, 'DMCC')
    strictEqual(payment.amt, '5,010,000.00 USD')
    strictEqual(payment.docMsg, 'DMCC sells to OAIPL - T2 settlement for Deal ID TSF-9081')
  })

  it('fills the house banks and accounts from the stored leg, else leaves them blank', () => {
    const t1 = seedTradeInvoices()[0] as TradeInvoice
    const d = invPostDefaults({ ...t1, senderHouseBank: '', senderAccountId: '', receiverHouseBank: '', receiverAccountId: '' }, 'X')
    deepStrictEqual(
      [d.senderHouseBank, d.senderAccountId, d.receiverHouseBank, d.receiverAccountId],
      ['', '', '', ''],
    )
    const stored = invPostDefaults({ ...t1, senderHouseBank: 'SCB01', senderAccountId: 'USD01', receiverHouseBank: 'HDF01', receiverAccountId: 'INR01' }, 'X')
    deepStrictEqual(
      [stored.senderHouseBank, stored.senderAccountId, stored.receiverHouseBank, stored.receiverAccountId],
      ['SCB01', 'USD01', 'HDF01', 'INR01'],
    )
  })
})
