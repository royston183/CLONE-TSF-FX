import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ACTION_WAITING, INVOICE_WAITING, LEGS_STILL_WAITING, gateOutcome, legsWaitingReason, loadLegs, normalizeDealId, toDeal, toLeg } from './api.ts'
import { DEAL_LIBRARY, INITIAL_DOC_COUNTER } from './fixtures.ts'
import { fiscalYear, fmtAmt, fmtMoney, fmtRate } from './format.ts'
import {
  NOT_INITIATED,
  NO_SETTLEMENT_HERE,
  accountingCompleted,
  accountingRefusal,
  allFxPosted,
  allInvPosted,
  canPostTradeInvoice,
  detailCells,
  docCounter,
  initiateSettlement,
  invoiceEntry,
  isRowDraggable,
  pendingPostAll,
  postAllConfirm,
  postFxDeal,
  fxPostingPlan,
  invPostingPlan,
  postingAction,
  postingPlanToast,
  resolveDrop,
  statusInfo,
  toolbarState,
  txnAction,
} from './logic.ts'
import type { Deal } from './types.ts'

const fresh = (): Deal => structuredClone(DEAL_LIBRARY['TSF-9081']!)
const initiated = (): Deal => initiateSettlement(fresh()).deal
/** Every leg settled on MO (ZSGTSFR060), which BO posting needs first. */
const settled = (d: Deal): Deal => ({ ...d, top: d.top.map((r) => ({ ...r, settled: true })), inv: d.inv.map((r) => ({ ...r, setCheck: true })) })
/** Execution complete (21) with every transaction at TXN_STATUS 07, which BO's FX and invoice posting need. */
const executed = (): Deal => {
  const d = settled(initiated())
  return { ...d, status: 21, statusCode: '21', top: d.top.map((r) => ({ ...r, txnStatus: '07' })) }
}
/** All six trade legs settled on MO (ZEXE_CO). */
const sixDone = (d: Deal): Deal => ({ ...d, inv: [...d.inv, ...d.inv].slice(0, 6).map((r) => ({ ...r, exeCo: true })) })
const fxPosted = (): Deal => postFxDeal(settled(initiated()), docCounter(INITIAL_DOC_COUNTER)).deal
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
  it('colours by 20 / 22 and labels with the ZSGTSFTR_DEAL_ST text', () => {
    strictEqual(statusInfo(2, '02', 'MO: FX Deals & MC Assignment Confirmed').cls, 'st-confirmed')
    strictEqual(statusInfo(20, '20', 'Settlement Initiated').label, '20 · Settlement Initiated')
    strictEqual(statusInfo(22, '22', 'Settlement Completed - Accounting').cls, 'st-complete')
    strictEqual(statusInfo(30, '30', '').label, '30')
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

describe('canPostTradeInvoice (POST_TI)', () => {
  it('needs status 20, then six execution-complete trade legs (I054), with no FX-posted condition', () => {
    const a = canPostTradeInvoice(fresh())
    strictEqual(a.allowed, false)
    if (!a.allowed) strictEqual(a.toast.message, NOT_INITIATED)
    const b = canPostTradeInvoice(initiated())
    ok(!b.allowed && b.toast.message.includes('I054'))
    strictEqual(canPostTradeInvoice(sixDone(initiated())).allowed, true)
  })
})

describe('accountingCompleted (ACC)', () => {
  it('has no status condition, but refuses while an FI-posting leg has no document (I066)', () => {
    const o = accountingCompleted(fresh())
    strictEqual(o.deal.status, fresh().status)
    ok(o.toast.message.includes('I066'))
  })
  it('then needs Doc No 1 on the FX deals the legs map to (I067)', () => {
    const d = postAllConfirm(initiated(), docCounter(300)).deal
    const mapped: Deal = { ...d, inv: d.inv.map((r) => ({ ...r, dMap: d.top[0]!.dealType })) }
    ok(accountingCompleted(mapped).toast.message.includes('I067'))
    strictEqual(accountingCompleted(postFxDeal(mapped, docCounter(1)).deal).deal.status, 22)
  })
  it('moves to 22 once all documents exist', () => {
    const o = accountingCompleted(allPosted())
    strictEqual(o.deal.status, 22)
    strictEqual(o.toast.message, 'Deal ID TSF-9081 marked Accounting Complete.')
  })
  it('a no-invoice model checks the sequenced FX legs only', () => {
    const d: Deal = { ...initiated(), noInvoice: true, top: initiated().top.map((r) => ({ ...r, seq: '6' })) }
    ok(accountingRefusal(d).includes('I067'))
    strictEqual(accountingRefusal(postFxDeal(d, docCounter(1)).deal), '')
  })
})

describe('txnAction (FX leg popup)', () => {
  it('update leaves the deal untouched and the popup open', () => {
    const d = initiated()
    const u = txnAction(d, 1, 'UPD', docCounter(1))
    strictEqual(u.deal, d)
    strictEqual(u.toast.message, 'Bank and transfer details updated for transaction 5000011042.')
  })
  it('test run and post need status 21 (I071) and the transaction at 07 (I072)', () => {
    ok(txnAction(initiated(), 0, 'TEST', docCounter(1)).toast.message.includes('I071'))
    const early: Deal = { ...executed(), top: executed().top.map((r) => ({ ...r, txnStatus: '03' })) }
    ok(txnAction(early, 0, 'TBB1', docCounter(1)).toast.message.includes('I072'))
    const t = txnAction(executed(), 0, 'TEST', docCounter(1))
    strictEqual(t.toast.message, 'Test run completed for transaction 5000011041. No documents were posted.')
    strictEqual(t.close, false)
  })
  it('posts only the chosen leg and closes', () => {
    const o = txnAction(executed(), 1, 'TBB1', docCounter(INITIAL_DOC_COUNTER))
    strictEqual(o.close, true)
    strictEqual(o.deal.top[0]!.doc1, '')
    strictEqual(o.deal.top[1]!.doc1, '1900010001')
    strictEqual(o.deal.top[1]!.doc2, '1900010002')
    strictEqual(o.deal.top[1]!.status, 'Posted')
  })
  it('refuses a leg that is already posted', () => {
    const d = postFxDeal(executed(), docCounter(1)).deal
    const o = txnAction(d, 0, 'TBB1', docCounter(1))
    strictEqual(o.toast.message, 'This transaction is already posted.')
    strictEqual(o.close, false)
  })
})

describe('postingAction (invoice leg popup)', () => {
  it('Update and Post need status 21 (I070)', () => {
    ok(postingAction(initiated(), 0, 'UPD_DATA', docCounter(1)).toast.message.includes('I070'))
    ok(postingAction(initiated(), 0, 'SET_POST', docCounter(1)).toast.message.includes('I070'))
    const o = postingAction(executed(), 0, 'UPD_DATA', docCounter(1))
    strictEqual(o.toast.message, 'Bank settlement data updated for T1 · OIL → DMCC.')
  })
  it('Settlement Complete has no function in this program', () => {
    const d = initiated()
    const o = postingAction(d, 2, 'SET_EXE', docCounter(1))
    strictEqual(o.deal, d)
    strictEqual(o.toast.message, NO_SETTLEMENT_HERE)
  })
  it('Post Document assigns a document and closes', () => {
    const o = postingAction(executed(), 0, 'SET_POST', docCounter(77))
    strictEqual(o.deal.inv[0]!.fiDoc, '77')
    strictEqual(o.close, true)
    strictEqual(o.toast.kind, 'success')
  })
  it('refuses a leg not flagged for FI posting, and a leg already posted', () => {
    const d = executed()
    const noFi: Deal = { ...d, inv: d.inv.map((r, i) => (i === 0 ? { ...r, postCheck: false } : r)) }
    strictEqual(postingAction(noFi, 0, 'SET_POST', docCounter(1)).deal.inv[0]!.fiDoc, '')
    const once = postingAction(d, 0, 'SET_POST', docCounter(77)).deal
    const o = postingAction(once, 0, 'SET_POST', docCounter(88))
    strictEqual(o.toast.message, 'This invoice leg is already posted.')
    strictEqual(o.deal.inv[0]!.fiDoc, '77')
  })
})

describe('Posting All (P_ALL)', () => {
  it('lists the legs flagged for FI posting that have no document', () => {
    const d = executed()
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
    const o = postAllConfirm(executed(), docCounter(300))
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

describe('api (SAP header by key, legs and actions waiting)', () => {
  it('maps ZSGTSFTR_DEALID + MAS_CON + DEAL_ST + TRADER rows, as served on 2026-10-06', () => {
    const d = toDeal({
      deal: { ZDEAL_ID: '7000000019', ZSUB_TYPE: 'FX1', ZDEAL_REF: '', ZS_DATE: '2026-10-05', ZE_DATE: '2026-11-07', ZMC_REF: '2000000032', ZTRD_CODE: 'C', ZTSF_MODEL: 'M033', ZDEAL_STAT: '01', ZDEAL_CURR_DESC: 'INR-INR-INR', ZFX_INV_MODEL: '' },
      mc: { ZMC_REF_NO: '2000000032', ZMC_DESC: 'FX BLOTTER TEST - RICE M033 (OGA/OGA)', ZMC_DATE: '2026-10-01', ZSHIP_END: '2027-02-28', ZENT_DESC: 'OGA-OSIPL-DMCC', ZMOD_ID: 'M033', ZMOD_DESC: 'INR-INR-INR Forward' },
      trader: { ZTCODE: 'C', ZTRADER: 'Nidhi S' },
      statuses: [{ ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: Option Deals Created' }, { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' }],
      legsReason: 'L',
    })
    deepStrictEqual(
      [d.dealId, d.dealStartDate, d.dealEndDate, d.mcRefNo, d.mcDate, d.shipEndDate, d.fxModelId, d.modelDesc, d.entityString, d.currencyString, d.traderCode, d.traderDesc, d.status, d.statusCode, d.statusText],
      ['7000000019', '05.10.2026', '07.11.2026', '2000000032', '01.10.2026', '28.02.2027', 'M033', 'INR-INR-INR Forward', 'OGA-OSIPL-DMCC', 'INR-INR-INR', 'C', 'Nidhi S', 1, '01', 'FO: FX Deals Created'],
    )
    deepStrictEqual([d.top, d.inv, d.fxWaiting, d.invWaiting], [[], [], 'L', INVOICE_WAITING])
  })
  it('falls back to ZTSF_MODEL without an MC', () => {
    const d = toDeal({ deal: { ZDEAL_ID: '1', ZTSF_MODEL: 'M021', ZDEAL_STAT: '20' }, mc: undefined, trader: undefined, statuses: [], legsReason: '' })
    deepStrictEqual([d.fxModelId, d.modelDesc, d.mcDesc, d.status, d.statusText], ['M021', '', '', 20, ''])
  })
  it('normalises the typed Deal ID', () => strictEqual(normalizeDealId('  tsf-9081 '), 'TSF-9081'))
  it('maps a TrmFxApp row joined to its FxTransaction as an FX leg; documents and DSS deal have no source', () => {
    const fx = { CompanyCode: 'SG03', FinancialTransaction: '3000000000005', ProductType: '12B', TransactionType: '619', Partner: '4', BuyCurrency: 'USD', SellCurrency: 'INR', BuyAmount: '1000', SellAmount: '-83000', ForwardRate: '83' }
    const app = { CompanyCode: 'SG03', FinancialTransaction: '3000000000005', ZtsfDealType: 'D1' }
    const { seq, settled, txnStatus, tradeDate, valueDate, txnType, partner, spot, swap, profitCenter, busArea, ndfRate, cashAmt, cashCurr, ...core } = toLeg({ fx, app })
    deepStrictEqual([seq, settled, txnStatus, txnType, partner], ['', false, '', '619', '4'])
    deepStrictEqual(core, {
      entity: 'SG03', dealType: 'D1', rfha: '3000000000005', buyCurr: 'USD', buyAmt: 1000, sellCurr: 'INR', sellAmt: 83000, rate: 83,
      status: 'Confirmed', doc1: '', doc2: '', dssDeal: '', sgsart: '12B',
    })
  })
  it('reads the legs by ZtsfDealID and joins them on company code + transaction', async () => {
    const realFetch = globalThis.fetch
    const urls: string[] = []
    const fx = (n: string) => ({ CompanyCode: 'SG03', FinancialTransaction: n, ProductType: '12B', TransactionType: '619', Partner: '4', BuyCurrency: 'USD', SellCurrency: 'INR', BuyAmount: 1, SellAmount: 83, ForwardRate: 83 })
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = decodeURIComponent(String(input).replaceAll('+', ' '))
      urls.push(u)
      const body = u.includes('/api/trmfxapp/')
        ? { value: [{ CompanyCode: 'SG03', FinancialTransaction: '2', ZtsfDealType: 'D2' }, { CompanyCode: 'SG03', FinancialTransaction: '1', ZtsfDealType: 'D1' }] }
        : { value: [fx('1'), fx('2')] }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    try {
      const legs = await loadLegs('7000000014')
      deepStrictEqual(legs.map((l) => [l.dealType, l.rfha]), [['D1', '1'], ['D2', '2']])
      ok(urls[0]?.includes("ZtsfDealID eq '7000000014'"))
    } finally {
      globalThis.fetch = realFetch
    }
  })
  it('narrows the waiting note to the option legs and the FI documents', () => {
    strictEqual(legsWaitingReason(), LEGS_STILL_WAITING)
    ok(LEGS_STILL_WAITING.includes('ZSGTSFCDS_OPTION') && LEGS_STILL_WAITING.includes('BKPF') && !LEGS_STILL_WAITING.includes('tsfvFx'))
    ok(legsWaitingReason('', 0).startsWith('No FX deal legs for this Deal ID in ZSGTSFTR_APP_STR.'))
    ok(legsWaitingReason('boom', 0).includes('could not be read: boom'))
  })
  it('an action that would change the deal waits; a refusal keeps its message', () => {
    const d = fresh()
    deepStrictEqual(gateOutcome(d, initiateSettlement(d), ACTION_WAITING.initiate), { message: ACTION_WAITING.initiate, kind: 'error' })
    const refused = postFxDeal(d, docCounter(1))
    deepStrictEqual(gateOutcome(d, refused, ACTION_WAITING.postFx), refused.toast)
    strictEqual(ACTION_WAITING.invPost, 'WAITING FOR ACTION API — Post Document (BAPI_ACC_DOCUMENT_POST, BAPI_TRANSACTION_COMMIT / _ROLLBACK, UPDATE ZSGTSFTR_TRD_POS) has no API yet. Nothing was posted to SAP.')
  })
})

describe('posting plans', () => {
  it('Post FX Deal takes every sequenced FX leg, and one not execution-complete stops the run (I054)', () => {
    const d = initiated()
    const seq: Deal = { ...d, top: d.top.map((r, i) => ({ ...r, seq: '6', settled: i === 0 })) }
    const plan = fxPostingPlan(seq)
    deepStrictEqual(plan.eligible, d.top.map((r) => `${r.dealType} ${r.rfha}`))
    deepStrictEqual(plan.blocking, [`${d.top[1]!.dealType} ${d.top[1]!.rfha}`])
    const t = postingPlanToast('FX deal', plan, 'WAITING')
    strictEqual(t.kind, 'error')
    ok(t.message.includes('I054'))
    const ready = postingPlanToast('FX deal', fxPostingPlan({ ...seq, top: seq.top.map((r) => ({ ...r, settled: true })) }), 'WAITING')
    ok(ready.message.startsWith('WAITING To be posted:'))
  })

  it('leaves out FX legs outside the model sequence', () => {
    strictEqual(fxPostingPlan(initiated()).eligible.length, 0)
  })

  it('Post Trade Invoice waits for all six trade legs, then takes the FI-posting legs', () => {
    ok(postingPlanToast('trade invoice', invPostingPlan(initiated()), 'WAITING').message.includes('I054'))
    const d = sixDone(initiated())
    const noFi: Deal = { ...d, inv: d.inv.map((r, i) => (i === 0 ? { ...r, postCheck: false } : r)) }
    strictEqual(invPostingPlan(noFi).eligible.length, d.inv.length - 1)
    deepStrictEqual(postingPlanToast('trade invoice', invPostingPlan(postAllConfirm(d, docCounter(1)).deal), 'W'), {
      message: 'All trade invoice legs are already posted.',
      kind: '',
    })
  })
})
