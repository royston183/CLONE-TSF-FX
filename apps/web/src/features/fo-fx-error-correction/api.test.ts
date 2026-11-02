import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import {
  EMPTY_NAMES,
  companiesOf,
  correctTxn,
  dealInfoByTransaction,
  loadQueue,
  reverseTxns,
  statusOf,
  toCorrectionPatch,
  toTxn,
  txnTypeKey,
  type Names,
} from './api.ts'
import { STATUS } from './data.ts'
import { formFromTxn, filterTxns, DEFAULT_FILTERS, isActionable, buildCsv } from './logic.ts'
import type { Txn } from './types.ts'

const sap = (over: Partial<FxTransaction> = {}): FxTransaction => ({
  CompanyCode: 'SG03',
  FinancialTransaction: '7000000000001',
  ProductType: '12B',
  TransactionType: '619',
  Partner: '400000002',
  ContractDate: '2026-09-30',
  BuyCurrency: 'USD',
  SellCurrency: 'INR',
  LeadCurrency: 'USD',
  FollowCurrency: 'INR',
  BuyAmount: 1000,
  SellAmount: 83000,
  ValueDate: '2026-10-30',
  ForwardRate: 83,
  SpotRate: 82.5,
  SwapRate: 0.5,
  ActiveStatus: '0',
  ActivityCategory: '20',
  ...over,
})

const comp = [
  { ZBUKRS: 'SG03', ZBUTXT: 'Olam Global Agri Pte. Ltd', ZCOM_ID: 'OGA' },
  { ZBUKRS: 'AE13', ZBUTXT: 'Olam International DMCC', ZCOM_ID: 'DMCC' },
]
const names: Names = {
  companies: companiesOf(comp),
  productTypes: new Map([['12B', 'FX Forwards: External']]),
  transactionTypes: new Map([[txnTypeKey('12B', '619'), 'Forward']]),
  partners: new Map([['400000002', 'Barclays']]),
}
const dealRows = [
  { ZDEAL_ID: '7000000006', ZDEAL_STAT: '01', ZDEAL_DESC: 'Nidhi S_OSIPL_2026/OGA-OSIPL-DMCC', ZMC_REF: '2000000030', ZBUKRS1: 'SG03', ZRFHA1: '7000000000001' },
]
const deals = dealInfoByTransaction(dealRows)

const txnOf = (over: Partial<FxTransaction> = {}): Txn => {
  const t = toTxn(sap(over), deals, names)
  ok(t)
  return t
}

describe('toTxn', () => {
  it('fills the real names, Deal ID and Master Contract', () => {
    const t = txnOf()
    deepStrictEqual([t.rfha, t.coCode, t.companyName, t.tsfEntity], ['7000000000001', 'SG03', 'Olam Global Agri Pte. Ltd', 'OGA'])
    deepStrictEqual([t.prodType, t.prodTypeDesc, t.txnType, t.txnTypeDesc], ['12B', 'FX Forwards: External', '619', 'Forward'])
    deepStrictEqual([t.partnerCode, t.partnerName], ['400000002', 'Barclays'])
    deepStrictEqual([t.dealId, t.dealIdDesc, t.mc], ['7000000006', 'Nidhi S_OSIPL_2026/OGA-OSIPL-DMCC', '2000000030'])
  })

  it('takes the three rates and shows both amounts unsigned, lead currency first', () => {
    const t = txnOf()
    deepStrictEqual([t.spotRate, t.swapRate, t.allInRate], [82.5, 0.5, 83])
    deepStrictEqual([t.buySell1, t.ccy1, t.amt1, t.buySell2, t.ccy2, t.amt2, t.buysLead], ['Buy', 'USD', 1000, 'Sell', 'INR', 83000, true])
    const sell = txnOf({ BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: 83000, SellAmount: 1000 })
    deepStrictEqual([sell.buySell1, sell.amt1, sell.amt2, sell.buysLead], ['Sell', 1000, 83000, false])
  })

  it('leaves what SAP does not hold blank and says so with the status, not a made-up one', () => {
    const t = txnOf()
    for (const v of [t.busArea, t.profitCenter, t.traderCode, t.modeOfTrade, t.acctCat, t.moRemark, t.changedBy]) strictEqual(v, '')
    strictEqual(t.blotterDate, null)
    strictEqual(t.changedOn, null)
    strictEqual(t.status, STATUS.OPEN)
    strictEqual(t.live, true)
  })

  it('shows a reversed transaction as Reversed and read-only, and drops one without dates', () => {
    const rev = txnOf({ ActiveStatus: '3' })
    strictEqual(rev.status, STATUS.REVERSED)
    strictEqual(isActionable(rev), false)
    strictEqual(isActionable(txnOf()), true)
    strictEqual(toTxn(sap({ ValueDate: null }), deals, names), null)
  })

  it('shows no Deal ID for a transaction on none, and the code when a name is missing', () => {
    const t = toTxn(sap({ FinancialTransaction: '9' }), deals, EMPTY_NAMES)
    ok(t)
    deepStrictEqual([t.dealId, t.mc, t.companyName, t.prodTypeDesc, t.partnerName], ['', '', '', '', ''])
  })

  it('restores the application date, remark and audit data using both company and transaction', () => {
    const rows = new Map([
      ['SG03::7000000000001', { CompanyCode: 'SG03', FinancialTransaction: '7000000000001', BlotterDate: '2026-10-15', TxnStatus: '04', NdfMoRem: 'Check value date', Ztrcode: 'NS', LocalLastChangedBy: 'MO', LocalLastChangedAt: '2026-10-16T10:00:00Z' }],
      ['AE13::7000000000001', { CompanyCode: 'AE13', FinancialTransaction: '7000000000001', BlotterDate: '2026-09-01' }],
    ])
    const t = toTxn(sap(), deals, names, undefined, rows)!
    strictEqual(formFromTxn(t).blotterDate, '15-10-2026')
    strictEqual(t.moRemark, 'Check value date')
    strictEqual(t.traderCode, 'NS')
    strictEqual(t.changedBy, 'MO')
    strictEqual(t.status, STATUS.ERRCORR)
  })
})

describe('statusOf', () => {
  it('reads TXN_STATUS from APP_STR: 04 is Correction Required, 02/05 Reversed, 06/03/07 Released to MO', () => {
    strictEqual(statusOf('1', '04'), STATUS.ERRCORR)
    strictEqual(statusOf('1', '05'), STATUS.REVERSED)
    strictEqual(statusOf('1', '02'), STATUS.REVERSED)
    strictEqual(statusOf('1', '06'), STATUS.RESUB)
    strictEqual(statusOf('1', '03'), STATUS.RESUB)
    strictEqual(statusOf('1', '07'), STATUS.RESUB)
  })
  it('stays Open with no record, a blank status or 01, and SAP reversing always wins', () => {
    strictEqual(statusOf('1', undefined), STATUS.OPEN)
    strictEqual(statusOf('1', ''), STATUS.OPEN)
    strictEqual(statusOf('1', '01'), STATUS.OPEN)
    strictEqual(statusOf('3', '04'), STATUS.REVERSED)
  })
  it('toTxn picks the status up by company code + transaction', () => {
    const t = toTxn(sap(), new Map(), EMPTY_NAMES, new Map([['SG03::7000000000001', '04']]))
    strictEqual(t?.status, STATUS.ERRCORR)
  })
})

describe('the queue screen rules for live rows', () => {
  it('is not hidden by the blotter date range, which SAP has no value for', () => {
    const rows = [txnOf(), txnOf({ FinancialTransaction: '2' })]
    const out = filterTxns(rows, { ...DEFAULT_FILTERS, dateFrom: '01-01-2030', dateTo: '31-12-2030' }, 'ALL', { key: 'rfha', dir: -1 })
    strictEqual(out.length, 2)
  })

  it('filters on the Open and Reversed statuses', () => {
    const rows = [txnOf(), txnOf({ FinancialTransaction: '2', ActiveStatus: '3' })]
    const s = { key: 'rfha', dir: 1 } as const
    deepStrictEqual(filterTxns(rows, DEFAULT_FILTERS, 'OPEN', s).map((t) => t.rfha), ['7000000000001'])
    deepStrictEqual(filterTxns(rows, DEFAULT_FILTERS, 'REVERSED', s).map((t) => t.rfha), ['2'])
  })

  it('exports a live row with a blank blotter date', () => {
    ok(buildCsv([txnOf()]).split('\n')[1]!.endsWith(',30-09-2026,30-10-2026,,,,'))
  })
})

describe('toCorrectionPatch', () => {
  const t = txnOf()
  const form = () => ({ ...formFromTxn(t) })

  it('sends nothing when nothing changed', () => {
    deepStrictEqual(toCorrectionPatch(t, form()), {})
  })

  it('sends only the fields that changed, in the service\'s names', () => {
    const f = { ...form(), allInRate: '84.0000', amount1: '2M', valueDate: '05-11-2026', tradeDate: '29-09-2026' }
    deepStrictEqual(toCorrectionPatch(t, f), { ForwardRate: 84, BuyAmount: 2_000_000, ValueDate: '2026-11-05', ContractDate: '2026-09-29' })
  })

  it('allows a swap rate of zero but not a zero rate elsewhere', () => {
    deepStrictEqual(toCorrectionPatch(t, { ...form(), swapRate: '0.0000' }), { SwapRate: 0 })
    deepStrictEqual(toCorrectionPatch(t, { ...form(), allInRate: '0.0000', spotRate: 'abc' }), {})
  })

  it('never sends the sold amount or fields without a save path', () => {
    const f = { ...form(), amount2: '1', partner: 'X', busArea: '0223', mc: '1', dealId: '2', acctCat: '1000', modeOfTrade: 'BARX' }
    deepStrictEqual(toCorrectionPatch(t, f), {})
  })

  it('does not send Amount 1 for a transaction that sells the lead currency', () => {
    const sell = txnOf({ BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: 83000, SellAmount: 1000 })
    deepStrictEqual(toCorrectionPatch(sell, { ...formFromTxn(sell), amount1: '5,000.00' }), {})
  })

  it('sends the bought Amount 2 for a transaction that sells the lead currency', () => {
    const sell = txnOf({ BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: 83000, SellAmount: 1000 })
    deepStrictEqual(toCorrectionPatch(sell, { ...formFromTxn(sell), amount2: '166T' }), { BuyAmount: 166000 })
  })

  it('does not silently round stored rates just because the form displays four decimal places', () => {
    const precise = txnOf({ ForwardRate: 83.1234567, SwapRate: 0.1234567, SpotRate: 83.1234567 })
    deepStrictEqual(toCorrectionPatch(precise, formFromTxn(precise)), {})
  })

  it('includes a changed application date and ignores invalid dates', () => {
    deepStrictEqual(toCorrectionPatch(t, { ...form(), blotterDate: '15-10-2026' }), { BlotterDate: '2026-10-15' })
    deepStrictEqual(toCorrectionPatch(t, { ...form(), blotterDate: '31-02-2026' }), {})
  })
})

describe('talking to SAP', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('changes a transaction with a PATCH of the changed fields only', async () => {
    const calls: Array<{ url: string; method: string; body: string }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: decodeURIComponent(String(input)), method: init?.method ?? 'GET', body: String(init?.body ?? '') })
      return json(200, {})
    }) as typeof fetch
    await correctTxn(txnOf(), { ForwardRate: 84 })
    strictEqual(calls.length, 1)
    strictEqual(calls[0]!.method, 'PATCH')
    strictEqual(calls[0]!.url, "/api/fx/FxTransaction(CompanyCode='SG03',FinancialTransaction='7000000000001')")
    strictEqual(calls[0]!.body, '{"ForwardRate":84}')
  })

  it('routes date-only corrections to APP_STR without changing the transaction or workflow status', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: decodeURIComponent(String(input)), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
      return json(200, { CompanyCode: 'SG03', FinancialTransaction: '7000000000001', TxnStatus: '04' })
    }) as typeof fetch
    await correctTxn(txnOf(), { BlotterDate: '2026-10-15' })
    deepStrictEqual(calls.map(c => c.method), ['GET', 'PATCH'])
    ok(calls.every(c => c.url.includes('/api/trmfxapp/TrmFxApp(')))
    deepStrictEqual(calls[1]!.body, { BlotterDate: '2026-10-15' })
  })

  it('records a blotter date for an older transaction without an APP_STR row', async () => {
    const writes: Array<{ method: string; body: unknown }> = []
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') return json(404, { error: { message: 'Not found' } })
      writes.push({ method: init.method, body: JSON.parse(String(init.body)) })
      return json(201, {})
    }) as typeof fetch
    await correctTxn(txnOf(), { BlotterDate: '2026-10-15' })
    deepStrictEqual(writes, [{ method: 'POST', body: { CompanyCode: 'SG03', FinancialTransaction: '7000000000001', BlotterDate: '2026-10-15' } }])
  })

  it('keeps the date out of the FX patch and reports a partial save if its own write fails', async () => {
    const bodies: unknown[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/fx/')) {
        bodies.push(JSON.parse(String(init?.body)))
        return json(200, {})
      }
      return json(500, { error: { message: 'Application data unavailable' } })
    }) as typeof fetch
    let message = ''
    try { await correctTxn(txnOf(), { ForwardRate: 84, BlotterDate: '2026-10-15' }) } catch (e) { message = (e as Error).message }
    deepStrictEqual(bodies, [{ ForwardRate: 84 }])
    ok(message.includes('Transaction changes were saved, but Blotter Date was not saved.'))
  })

  it('reverses in order with DELETE and stops at the first refusal, giving SAP\'s cause', async () => {
    const order: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input))
      ok(init?.method === 'DELETE')
      order.push(/FinancialTransaction='(\d+)'/.exec(url)?.[1] ?? '?')
      if (url.includes("'2'")) {
        return json(400, { error: { message: 'BAPI processing was terminated', details: [{ code: 'FTR0/009', message: 'Transaction is already settled' }, { code: 'FTR0/161', message: 'BAPI processing was terminated' }] } })
      }
      return json(200, {})
    }) as typeof fetch
    const ts = ['1', '2', '3'].map((n) => txnOf({ FinancialTransaction: n }))
    const out = await reverseTxns(ts)
    deepStrictEqual(order, ['1', '2'])
    deepStrictEqual(out, { reversed: ['1'], failed: { rfha: '2', reason: 'Transaction is already settled' } })
  })

  it('reads the TSF company codes, names them and keeps reversed rows', async () => {
    let fxUrl = ''
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = decodeURIComponent(String(input).replaceAll('+', ' '))
      if (u.includes('/api/fx/')) {
        fxUrl = u
        return json(200, { value: [sap(), sap({ FinancialTransaction: '2', ActiveStatus: '3' })] })
      }
      if (u.includes('/api/trmfxapp/')) return json(200, { value: [{ CompanyCode: 'SG03', FinancialTransaction: '7000000000001', TxnStatus: '04', BlotterDate: '2026-10-15' }] })
      if (u.includes('/data/comp')) return json(200, { ok: true, rows: comp })
      if (u.includes('/data/tsfDealId')) return json(200, { ok: true, rows: dealRows })
      if (u.includes('/api/trmmaster/ProductType')) return json(200, { value: [{ ProductType: '12B', ProductTypeName: 'FX Forwards: External' }] })
      if (u.includes('/api/trmmaster/TransactionType')) return json(200, { value: [{ ProductType: '12B', TransactionType: '619', TransactionTypeName: 'Forward' }] })
      if (u.includes('A_BusinessPartner')) return json(200, { d: { results: [{ BusinessPartner: '400000002', BusinessPartnerFullName: 'Barclays' }] } })
      return json(200, { ok: true, rows: [] })
    }) as typeof fetch
    const rows = await loadQueue()
    deepStrictEqual(rows.map((t) => [t.rfha, t.status]), [['7000000000001', STATUS.ERRCORR], ['2', STATUS.REVERSED]])
    strictEqual(formFromTxn(rows[0]!).blotterDate, '15-10-2026')
    strictEqual(rows[0]!.partnerName, 'Barclays')
    strictEqual(rows[0]!.dealId, '7000000006')
    for (const c of ['SG03', 'AE13']) ok(fxUrl.includes(`CompanyCode eq '${c}'`))
  })

  it('still lists the queue when a name master cannot be read', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = decodeURIComponent(String(input).replaceAll('+', ' '))
      if (u.includes('/api/fx/')) return json(200, { value: [sap()] })
      if (u.includes('/data/comp')) return json(200, { ok: true, rows: comp })
      if (u.includes('/data/tsfDealId')) return json(200, { ok: true, rows: [] })
      return json(500, { error: { message: 'down' } })
    }) as typeof fetch
    const rows = await loadQueue()
    strictEqual(rows.length, 1)
    deepStrictEqual([rows[0]!.partnerName, rows[0]!.prodTypeDesc, rows[0]!.companyName], ['', '', 'Olam Global Agri Pte. Ltd'])
  })

  it('refuses rather than listing nothing when no company code is known', async () => {
    globalThis.fetch = (async () => json(200, { ok: true, rows: [] })) as typeof fetch
    await rejects(loadQueue())
  })
})

async function rejects(p: Promise<unknown>) {
  try {
    await p
  } catch {
    return
  }
  throw new Error('expected a rejection')
}
