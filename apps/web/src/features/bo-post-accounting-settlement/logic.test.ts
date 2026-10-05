import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEAL_LIBRARY, INITIAL_DOC_COUNTER } from './data.ts'
import { fiscalYear, fmtAmt, fmtMoney, fmtRate } from './format.ts'
import {
  accountingCompleted,
  allFxPosted,
  allInvPosted,
  canPostTradeInvoice,
  detailCells,
  docCounter,
  initiateSettlement,
  invoiceEntry,
  isRowDraggable,
  loadDeal,
  pendingPostAll,
  postAllConfirm,
  postFxDeal,
  postingAction,
  resolveDrop,
  statusInfo,
  toolbarState,
  txnAction,
} from './logic.ts'
import type { Deal } from './types.ts'

const fresh = (): Deal => {
  const r = loadDeal(DEAL_LIBRARY, 'tsf-9081')
  if (!r.ok) throw new Error(r.message)
  return r.deal
}
const initiated = (): Deal => initiateSettlement(fresh()).deal
const fxPosted = (): Deal => postFxDeal(initiated(), docCounter(INITIAL_DOC_COUNTER)).deal
const allPosted = (): Deal => postAllConfirm(fxPosted(), docCounter(1900020001)).deal

describe('format', () => {
  it('formats amounts, money, rate and fiscal year', () => {
    strictEqual(fmtAmt(5000000), '5,000,000.00')
    strictEqual(fmtMoney('USD', 1234.5), 'USD 1,234.50')
    strictEqual(fmtRate(83.1), '83.1000')
    strictEqual(fiscalYear('15.08.2026'), '2026')
  })
})

describe('docCounter', () => {
  it('counts up from the start as strings', () => {
    const next = docCounter(10)
    deepStrictEqual([next(), next(), next()], ['10', '11', '12'])
  })
})

describe('statusInfo', () => {
  it('maps 10/20/22 and anything beyond', () => {
    strictEqual(statusInfo(10).cls, 'st-confirmed')
    strictEqual(statusInfo(20).label, '20 · Settlement Initiated')
    strictEqual(statusInfo(22).cls, 'st-complete')
    strictEqual(statusInfo(25).cls, 'st-complete')
  })
})

describe('loadDeal', () => {
  it('requires an id', () => {
    const r = loadDeal(DEAL_LIBRARY, '   ')
    strictEqual(r.ok, false)
    if (!r.ok) strictEqual(r.message, 'Enter a Deal ID to continue.')
  })
  it('reports an unknown id in upper case', () => {
    const r = loadDeal(DEAL_LIBRARY, 'abc')
    if (r.ok) throw new Error('expected failure')
    strictEqual(r.message, "No Deal ID found for 'ABC'. Try TSF-9081.")
  })
  it('does not resolve inherited object keys', () => {
    strictEqual(loadDeal(DEAL_LIBRARY, 'constructor').ok, false)
  })
  it('trims, upper-cases and returns a private copy', () => {
    const a = loadDeal(DEAL_LIBRARY, '  tsf-9081 ')
    if (!a.ok) throw new Error('expected success')
    strictEqual(a.deal.dealId, 'TSF-9081')
    strictEqual(a.deal.status, 10)
    a.deal.top[0]!.doc1 = 'X'
    strictEqual(DEAL_LIBRARY['TSF-9081']!.top[0]!.doc1, '')
  })
})

describe('toolbarState', () => {
  it('offers only Initiate Settlement before initiation', () => {
    deepStrictEqual(toolbarState(fresh()), {
      postFxDisabled: true,
      postInvDisabled: true,
      accountingDisabled: true,
      showInitiate: true,
    })
  })
  it('enables posting once initiated and hides Initiate', () => {
    deepStrictEqual(toolbarState(initiated()), {
      postFxDisabled: false,
      postInvDisabled: false,
      accountingDisabled: false,
      showInitiate: false,
    })
  })
  it('disables Post FX Deal when every FX leg is posted', () => {
    const t = toolbarState(fxPosted())
    strictEqual(t.postFxDisabled, true)
    strictEqual(t.postInvDisabled, false)
  })
  it('disables everything but nothing else once complete', () => {
    const done = accountingCompleted(allPosted()).deal
    deepStrictEqual(toolbarState(done), {
      postFxDisabled: true,
      postInvDisabled: true,
      accountingDisabled: true,
      showInitiate: false,
    })
  })
})

describe('initiateSettlement', () => {
  it('moves 10 to 20', () => {
    const o = initiateSettlement(fresh())
    strictEqual(o.deal.status, 20)
    strictEqual(o.toast.kind, 'success')
  })
  it('refuses a second time', () => {
    const o = initiateSettlement(initiated())
    strictEqual(o.deal.status, 20)
    strictEqual(o.toast.kind, 'error')
    strictEqual(o.toast.message, 'Settlement has already been initiated for this Deal ID.')
  })
})

describe('postFxDeal', () => {
  it('refuses before initiation', () => {
    const o = postFxDeal(fresh(), docCounter(1))
    strictEqual(o.toast.message, 'Please initiate settlement before posting the FX deal.')
    strictEqual(allFxPosted(o.deal), false)
  })
  it('posts every leg with two sequential documents each', () => {
    const o = postFxDeal(initiated(), docCounter(INITIAL_DOC_COUNTER))
    deepStrictEqual(
      o.deal.top.map((r) => [r.doc1, r.doc2, r.status]),
      [
        ['1900010001', '1900010002', 'Posted'],
        ['1900010003', '1900010004', 'Posted'],
      ],
    )
    strictEqual(o.toast.message, '2 FX deal leg(s) posted to accounting.')
  })
  it('is a no-op the second time', () => {
    const o = postFxDeal(fxPosted(), docCounter(1))
    strictEqual(o.toast.message, 'All FX deal legs are already posted.')
    strictEqual(o.toast.kind, '')
  })
  it('does not mutate its input', () => {
    const d = initiated()
    postFxDeal(d, docCounter(1))
    strictEqual(d.top[0]!.doc1, '')
  })
})

describe('canPostTradeInvoice', () => {
  it('needs initiation, then posted FX legs', () => {
    const a = canPostTradeInvoice(fresh())
    strictEqual(a.allowed, false)
    if (!a.allowed) strictEqual(a.toast.message, 'Please initiate settlement before posting trade invoices.')
    const b = canPostTradeInvoice(initiated())
    strictEqual(b.allowed, false)
    if (!b.allowed) strictEqual(b.toast.kind, 'error')
    strictEqual(canPostTradeInvoice(fxPosted()).allowed, true)
  })
})

describe('accountingCompleted', () => {
  it('refuses before initiation', () => {
    strictEqual(accountingCompleted(fresh()).toast.message, 'Settlement has not been initiated yet.')
  })
  it('refuses while anything is unposted', () => {
    const o = accountingCompleted(fxPosted())
    strictEqual(o.deal.status, 20)
    strictEqual(o.toast.kind, 'error')
  })
  it('moves 20 to 22 once all documents exist', () => {
    const o = accountingCompleted(allPosted())
    strictEqual(o.deal.status, 22)
    strictEqual(o.toast.message, 'Deal ID TSF-9081 marked Accounting Complete.')
  })
})

describe('txnAction (FX leg popup)', () => {
  it('test run and update leave the deal untouched and the popup open', () => {
    const d = initiated()
    const t = txnAction(d, 0, 'TEST', docCounter(1))
    strictEqual(t.deal, d)
    strictEqual(t.close, false)
    strictEqual(t.toast.message, 'Test run completed for transaction 5000011041. No documents were posted.')
    const u = txnAction(d, 1, 'UPD', docCounter(1))
    strictEqual(u.deal, d)
    strictEqual(u.toast.message, 'Bank and transfer details updated for transaction 5000011042.')
  })
  it('posts only the chosen leg and closes', () => {
    const o = txnAction(initiated(), 1, 'TBB1', docCounter(INITIAL_DOC_COUNTER))
    strictEqual(o.close, true)
    strictEqual(o.deal.top[0]!.doc1, '')
    strictEqual(o.deal.top[1]!.doc1, '1900010001')
    strictEqual(o.deal.top[1]!.doc2, '1900010002')
    strictEqual(o.deal.top[1]!.status, 'Posted')
  })
  it('refuses a leg that is already posted', () => {
    const o = txnAction(fxPosted(), 0, 'TBB1', docCounter(1))
    strictEqual(o.toast.message, 'This transaction is already posted.')
    strictEqual(o.close, false)
  })
})

describe('postingAction (invoice leg popup)', () => {
  it('Update only reports', () => {
    const d = fxPosted()
    const o = postingAction(d, 0, 'UPD_DATA', docCounter(1))
    strictEqual(o.deal, d)
    strictEqual(o.toast.message, 'Bank settlement data updated for T1 · OIL → DMCC.')
  })
  it('Settlement Complete ticks Settle and keeps the popup open', () => {
    const o = postingAction(fxPosted(), 2, 'SET_EXE', docCounter(1))
    strictEqual(o.deal.inv[2]!.setCheck, true)
    strictEqual(o.deal.inv[0]!.setCheck, false)
    strictEqual(o.close, false)
  })
  it('Post Document assigns a document and closes', () => {
    const o = postingAction(fxPosted(), 0, 'SET_POST', docCounter(77))
    strictEqual(o.deal.inv[0]!.fiDoc, '77')
    strictEqual(o.close, true)
    strictEqual(o.toast.kind, 'success')
  })
  it('refuses to post a leg twice', () => {
    const once = postingAction(fxPosted(), 0, 'SET_POST', docCounter(77)).deal
    const o = postingAction(once, 0, 'SET_POST', docCounter(88))
    strictEqual(o.toast.message, 'This invoice leg is already posted.')
    strictEqual(o.deal.inv[0]!.fiDoc, '77')
  })
})

describe('Posting All', () => {
  it('lists unposted legs that are checked for FI posting', () => {
    const d = fxPosted()
    strictEqual(pendingPostAll(d).length, 3)
    const one = postingAction(d, 1, 'SET_POST', docCounter(5)).deal
    deepStrictEqual(
      pendingPostAll(one).map((r) => r.tType),
      ['T1S', 'T3S'],
    )
    const unchecked: Deal = { ...d, inv: d.inv.map((r, i) => (i === 0 ? { ...r, postCheck: false } : r)) }
    strictEqual(pendingPostAll(unchecked).length, 2)
  })
  it('posts each pending leg with the next document number', () => {
    const o = postAllConfirm(fxPosted(), docCounter(300))
    deepStrictEqual(
      o.deal.inv.map((r) => r.fiDoc),
      ['300', '301', '302'],
    )
    strictEqual(o.toast.message, '3 trade invoice document(s) posted successfully.')
    strictEqual(allInvPosted(o.deal), true)
    strictEqual(pendingPostAll(o.deal).length, 0)
  })
})

describe('isRowDraggable', () => {
  it('only unposted rows while settlement is open (20, not 22)', () => {
    strictEqual(isRowDraggable(fresh(), false), false)
    strictEqual(isRowDraggable(initiated(), false), true)
    strictEqual(isRowDraggable(initiated(), true), false)
    strictEqual(isRowDraggable({ ...initiated(), status: 22 }, false), false)
  })
})

describe('resolveDrop', () => {
  it('ignores a drop with nothing being dragged', () => {
    deepStrictEqual(resolveDrop('fx', null), { run: 'none' })
  })
  it('runs the action matching the row kind', () => {
    deepStrictEqual(resolveDrop('fx', 'fx'), { run: 'fx' })
    deepStrictEqual(resolveDrop('inv', 'inv'), { run: 'inv' })
  })
  it('rejects the wrong kind of row', () => {
    deepStrictEqual(resolveDrop('fx', 'inv'), { run: 'error', message: 'This action requires an FX deal row.' })
    deepStrictEqual(resolveDrop('inv', 'fx'), {
      run: 'error',
      message: 'This action requires a trade invoice row.',
    })
  })
})

describe('content helpers', () => {
  it('builds the header cells', () => {
    const cells = detailCells(fresh())
    strictEqual(cells.length, 14)
    deepStrictEqual(cells[13], { label: 'Trader', value: 'T01 · J. Fernandes', cls: '' })
  })
  it('builds the invoice entry with the invoice currency', () => {
    deepStrictEqual(invoiceEntry(fresh().inv[0]!), [
      { dc: 'Debit', account: 'OIL · Trade Receivable', amount: 'USD 5,000,000.00' },
      { dc: 'Credit', account: 'DMCC · Trade Revenue', amount: 'USD 5,000,000.00' },
    ])
  })
})
