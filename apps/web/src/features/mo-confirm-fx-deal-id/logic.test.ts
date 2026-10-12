import { deepStrictEqual, ok, rejects, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { FxRow } from '../../shared/fx/mw.ts'
import { applyStatusTexts, cancelDeal, loadDeal, loadDealIndex, storedPl, toLeg, toScreenDeal } from './api.ts'
import { GAPS, STATUS_META } from './data.ts'
import { fmtAmt } from './format.ts'
import {
  actionVisibility,
  legNote,
  legRowClass,
  nextSort,
  numStatus,
  quickPickLabel,
  resolveDealId,
  sortedFilteredLegs,
  statusMeta,
  storedPlRows,
  toggleLeg,
} from './logic.ts'
import type { Deal, Leg } from './types.ts'

const leg = (over: Partial<Leg> = {}): Leg => ({
  rfha: '3000000000015',
  bukrs: '1000',
  dealType: 'D1',
  bpName: 'DBS BANK LTD',
  bpCode: '400000002',
  dealDate: '30-09-2026',
  valueDate: '30-10-2026',
  desc: '631 - NDF-TSF',
  bs1: 'Buy',
  curr1: 'USD',
  amt1: 1000,
  bs2: 'Sell',
  curr2: 'INR',
  amt2: -83000,
  rateVal: 83,
  rateLabel: 'All-in Rate',
  txnStatus: '01',
  fxPl: null,
  ...over,
})

const deal = (over: Partial<Deal> = {}): Deal => ({
  dealId: '7000000007',
  dealDesc: 'OSIPL Forward',
  trader: 'C',
  traderName: 'Nidhi S',
  startDate: '28-09-2026',
  endDate: '05-11-2026',
  fxModel: 'M033',
  modelDesc: 'INR-INR-INR Forward',
  entityString: 'OGA-DMCC-OSIPL',
  currString: 'USD-USD-INR',
  mcRef: '2000000028',
  mcDesc: 'OSIPL_RICE',
  mcDate: '22-08-2026',
  shipStart: '01-09-2026',
  shipEnd: '31-10-2026',
  bukrs: 'SG03',
  status: '01',
  subType: 'FX1',
  noInv: false,
  ssDeal: false,
  confirmed: false,
  storedPl: null,
  legs: [leg()],
  invoices: [],
  ...over,
})

describe('status and actions', () => {
  it('reads a status code as a number and falls back for an unknown one', () => {
    strictEqual(numStatus('07'), 7)
    strictEqual(numStatus('x'), 0)
    strictEqual(statusMeta('99').desc, '99')
    strictEqual(statusMeta('01').cls, 'status-01')
  })

  it('shows the actions the ABAP PF-STATUS leaves in for each status', () => {
    deepStrictEqual(actionVisibility(deal({ status: '01' })), { upd: true, can: true, dealEdit: true, rev: false, pre: true, ref: true, dms: true, ssDeal: false })
    const confirmed = actionVisibility(deal({ status: '02' }))
    ok(!confirmed.upd && !confirmed.can && !confirmed.dealEdit && confirmed.rev)
    ok(actionVisibility(deal({ status: '03' })).rev)
    ok(!actionVisibility(deal({ status: '30' })).rev)
    ok(actionVisibility(deal({ ssDeal: true })).ssDeal)
  })

  it('words every disabled control with the blocker found in the ABAP, not a placeholder', () => {
    for (const [key, text] of Object.entries(GAPS)) ok(text.length > 40, key)
    ok(GAPS.premium.includes('RBI'))
  })
})

describe('inputs', () => {
  it('trims the typed Deal ID and leaves existence to SAP', () => {
    deepStrictEqual(resolveDealId('  7000000007 '), { ok: true, id: '7000000007' })
    deepStrictEqual(resolveDealId('  '), { ok: false, error: 'Enter a Deal ID.' })
  })

  it('labels a quick pick with the status text', () => {
    strictEqual(quickPickLabel({ dealId: '7000000007', status: '01' }), '7000000007 · Created')
  })

  it('replaces the status texts with ZSGTSFTR_DEAL_ST for the deal\'s sub type, keeping the colours', () => {
    const before = STATUS_META['02']
    applyStatusTexts(
      [
        { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '02', ZDEAL_SDESC: 'MO Confirmed (SAP)' },
        { ZSUB_TYPE: 'FX2', ZDEAL_STAT: '02', ZDEAL_SDESC: 'Option text' },
      ],
      'FX1',
    )
    strictEqual(statusMeta('02').desc, 'MO Confirmed (SAP)')
    strictEqual(statusMeta('02').cls, before?.cls)
  })
})

describe('legs', () => {
  const a = leg({ rfha: '1', amt1: 500, rateVal: 80 })
  const b = leg({ rfha: '2', amt1: 100, rateVal: null })

  it('searches the leg text', () => {
    deepStrictEqual(sortedFilteredLegs([a, b], 'zzz', { key: null, dir: 1 }), [])
    strictEqual(sortedFilteredLegs([a, b], 'dbs', { key: null, dir: 1 }).length, 2)
  })

  it('sorts numbers and puts a missing rate first', () => {
    deepStrictEqual(sortedFilteredLegs([a, b], '', { key: 'amt1', dir: 1 }).map((l) => l.rfha), ['2', '1'])
    deepStrictEqual(sortedFilteredLegs([a, b], '', { key: 'rateVal', dir: 1 }).map((l) => l.rfha), ['2', '1'])
    deepStrictEqual(sortedFilteredLegs([a, b], '', { key: 'fxPl', dir: -1 }).map((l) => l.rfha), ['1', '2'])
    deepStrictEqual(nextSort({ key: 'amt1', dir: 1 }, 'amt1'), { key: 'amt1', dir: -1 })
    deepStrictEqual(nextSort({ key: 'amt1', dir: 1 }, 'rfha'), { key: 'rfha', dir: 1 })
  })

  it('selects and deselects a leg', () => {
    strictEqual(toggleLeg(null, '1'), '1')
    strictEqual(toggleLeg('1', '1'), null)
    strictEqual(legNote('1'), 'Leg 1 selected')
    strictEqual(legRowClass(a, true), 'row-selected')
    strictEqual(legRowClass(leg({ txnStatus: '02' }), false), 'row-pending')
  })

  it('shows a leg without an all-in rate or FX P&L as a dash, never as zero', () => {
    const l = toLeg({
      color: '', premCurr: '', bukrs: 'SG03', dealType: 'D1', bpName: 'X', kontrh: '4', rfha: '9', sfhaart: 't', dblfz: '', delfz: '', xtext: 't', entity: '',
      bs1: 'Buy', curr1: 'USD', amt1: 1, bs2: 'Sell', curr2: 'INR', amt2: -83, ospot: 0, oswap: 0, otot_rate: '', strike: '', mcRefNo: '', txnStatus: '01',
    })
    strictEqual(l.rateVal, null)
    strictEqual(l.fxPl, null)
    strictEqual(fmtAmt(l.fxPl), '-')
  })
})

describe('stored P&L', () => {
  it('is empty until the deal was confirmed', () => {
    strictEqual(storedPl({ ZPL: '0.00', ZPL_LAMT: '0.00' }), null)
    deepStrictEqual(storedPlRows(deal()), [])
  })

  it('reads what confirmation stored on the Deal ID', () => {
    const pl = storedPl({ ZPL: '1250.50', ZPL_CURR: 'USD', ZPL_LAMT: '104000.25', ZPL_LCURR: 'INR', ZPL_RATE: '83.2' })
    deepStrictEqual(pl, { amount: 1250.5, currency: 'USD', localAmount: 104000.25, localCurrency: 'INR', rate: 83.2 })
    const rows = storedPlRows(deal({ storedPl: pl }))
    deepStrictEqual(rows.map((r) => r.type), ['P&L (USD)', 'P&L Local (INR)', 'P&L Rate'])
    strictEqual(rows[0]?.value, '1,250.50')
  })
})

describe('toScreenDeal', () => {
  const row: FxRow = { ZDEAL_ID: '7000000007', ZDEAL_DESC: 'OSIPL Forward', ZCONFIRM: 'X', ZPL: '10', ZPL_CURR: 'USD', ZPL_LAMT: '830', ZPL_LCURR: 'INR', ZPL_RATE: '83' }
  const joined = {
    dealId: '7000000007', dealRef: 'ref', status: '02', sDate: '28-09-2026', eDate: '05-11-2026', trdCode: 'C', trdDesc: 'Nidhi S',
    mcRef: '2000000028', mcDesc: 'OSIPL_RICE', mcDate: '22-08-2026', shipStart: '', shipEnd: '', modId: 'M033', modDesc: 'Fwd', entStr: 'E', currStr: 'USD-USD-INR',
    top: [], inv: [{ zttype: 'T1', sell: '', buy: '', curr: 'USD', trmNo: '12', amt: 1000, exRate: 83, invAmt: 83000 }],
  }

  it('takes the model flags from RULE_BT and the confirmed state from ZCONFIRM', () => {
    const d = toScreenDeal(row, joined, { ZMOD_ID: 'M033', ZNO_INV: 'X', ZSS: 'X', ZSUB_TYPE: 'FX2' })
    ok(d.noInv && d.ssDeal && d.confirmed)
    strictEqual(d.subType, 'FX2')
    strictEqual(d.storedPl?.localAmount, 830)
    deepStrictEqual(d.invoices, [{ tradeRef: '12', invType: 'T1', exRate: 83, amt: 1000, invAmt: 83000, curr: 'USD' }])
  })

  it('treats a missing model as a forward with an invoice plan', () => {
    const d = toScreenDeal({ ZDEAL_ID: '7000000007' }, joined, undefined)
    ok(!d.noInv && !d.ssDeal && !d.confirmed)
    strictEqual(d.subType, 'FX1')
  })
})

describe('SAP calls', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  type Call = { method: string; url: string; body: { key?: Record<string, string>; changes?: Record<string, string> } | null }
  const DEAL: FxRow = {
    ZDEAL_ID: '7000000007', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZMC_REF: '2000000028', ZTSF_MODEL: 'M033', ZTRD_CODE: 'C',
    ZS_DATE: '2026-09-28', ZE_DATE: '2026-11-05', ZBUKRS1: 'SG03', ZRFHA1: '3000000000015', ZCONFIRM: '',
  }
  const install = (calls: Call[], opts: { patchFails?: boolean; noDeal?: boolean; invFails?: boolean; noApp?: boolean } = {}) => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input).replaceAll('+', ' '))
      const method = init?.method ?? 'GET'
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (url.startsWith('/auth/me')) return json(200, { user: { username: 'demo' } })
      if (url.includes('/data/tsfDealId')) {
        if (method === 'PATCH') return opts.patchFails ? json(409, { error: { message: 'locked by another user' } }) : json(200, { ok: true })
        return json(200, { ok: true, rows: opts.noDeal ? [] : [DEAL] })
      }
      if (url.includes('/data/masterContract')) return json(200, { ok: true, rows: [{ ZMC_REF_NO: '2000000028', ZMC_DESC: 'OSIPL_RICE', ZMOD_ID: 'M033', ZENT_DESC: 'E', ZCURR_DESC: 'USD-USD-INR' }] })
      if (url.includes('/data/trmTrader')) return json(200, { ok: true, rows: [{ ZTCODE: 'C', ZTRADER: 'Nidhi S' }] })
      if (url.includes('/data/tsfDealStatus')) return json(200, { ok: true, rows: [{ ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' }] })
      if (url.includes('/data/invRef')) return opts.invFails ? json(500, { error: { message: 'down' } }) : json(200, { ok: true, rows: [{ ZDEAL_ID: '7000000007', ZTTYPE: 'T1', ZINV_TRM_NO: '55', ZAMT: '1000', ZEX_RATE: '83', ZINV_AMT: '83000', ZTRD_CURR: 'USD' }] })
      if (url.includes('/data/fxModel')) return json(200, { ok: true, rows: [{ ZMOD_ID: 'M033', ZSUB_TYPE: 'FX1', ZNO_INV: '', ZSS: '', ZMOD_DESC: 'INR-INR-INR Forward' }] })
      if (url.includes('/data/tsfvFx')) return json(200, { ok: true, rows: [] })
      if (url.includes('/data/comp')) return json(200, { ok: true, rows: [{ ZBUKRS: 'SG03', ZCOM_ID: 'OSIPL', ZBUTXT: 'Olam' }] })
      if (url.includes('/trmfxapp/')) return json(200, { value: opts.noApp ? [] : [{ CompanyCode: 'SG03', FinancialTransaction: '3000000000015', TxnStatus: '07' }] })
      if (url.includes('/FxTransaction'))
        return json(200, { value: [{ CompanyCode: 'SG03', FinancialTransaction: '3000000000015', ProductType: '12D', TransactionType: '631', Partner: '400000002', ContractDate: '2026-09-30', ValueDate: '2026-10-30', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyAmount: 1000, SellAmount: 83000, ForwardRate: 83, ActivityCategory: '30', ActiveStatus: '0' }] })
      return json(200, { value: [], d: { results: [] } })
    }) as typeof fetch
  }

  it('lists the FX Deal IDs with their status', async () => {
    install([])
    deepStrictEqual(await loadDealIndex(), [{ dealId: '7000000007', status: '01', fxModel: 'M033', entityString: 'E' }])
  })

  it('loads a Deal ID with its contract, trader, model, saved invoices and live transaction', async () => {
    const calls: Call[] = []
    install(calls)
    const loaded = await loadDeal('7000000007')
    ok(loaded)
    const d = loaded.deal
    strictEqual(d.mcDesc, 'OSIPL_RICE')
    strictEqual(d.traderName, 'Nidhi S')
    strictEqual(d.fxModel, 'M033')
    strictEqual(d.legs.length, 1)
    strictEqual(d.legs[0]?.rfha, '3000000000015')
    strictEqual(d.legs[0]?.dealType, 'D1')
    // The leg's status is ZSGTSFTR_APP_STR.TXN_STATUS (BUKRS + RFHA), not the FX service's settled / open stand-in (which would say 03).
    strictEqual(d.legs[0]?.txnStatus, '07')
    strictEqual(d.legs[0]?.bukrs, 'SG03')
    strictEqual(d.invoices[0]?.tradeRef, '55')
    strictEqual(statusMeta('01').desc, 'FO: FX Deals Created')
    ok(calls.some((c) => c.url.includes('/data/tsfDealId') && c.url.includes('ZDEAL_ID=7000000007')))
  })

  it('shows no transaction status for a leg APP_STR has no record of, instead of guessing one', async () => {
    install([], { noApp: true })
    strictEqual((await loadDeal('7000000007'))?.deal.legs[0]?.txnStatus, '')
  })

  it('answers null for a Deal ID SAP does not have', async () => {
    install([], { noDeal: true })
    strictEqual(await loadDeal('1'), null)
  })

  it('fails the load rather than showing "no invoices" when the invoice plan cannot be read', async () => {
    install([], { invFails: true })
    await rejects(() => loadDeal('7000000007'))
  })

  it('cancels with ZDEAL_STAT = 30 and the changed-by stamp, keyed by the Deal ID', async () => {
    const calls: Call[] = []
    install(calls)
    await cancelDeal(DEAL)
    const patch = calls.find((c) => c.method === 'PATCH')
    ok(patch)
    deepStrictEqual(patch.body?.key, { ZDEAL_ID: '7000000007', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1' })
    strictEqual(patch.body?.changes?.['ZDEAL_STAT'], '30')
    strictEqual(patch.body?.changes?.['ZCHANGED_BY'], 'DEMO')
  })

  it('surfaces a refused cancellation with the middleware\'s reason', async () => {
    install([], { patchFails: true })
    await rejects(() => cancelDeal(DEAL), /locked by another user/)
  })
})
