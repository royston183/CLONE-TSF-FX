import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  ACTION_WAITING,
  INVOICE_WAITING,
  OPTION_LEGS_WAITING,
  legsUnavailable,
  legsWaitingReason,
  loadFxLegs,
  statusList,
  toDeal,
  toFxDeal,
  toPick,
} from './api.ts'

// ZSGTSFTR_DEAL_ST as served on 2026-10-05 (a subset).
const STATUSES = [
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '20', ZDEAL_SDESC: 'Settlement Initiated' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'duplicate' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: Option Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '14', ZDEAL_SDESC: 'Options Exercised / Expired' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '', ZDEAL_SDESC: 'blank' },
]

// Deal 7000000006, its MC 2000000005, model M032 and trader C, as served on 2026-10-05.
const DEAL = {
  ZDEAL_ID: '7000000006', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_DESC: 'OSIPL_FX_2026 / OGA-DMCC-OSIPL',
  ZS_DATE: '2026-09-30', ZE_DATE: '2026-10-30', ZREV_DEDATE: null, ZMC_REF: '2000000005', ZTRD_CODE: 'C',
  ZFX_INV_MODEL: '', ZTSF_MODEL: 'M032', ZDEAL_STAT: '01', ZDEAL_CURR_DESC: 'USD-USD-INR',
}
const MC = {
  ZMC_REF_NO: '2000000005', ZMC_DESC: 'DUMMY CORN M032', ZMC_DATE: '2026-08-22', ZSHIP_END: '2026-10-15',
  ZENT_DESC: 'OGA-DMCC-OSIPL', ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward',
}
const M032 = { ZMOD_ID: 'M032', ZNO_INV: '' }
const TRADER = { ZTCODE: 'C', ZNAME: 'Nidhi Singh', ZTRADER: 'Nidhi S' }

describe('header by key', () => {
  it('maps ZSGTSFTR_DEALID + MAS_CON + RULE_BT + trader to the header', () => {
    deepStrictEqual(toDeal({ deal: DEAL, mc: MC, model: M032, trader: TRADER }), {
      dealId: '7000000006',
      dealStartDate: '30-09-2026',
      dealEndDate: '30-10-2026',
      revisedEndDate: '',
      mcRefNo: '2000000005',
      mcDesc: 'DUMMY CORN M032',
      mcDate: '22-08-2026',
      shipEndDate: '15-10-2026',
      fxModelId: 'M032',
      fxModelDesc: 'INR Long Forward',
      entityString: 'OGA-DMCC-OSIPL',
      fxInvModel: '',
      trader: 'C',
      traderDesc: 'Nidhi S',
      currencyString: 'USD-USD-INR',
      dealStatus: '01',
      noInvoiceFlag: false,
    })
  })

  it('takes the no-invoice flag from the model and leaves MC fields blank without an MC', () => {
    const d = toDeal({ deal: DEAL, mc: undefined, model: { ZMOD_ID: 'M099', ZNO_INV: 'X' }, trader: undefined })
    strictEqual(d.noInvoiceFlag, true)
    strictEqual(d.mcDesc, '')
    strictEqual(d.fxModelId, '')
    strictEqual(d.traderDesc, '')
    strictEqual(d.mcRefNo, '2000000005')
  })
})

describe('status list box', () => {
  it("keeps the deal's type + sub type, drops blanks, sorts and dedupes", () => {
    deepStrictEqual(statusList(STATUSES, 'FX', 'FX1'), [
      { code: '01', text: 'FO: FX Deals Created', cls: 'pill-early' },
      { code: '20', text: 'Settlement Initiated', cls: 'pill-init' },
    ])
    deepStrictEqual(statusList(STATUSES, 'FX', 'FX2').map((s) => s.code), ['01', '14'])
  })

  it('labels a Deal ID pick with its sub type status text', () => {
    deepStrictEqual(toPick(DEAL, STATUSES), { dealId: '7000000006', statusText: 'FO: FX Deals Created' })
  })
})

describe('FX legs from TrmFxApp + FxTransaction', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  const fx = (txn: string, over: Record<string, unknown> = {}) => ({
    CompanyCode: 'SG03', FinancialTransaction: txn, TransactionType: '600', Partner: '400000002', ContractDate: '2026-09-30', ValueDate: '2026-10-30',
    BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyAmount: 1000, SellAmount: 83000,
    SpotRate: 82.5, ForwardRate: 83, ActiveStatus: '0', ...over,
  })
  const app = (txn: string, over: Record<string, unknown> = {}) => ({
    CompanyCode: 'SG03', FinancialTransaction: txn, ZtsfDealID: '7000000006', ZtsfDealType: 'D1', ZtsfDealSq: '01', ZtsfMcRefNo: '2000000005', TxnStatus: '07', ...over,
  })

  it('maps a leg: lead currency first, B/S from the buy side, APP_STR seq / type / MC, status text, no settled flag', () => {
    const r = toFxDeal({ fx: fx('1'), app: app('1') })
    deepStrictEqual(r, {
      seq: '01', dealType: 'D1', dealTypeChip: 'chip-d1', rfha: '1', bukrs: 'SG03', bp: '400000002', txnDate: '30-09-2026',
      valDate: '30-10-2026', entity: '', bs1: 'Buy', curr1: 'USD', amt1: 1000, bs2: 'Sell', curr2: 'INR', amt2: 83000,
      spot: '82.5000', rate: '83.0000', mcRefNo: '2000000005', status: 'MO: Match & Release for Settlement',
      statusChip: 'chip-open', doc1: '', doc2: '',
    })
    const sell = toFxDeal({ fx: fx('2', { BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: 83000, SellAmount: 1000 }), app: app('2', { ZtsfDealType: 'D2' }) })
    strictEqual(sell.bs1, 'Sell')
    strictEqual(sell.amt1, 1000)
    strictEqual(sell.dealTypeChip, 'chip-d2')
  })

  it('filters TrmFxApp by Deal ID, joins on company code + number, drops reversed deals and orders by seq', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = decodeURIComponent(String(input).replaceAll('+', ' '))
      urls.push(u)
      if (u.includes('/api/trmfxapp/TrmFxApp'))
        return json({ value: [app('2', { ZtsfDealType: 'D2', ZtsfDealSq: '02' }), app('1'), app('3', { ZtsfDealSq: '03' })] })
      return json({ value: [fx('1'), fx('2'), fx('3', { ActiveStatus: '3' })] })
    }) as typeof fetch
    const legs = await loadFxLegs('7000000006')
    deepStrictEqual(legs.map((l) => l.rfha), ['1', '2'])
    ok(urls[0]?.includes("ZtsfDealID eq '7000000006'"))
  })

  it('narrows the waiting text to the option legs, or names the unreadable service', () => {
    strictEqual(legsWaitingReason(2), OPTION_LEGS_WAITING)
    ok(legsWaitingReason(0).startsWith('No FX transaction carries this Deal ID'))
    ok(legsWaitingReason(0).endsWith(OPTION_LEGS_WAITING))
    ok(legsUnavailable('down').includes('could not be read: down'))
  })
})

describe('gates', () => {
  it('says why the trade invoice legs wait, and that no action posts', () => {
    ok(INVOICE_WAITING.includes('ZSGTSFTR_TRD_POS has no middleware resource'))
    for (const text of Object.values(ACTION_WAITING)) {
      ok(text.startsWith('WAITING FOR ACTION API — '))
      ok(text.endsWith('Nothing was posted to SAP.'))
    }
    ok(ACTION_WAITING.fxUpdate.includes('BAPI_FTR_FXT_CHANGE'))
  })
})
