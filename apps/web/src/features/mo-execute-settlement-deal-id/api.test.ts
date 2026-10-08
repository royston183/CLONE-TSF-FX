import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  ACTION_WAITING,
  INVOICE_WAITING,
  OPTION_LEGS_WAITING,
  legsUnavailable,
  legsWaitingReason,
  loadFxLegs,
  pickInSpotRow,
  buildTradeInvoices,
  saveSpotData,
  spotQuotePair,
  statusList,
  tcurrSpotRates,
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
    ok(INVOICE_WAITING.includes('no leg for this Deal ID'))
    for (const text of Object.values(ACTION_WAITING)) {
      ok(text.startsWith('WAITING FOR ACTION API — '))
      ok(text.endsWith('Nothing was posted to SAP.'))
    }
    ok(ACTION_WAITING.fxUpdate.includes('BAPI_FTR_FXT_CHANGE'))
  })
})

// ---------------------------------------------------------------- FX-Invoice Difference

const LEG = { dealType: 'D1', rfha: '6205000000288', bukrs: 'IN11', bp: '0400000002', valDate: '20-11-2026', curr1: 'USD', curr2: 'INR', spot: '83.2000' }
const INSPOT_OPEN = { ZMOD_ID: 'M032', ZDEAL_ID: '1100000981', ZDEAL_TYPE: 'D1', ZDSS_TYPE: 'DSS1', ZBUKRS: 'IN11', ZRFHA: '6205000000288', ZD_AMT: '-3998.00', ZCURR: 'USD', ZSPOT_TXN: '' }

describe('spot rate default (TCURR)', () => {
  it('quotes a pair containing USD as the other currency per USD', () => {
    deepStrictEqual(spotQuotePair('USD', 'INR'), { from: 'USD', to: 'INR' })
    deepStrictEqual(spotQuotePair('INR', 'USD'), { from: 'USD', to: 'INR' })
    deepStrictEqual(spotQuotePair('EUR', 'INR'), { from: 'EUR', to: 'INR' })
  })

  it('uses the TCURR rate (type M, today) and falls back to the transaction spot', async () => {
    const seen: string[] = []
    const rates = await tcurrSpotRates([LEG as never, { ...LEG, curr2: 'EUR' } as never], new Date(2026, 9, 7), async (from, to, date, type) => {
      seen.push(`${from}>${to}@${date}/${type}`)
      return to === 'INR' ? 84.5 : null
    })
    deepStrictEqual(rates, ['84.5000', '83.2000'])
    strictEqual(seen[0], 'USD>INR@2026-10-07/M')
  })
})

describe('Save Spot Data', () => {
  it('picks the open IN_SPOT row of the leg, and none once a Spot exists', () => {
    strictEqual(pickInSpotRow([INSPOT_OPEN], LEG), INSPOT_OPEN)
    strictEqual(pickInSpotRow([{ ...INSPOT_OPEN, ZSPOT_TXN: '6005000000281' }], LEG), undefined)
    strictEqual(pickInSpotRow([{ ...INSPOT_OPEN, ZDSS_TYPE: '' }], LEG), undefined)
    strictEqual(pickInSpotRow([{ ...INSPOT_OPEN, ZRFHA: 'other' }], LEG), undefined)
  })

  it('skips a leg with no rate or no open difference, and sends nothing to SAP', async () => {
    const out = await saveSpotData('1100000981', [LEG as never, { ...LEG, dealType: 'D2' } as never], ['', '83'], {
      listInSpot: async () => [INSPOT_OPEN],
      ports: new Proxy({}, { get: () => () => { throw new Error('SAP must not be called') } }) as never,
    })
    deepStrictEqual(out.map((r) => r.ok), [false, false])
    ok(out[0]!.message.includes('valid spot rate'))
    ok(out[1]!.message.includes('no open difference'))
  })
})
describe('buildTradeInvoices (R060 invoice_settlement_data)', () => {
  const setTyp = [
    { ZMOD_ID: 'M033', ZT_TYP_NO: '2', ZT_TYPE: '02XP', ZSET_DESC: 'DMCC pays OAIPL', ZCURR: 'USD', ZSET_CURR: 'USD', ZTRF_TYPE: 'TT' },
    { ZMOD_ID: 'M033', ZT_TYP_NO: '1', ZT_TYPE: '01XS', ZSET_DESC: 'OIL sells to DMCC', ZCURR: 'USD', ZSET_CURR: 'INR', ZTRF_TYPE: 'LT' },
  ]
  // ZINV_REF+11(2) is the leg's two-character type.
  const billAdj = [
    { ZINV_REF: '7000000034002', ZAMT: '100', ZDUE_DATE: '2026-11-10' },
    { ZINV_REF: '7000000034002', ZAMT: '250.5', ZDUE_DATE: '2026-11-10' },
    { ZINV_REF: '7000000034001', ZAMT: '7', ZDUE_DATE: '2026-11-09' },
  ]

  it('builds the default legs from SET_TYP when TRD_POS has no row, in ZT_TYP_NO order', () => {
    const rows = buildTradeInvoices(setTyp, billAdj, [], [], '')
    deepStrictEqual(rows.map((r) => r.leg), ['01XS', '02XP'])
    deepStrictEqual(rows.map((r) => [r.recPay, r.trfType, r.setCo, r.fiDoc]), [['Receipt', 'LT', false, ''], ['Payment', 'TT', false, '']])
  })

  it('sums BIL_ADJ amounts by ZINV_REF+11(2) = ZT_TYPE+0(2), and falls back to its due date', () => {
    const [first, second] = buildTradeInvoices(setTyp, billAdj, [], [], '')
    strictEqual(first!.invAmt, 7)
    strictEqual(first!.dueDate, '09-11-2026')
    strictEqual(second!.invAmt, 350.5)
    strictEqual(second!.dueDate, '10-11-2026')
  })

  it('uses the D1 maturity as the due date, and the invoice amount as payment only in the same currency', () => {
    const [first, second] = buildTradeInvoices(setTyp, billAdj, [], [], '20-11-2026')
    deepStrictEqual([first!.dueDate, second!.dueDate], ['20-11-2026', '20-11-2026'])
    strictEqual(first!.payAmt, 0) // USD invoice, INR settlement: needs the mapped rate, not guessed
    strictEqual(second!.payAmt, 350.5)
  })

  it('joins TRD_ACC on ZFI_TYPE for the document type, reference and Dr / Cr texts, blank when no row is loaded', () => {
    const withFi = setTyp.map((t, i) => ({ ...t, ZFI_TYPE: i === 0 ? '02' : '01' }))
    const rows = buildTradeInvoices(withFi, billAdj, [], [{ ZFI_TYPE: '01', ZDOC_TYPE: 'RV', ZXBLNR1: 'INV-REF', ZDR_TEXT: 'Dr DMCC Trade A/R', ZCR_TEXT: 'Cr OIL Revenue' }], '')
    deepStrictEqual([rows[0]!.docType, rows[0]!.xblnr, rows[0]!.drPost, rows[0]!.crPost], ['RV', 'INV-REF', 'Dr DMCC Trade A/R', 'Cr OIL Revenue'])
    deepStrictEqual([rows[1]!.docType, rows[1]!.drPost, rows[1]!.crPost], ['', '', ''])
  })

  it('lays the saved TRD_POS state over the leg with the same ZT_TYPE', () => {
    const rows = buildTradeInvoices(setTyp, billAdj, [{ ZT_TYPE: '02XP', ZSET_CHECK: 'X', ZBELNR: '1900000001', ZP_DATE: '20261121' }], [], '')
    deepStrictEqual([rows[1]!.setCo, rows[1]!.fiDoc, rows[1]!.postDate], [true, '1900000001', '21-11-2026'])
    deepStrictEqual([rows[0]!.setCo, rows[0]!.fiDoc, rows[0]!.postDate], [false, '', ''])
  })
})
