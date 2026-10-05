import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { seedDeal, seedDms, seedFxDeals, seedTradeInvoices } from './data.ts'
import { formatAmount } from './format.ts'
import {
  DATE_REQUIRED,
  POST_FX_FIRST,
  POST_INV_FIRST,
  addDmsDocument,
  amendDateInitial,
  applyEndDate,
  applySpotData,
  buildFxLetter,
  buildInvoiceLetter,
  completeFx,
  completeInv,
  diff1Amount,
  filterFxDeals,
  filterInvoices,
  fxPostDefaults,
  invPostDefaults,
  normalizeDealId,
  plAmount,
  postFxEntry,
  postInvDocument,
  settlementComplete,
  statusChangedToast,
  statusMeta,
  toggleRowSelection,
  toolbarVisibility,
  updateFxPartner,
  updateInvPostDate,
} from './logic.ts'

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

  it('looks up status meta and falls back to the first status', () => {
    strictEqual(statusMeta('20').text, 'Settlement Initiated')
    strictEqual(statusMeta('99').code, '01')
    strictEqual(statusChangedToast('21').startsWith('Deal ID Status changed to 21 - Settlement Complete'), true)
  })
})

describe('settlement complete check', () => {
  it('needs every FX leg and every invoice leg settled', () => {
    const fx = seedFxDeals()
    const inv = seedTradeInvoices()
    strictEqual(settlementComplete(fx, inv, false), false)
    const fxDone = fx.map((r) => ({ ...r, statusChip: 'chip-done' }))
    strictEqual(settlementComplete(fxDone, inv, false), false)
    strictEqual(settlementComplete(fxDone, inv, true), true)
    strictEqual(settlementComplete(fxDone, inv.map((r) => ({ ...r, setCo: true })), false), true)
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

describe('amend end date', () => {
  it('starts from the revised date when there is one', () => {
    const deal = seedDeal()
    strictEqual(amendDateInitial(deal), '15-03-2026')
    strictEqual(amendDateInitial({ ...deal, revisedEndDate: '01-04-2026' }), '01-04-2026')
  })

  it('rejects a blank date and stores a trimmed one as the revised date', () => {
    const deal = seedDeal()
    deepStrictEqual(applyEndDate(deal, '  '), { ok: false, error: DATE_REQUIRED })
    const ok = applyEndDate(deal, ' 01-04-2026 ')
    strictEqual(ok.ok && ok.value.revisedEndDate, '01-04-2026')
    strictEqual(ok.ok && ok.value.dealEndDate, '15-03-2026')
  })
})

describe('spot data and difference', () => {
  it('computes Diff 1 from rate, spot and amount 1', () => {
    const [d1, d2] = seedFxDeals()
    strictEqual(diff1Amount(d1 as never), '0.00')
    strictEqual(diff1Amount({ ...(d2 as object), spot: '83.0000' } as never), '4250.00')
  })

  it('saves edited spots by index and leaves the rest', () => {
    const fx = seedFxDeals()
    const next = applySpotData(fx, ['84.0000'])
    strictEqual(next[0]?.spot, '84.0000')
    strictEqual(next[1]?.spot, '83.0850')
    strictEqual(fx[0]?.spot, '83.0000')
  })
})

describe('P&L', () => {
  it('is shown on the D2 leg only, from the D2 and D1 all-in rates', () => {
    const fx = seedFxDeals()
    strictEqual(plAmount(fx, fx[0] as never), null)
    const pl = plAmount(fx, fx[1] as never)
    strictEqual(pl !== null && Math.round(pl), 425000)
    strictEqual(formatAmount(pl ?? 0), '425,000.00')
  })
})

describe('DMS', () => {
  it('needs a date, then appends a generated file name', () => {
    const docs = seedDms()
    deepStrictEqual(addDmsDocument(docs, 'Bill of Lading', ' ', 'TSF-9081'), { ok: false, error: DATE_REQUIRED })
    const ok = addDmsDocument(docs, 'SSI / Bank Letter', '05-10-2026', 'TSF-9081')
    strictEqual(ok.ok && ok.value.length, docs.length + 1)
    strictEqual(ok.ok && ok.value[docs.length]?.file, 'SSI/BankLetter-TSF-9081.pdf')
    strictEqual(ok.ok && ok.value[docs.length]?.by, 'current.user')
  })
})

describe('FX transaction posting', () => {
  it('fills the popup defaults', () => {
    const r = seedFxDeals()[0]
    const d = fxPostDefaults(r as never)
    strictEqual(d.bukrs, 'AE13')
    strictEqual(d.dealType, 'D1 - Buy/Sell leg 1')
    strictEqual(d.bAmt, '415,000,000.00 INR')
    strictEqual(d.sAmt, '5,000,000.00 USD')
    strictEqual(fxPostDefaults(seedFxDeals()[1] as never).dealType, 'D2 - Buy/Sell leg 2')
  })

  it('keeps the partner when the field is blank', () => {
    const r = seedFxDeals()[0] as never as ReturnType<typeof seedFxDeals>[number]
    strictEqual(updateFxPartner(r, '').bp, r.bp)
    strictEqual(updateFxPartner(r, 'ACME').bp, 'ACME')
  })

  it('posts once, then allows Settlement Complete', () => {
    const r = seedFxDeals()[1] as never as ReturnType<typeof seedFxDeals>[number]
    deepStrictEqual(completeFx(r), { ok: false, error: POST_FX_FIRST })
    const posted = postFxEntry(r, 1)
    strictEqual(posted.doc1, '19000101')
    strictEqual(posted.doc2, '19000201')
    strictEqual(posted.status, 'Posted')
    strictEqual(posted.statusChip, 'chip-t')
    strictEqual(postFxEntry(posted, 0).doc1, '19000101')
    const done = completeFx(posted)
    strictEqual(done.ok && done.value.status, 'Settled')
    strictEqual(done.ok && done.value.statusChip, 'chip-done')
  })
})

describe('invoice posting', () => {
  it('swaps sender and receiver for a Payment leg', () => {
    const [t1, t2] = seedTradeInvoices() as never as ReturnType<typeof seedTradeInvoices>
    const receipt = invPostDefaults(t1 as never, 'TSF-9081')
    strictEqual(receipt.sender, 'Cr OIL Trade Revenue')
    strictEqual(receipt.receiver, 'Dr DMCC Trade A/R')
    const payment = invPostDefaults(t2 as never, 'TSF-9081')
    strictEqual(payment.sender, 'Dr OAIPL Trade A/P')
    strictEqual(payment.receiver, 'Cr DMCC Trade Revenue')
    strictEqual(payment.amt, '5,010,000.00 USD')
    strictEqual(payment.docMsg, 'DMCC sells to OAIPL - T2 settlement for Deal ID TSF-9081')
  })

  it('posts a document, then completes with the due date as posting date', () => {
    const r = seedTradeInvoices()[2] as never as ReturnType<typeof seedTradeInvoices>[number]
    deepStrictEqual(completeInv(r), { ok: false, error: POST_INV_FIRST })
    const posted = postInvDocument(r, 2)
    strictEqual(posted.fiDoc, '19500302')
    strictEqual(postInvDocument(posted, 0).fiDoc, '19500302')
    const done = completeInv(posted)
    strictEqual(done.ok && done.value.setCo, true)
    strictEqual(done.ok && done.value.postDate, '20-03-2026')
    strictEqual(updateInvPostDate(r, '21-03-2026').postDate, '21-03-2026')
    const keep = completeInv({ ...posted, postDate: '21-03-2026' })
    strictEqual(keep.ok && keep.value.postDate, '21-03-2026')
  })
})

describe('letters', () => {
  it('builds the FX letter', () => {
    const r = seedFxDeals()[0] as never as ReturnType<typeof seedFxDeals>[number]
    const text = buildFxLetter(r, 'TSF-9081')
    const lines = text.split('\n')
    strictEqual(lines[0], 'RE: FX Settlement - Transaction 5000001, Deal ID TSF-9081')
    strictEqual(lines[5], 'BENEFICIARY NAME        : DMCC (Olam International DMCC)')
    strictEqual(lines[6], 'AMOUNT                  : 5,000,000.00 USD')
  })

  it('builds the trade invoice letter', () => {
    const r = seedTradeInvoices()[0] as never as ReturnType<typeof seedTradeInvoices>[number]
    const lines = buildInvoiceLetter(r, 'TSF-9081').split('\n')
    strictEqual(lines[0], 'RE: Trade Invoice Settlement - T1, Deal ID TSF-9081')
    strictEqual(lines[2], 'Please arrange to remit USD 5,000,000.00 on value date 20-03-2026')
    strictEqual(lines[lines.length - 1], 'Olam Agri India Private Limited')
  })
})
