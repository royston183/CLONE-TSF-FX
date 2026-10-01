import { deepStrictEqual, ok, rejects, strictEqual, throws } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { FxRow as MwRow } from '../../shared/fx/mw.ts'
import {
  USABLE_MC_STATUSES,
  WorkbenchLoadError,
  assignedKeys,
  createDealId,
  dealColumns,
  isUsableStatus,
  loadWorkbench,
  toDeal,
  toFxRow,
  toMasterContract,
  toPoolTxn,
  txnKey,
  type FxTxn,
} from './api.ts'
import { compatibleCreatePool, validateCreateDeal } from './logic.ts'
import type { MasterContract, PoolTxn } from './types.ts'

const mcRow = (over: MwRow = {}): MwRow => ({
  ZMC_REF_NO: '2000000005', ZMC_DESC: 'DUMMY CORN M032', ZMC_DATE: '2026-08-22', ZSHIP_END: '2026-10-15', ZORIGIN: 'OSIPL',
  ZAMT: '100000.00', ZUTI_AMT: '25000.00', ZMOD_ID: 'M032', ZENT_DESC: 'OGA-DMCC-OSIPL', ZCURR_DESC: 'USD-USD-INR', ZCURR_ID: 'C002',
  ZMC_STAT: '04', ...over,
})

const txn = (over: Partial<FxTxn> = {}): FxTxn => ({
  CompanyCode: 'SG03', FinancialTransaction: '7000000000001', TransactionType: '619', ContractDate: '2026-09-30', ValueDate: '2026-10-30',
  BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyAmount: 1000, SellAmount: 83000,
  SpotRate: 83, SwapRate: 0, ForwardRate: 83, ActiveStatus: '0', ActivityCategory: '20', ...over,
})

const entityOf = (b: string): string => ({ SG03: 'OGA', AE13: 'DMCC' })[b] ?? ''

describe('Master Contracts', () => {
  it('maps a contract to the Create dialog\'s shape, with dates as dd-mm-yyyy', () => {
    deepStrictEqual(toMasterContract(mcRow()), {
      ref: '2000000005', origin: 'OSIPL', model: 'M032', mcDate: '22-08-2026', shipEnd: '15-10-2026', amount: 100000, balance: 75000,
      desc: 'DUMMY CORN M032', entity: 'OGA-DMCC-OSIPL', currency: 'USD-USD-INR', currencyId: 'C002',
    })
  })

  it('never shows a negative balance', () => {
    strictEqual(toMasterContract(mcRow({ ZUTI_AMT: '150000.00' }))?.balance, 0)
  })

  it('leaves out a contract without a number, an origin or both dates', () => {
    strictEqual(toMasterContract(mcRow({ ZMC_REF_NO: '' })), null)
    strictEqual(toMasterContract(mcRow({ ZORIGIN: '' })), null)
    strictEqual(toMasterContract(mcRow({ ZSHIP_END: null })), null)
    strictEqual(toMasterContract(mcRow({ ZMC_DATE: null })), null)
  })

  it('offers only Confirmed by MO (03) and In Use (04)', () => {
    deepStrictEqual([...USABLE_MC_STATUSES], ['03', '04'])
    for (const s of ['03', '04']) ok(isUsableStatus(mcRow({ ZMC_STAT: s })))
    for (const s of ['01', '02', '09', '11', '13', '21']) ok(!isUsableStatus(mcRow({ ZMC_STAT: s })))
  })
})

describe('Treasury transactions', () => {
  it('maps a transaction to a Deal 1 / Deal 2 candidate, lead currency first', () => {
    deepStrictEqual(toPoolTxn(txn(), entityOf), {
      rfha: '7000000000001', bukrs: 'SG03', sfhaart: '619', entity: 'OGA', start: '30-09-2026', end: '30-10-2026',
      side1: 'Buy', curr1: 'USD', amt1: 1000, side2: 'Sell', curr2: 'INR', amt2: 83000, trader: '',
    })
    const sell = toPoolTxn(txn({ BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: 83000, SellAmount: 1000 }), entityOf)
    deepStrictEqual([sell?.side1, sell?.curr1, sell?.amt1, sell?.side2, sell?.curr2, sell?.amt2], ['Sell', 'USD', 1000, 'Buy', 'INR', 83000])
  })

  it('leaves out a reversed transaction and one without dates', () => {
    strictEqual(toPoolTxn(txn({ ActiveStatus: '3' }), entityOf), null)
    strictEqual(toPoolTxn(txn({ ValueDate: null }), entityOf), null)
  })

  it('reads the activity category as TXN_STATUS 03 (unmatched) or 07 (matched and released)', () => {
    strictEqual(toFxRow('D1', 'SG03', '1', txn(), 'OGA', 'MC').txnStatus, '03')
    strictEqual(toFxRow('D1', 'SG03', '1', txn({ ActivityCategory: '30' }), 'OGA', 'MC').txnStatus, '07')
  })

  it('shows a linked transaction the service does not return as a bare row', () => {
    const r = toFxRow('D2', 'ZZ99', '42', undefined, '', 'MC1')
    deepStrictEqual([r.dealType, r.bukrs, r.rfha, r.amt1, r.txnStatus, r.mcRef], ['D2', 'ZZ99', '42', 0, '', 'MC1'])
  })

  it('keys a transaction by company and number', () => {
    strictEqual(txnKey('SG03', '7000000000001'), 'SG03-7000000000001')
  })
})

describe('Deal IDs', () => {
  const dealRow = (over: MwRow = {}): MwRow => ({
    ZDEAL_ID: '7000000001', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_DESC: 'OSIPL_FX_2026 / OGA-DMCC-OSIPL', ZDEAL_REF: '', ZS_DATE: '2026-09-30',
    ZE_DATE: '2026-10-30', ZMC_REF: '2000000005', ZTRD_CODE: 'C', ZTSF_MODEL: 'M032', ZDEAL_STAT: '01', ZDEAL_AMT: '1000.00',
    ZDEAL_CURR_DESC: 'USD-USD-INR', ZBUKRS1: 'SG03', ZRFHA1: '7000000000001', ZBUKRS2: 'SG03', ZRFHA2: '3000000000005', ...over,
  })
  const mc = toMasterContract(mcRow())!
  const lookups = {
    txns: new Map([[txnKey('SG03', '7000000000001'), txn()], [txnKey('SG03', '3000000000005'), txn({ FinancialTransaction: '3000000000005', ActivityCategory: '30' })]]),
    contracts: new Map([[mc.ref, mc]]),
    traders: new Map([['C', 'Nidhi S']]),
    entityOf,
  }

  it('lists the transactions a Deal ID links, and no others', () => {
    deepStrictEqual([...assignedKeys([dealRow()])].sort(), ['SG03-3000000000005', 'SG03-7000000000001'])
    deepStrictEqual([...assignedKeys([dealRow({ ZBUKRS3: 'AE13', ZRFHA3: '99', ZBUKRS4: '', ZRFHA4: '5' })])].sort(), ['AE13-99', 'SG03-3000000000005', 'SG03-7000000000001'])
    strictEqual(assignedKeys([]).size, 0)
  })

  it('maps a Deal ID row to the workbench\'s deal, with its MC, trader and linked transactions', () => {
    const d = toDeal(dealRow(), lookups)
    strictEqual(d.id, '7000000001')
    strictEqual(d.description, 'OSIPL_FX_2026 / OGA-DMCC-OSIPL')
    strictEqual(d.startDate, '30-09-2026')
    strictEqual(d.endDate, '30-10-2026')
    strictEqual(d.status, '01')
    strictEqual(d.mcRef, '2000000005')
    strictEqual(d.mcDesc, 'DUMMY CORN M032')
    strictEqual(d.entityString, 'OGA-DMCC-OSIPL')
    strictEqual(d.origin, 'OSIPL')
    strictEqual(d.trader, 'Nidhi S')
    strictEqual(d.traderCode, 'C')
    deepStrictEqual(d.fxRows.map((r) => [r.dealType, r.rfha, r.entity, r.txnStatus, r.mcRef]), [
      ['D1', '7000000000001', 'OGA', '03', '2000000005'],
      ['D2', '3000000000005', 'OGA', '07', '2000000005'],
    ])
  })

  it('has no invoices to show: nothing supplies them', () => {
    const d = toDeal(dealRow(), lookups)
    deepStrictEqual(d.invoices, [])
    strictEqual(d.premium.dealValue, 1000)
  })

  it('reads any status other than 01 and 02 as X', () => {
    strictEqual(toDeal(dealRow({ ZDEAL_STAT: '02' }), lookups).status, '02')
    strictEqual(toDeal(dealRow({ ZDEAL_STAT: '30' }), lookups).status, 'X')
  })
})

describe('creating a Deal ID', () => {
  const mc = toMasterContract(mcRow())!
  const a: PoolTxn = toPoolTxn(txn(), entityOf)!
  const b: PoolTxn = toPoolTxn(txn({ FinancialTransaction: '3000000000005', ValueDate: '2026-11-02' }), entityOf)!

  it('fills the Deal ID columns: both transactions, the MC, the dates and the amount', () => {
    const c = dealColumns(mc, a, b, 'FX', 'FX1', 2026)
    strictEqual(c['ZDEAL_TYPE'], 'FX')
    strictEqual(c['ZSUB_TYPE'], 'FX1')
    strictEqual(c['ZDEAL_DESC'], 'OSIPL_FX_2026 / OGA-DMCC-OSIPL')
    strictEqual(c['ZMC_REF'], '2000000005')
    strictEqual(c['ZTSF_MODEL'], 'M032')
    strictEqual(c['ZBUKRS1'], 'SG03')
    strictEqual(c['ZRFHA1'], '7000000000001')
    strictEqual(c['ZBUKRS2'], 'SG03')
    strictEqual(c['ZRFHA2'], '3000000000005')
    strictEqual(c['ZS_DATE'], '2026-09-30')
    strictEqual(c['ZE_DATE'], '2026-11-02')
    strictEqual(c['ZDEAL_AMT'], '1000.00')
    strictEqual(c['ZDEAL_STAT'], '01')
    strictEqual(c['ZMC_CURR_ID'], 'C002')
    ok(!('ZDEAL_ID' in c), 'the number comes from the range')
  })

  it('refuses a model with no deal type / sub type, which are key columns', () => {
    throws(() => dealColumns(mc, a, b, '', '', 2026), /no deal type/)
  })

  it('keeps the screen\'s own checks: USD leg, end dates within 3 days, start inside the MC window', () => {
    strictEqual(validateCreateDeal(mc, a, a), 'Deal 1 and Deal 2 must be different transactions.')
    strictEqual(validateCreateDeal(mc, a, b), '')
    ok(validateCreateDeal(mc, a, { ...b, end: '30-12-2026' }).includes('±3 days'))
    ok(validateCreateDeal(mc, { ...a, start: '01-01-2026' }, b).includes('between MC Date and Ship End'))
    deepStrictEqual(compatibleCreatePool(mc, [a, b]).map((t) => t.rfha), [a.rfha, b.rfha])
  })

  describe('against the middleware', () => {
    const realFetch = globalThis.fetch
    afterEach(() => {
      globalThis.fetch = realFetch
    })
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

    type Call = { method: string; url: string; body: Record<string, any> | null }
    const mockMiddleware = (calls: Call[], opts: { patchStatus?: number } = {}) => {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = decodeURIComponent(String(input))
        const method = init?.method ?? 'GET'
        calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null })
        if (url.startsWith('/auth/me')) return json(200, { user: { username: 'demo' } })
        if (url.includes('/meta/resources/tsfDealId')) return json(200, { numberRange: { initialised: true } })
        if (url.includes('/data/fxModel')) return json(200, { ok: true, rows: [{ ZMOD_ID: 'M032', ZTYPE: 'FX', ZSUB_TYPE: 'FX1' }] })
        if (method === 'POST' && url.includes('/data/tsfDealId')) return json(201, { ok: true, key: { ZDEAL_ID: '7000000001' }, assignedNumber: '7000000001' })
        if (method === 'PATCH' && url.includes('/data/masterContract')) {
          return opts.patchStatus && opts.patchStatus >= 400 ? json(opts.patchStatus, { error: { message: 'locked by another user' } }) : json(200, { ok: true })
        }
        return json(404, { error: { message: 'unexpected ' + method + ' ' + url } })
      }) as typeof fetch
    }

    it('draws the number, writes the row, then moves the MC to 04, in that order', async () => {
      const calls: Call[] = []
      mockMiddleware(calls)
      const out = await createDealId(mc, a, b, new Date(2026, 9, 1))
      strictEqual(out.dealId, '7000000001')
      const writes = calls.filter((c) => c.method === 'POST' || c.method === 'PATCH')
      deepStrictEqual(writes.map((c) => c.method), ['POST', 'PATCH'])
      const post = writes[0]!.body!['data'] as Record<string, unknown>
      strictEqual(post['ZRFHA1'], '7000000000001')
      strictEqual(post['ZRFHA2'], '3000000000005')
      strictEqual(post['ZMC_REF'], '2000000005')
      ok(!('ZDEAL_ID' in post))
      strictEqual(post['ZCREATED_BY'], 'DEMO')
      const patch = writes[1]!.body as { key: Record<string, string>; changes: Record<string, string> }
      deepStrictEqual(patch.key, { ZMC_REF_NO: '2000000005' })
      strictEqual(patch.changes['ZMC_STAT'], '04')
    })

    it('says which Deal ID exists when the MC cannot be moved, since nothing is rolled back', async () => {
      const calls: Call[] = []
      mockMiddleware(calls, { patchStatus: 409 })
      await rejects(
        () => createDealId(mc, a, b, new Date(2026, 9, 1)),
        (e: unknown) => e instanceof Error && e.message.includes('Deal ID 7000000001 was created') && e.message.includes('2000000005'),
      )
    })

    it('writes nothing when the model has no deal type', async () => {
      const calls: Call[] = []
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = decodeURIComponent(String(input))
        calls.push({ method: init?.method ?? 'GET', url, body: null })
        if (url.includes('/meta/resources/')) return json(200, { numberRange: { initialised: true } })
        if (url.includes('/data/fxModel')) return json(200, { ok: true, rows: [{ ZMOD_ID: 'M032', ZTYPE: '', ZSUB_TYPE: '' }] })
        return json(404, {})
      }) as typeof fetch
      await rejects(() => createDealId(mc, a, b), /no deal type/)
      ok(!calls.some((c) => c.method === 'POST' || c.method === 'PATCH'))
    })
  })
})

describe('loading the workbench', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const sources: Record<string, unknown[]> = {
    masterContract: [mcRow(), mcRow({ ZMC_REF_NO: '2000000009', ZMC_STAT: '01' })],
    tsfDealId: [{ ZDEAL_ID: '7000000001', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZMC_REF: '2000000005', ZBUKRS1: 'SG03', ZRFHA1: '7000000000001', ZBUKRS2: 'SG03', ZRFHA2: '3000000000005', ZS_DATE: '2026-09-30', ZE_DATE: '2026-10-30', ZDEAL_STAT: '01', ZTRD_CODE: 'C' }],
    trmTrader: [{ ZTCODE: 'C', ZTRADER: 'Nidhi S', ZNAME: 'Nidhi Singh' }],
    comp: [{ ZBUKRS: 'SG03', ZCOM_ID: 'OGA' }, { ZBUKRS: 'AE13', ZCOM_ID: 'DMCC' }],
  }
  const fx = [
    txn(),
    txn({ FinancialTransaction: '3000000000005' }),
    txn({ FinancialTransaction: '3000000000006' }),
    txn({ FinancialTransaction: '3000000000007', ActiveStatus: '3' }),
  ]

  const install = (failing?: string) => {
    const seen: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input).replaceAll('+', ' '))
      seen.push(url)
      if (url.startsWith('/auth/me')) return json(200, { user: { username: 'demo' } })
      if (url.includes('/api/fx/FxTransaction')) return failing === 'FxTransaction' ? json(502, { error: { message: { value: 'Connect Timeout Error' } } }) : json(200, { value: fx })
      const name = /\/data\/([A-Za-z]+)/.exec(url)?.[1] ?? ''
      if (name === failing) return json(500, { error: { message: 'database unavailable' } })
      return json(200, { ok: true, rows: sources[name] ?? [] })
    }) as typeof fetch
    return seen
  }

  it('builds the deals, the usable contracts and the unassigned transactions', async () => {
    const seen = install()
    const w = await loadWorkbench()
    deepStrictEqual(Object.keys(w.deals), ['7000000001'])
    strictEqual(w.deals['7000000001']!.trader, 'Nidhi S')
    deepStrictEqual(w.masterContracts.map((m) => m.ref), ['2000000005'])
    // two of the four transactions are on the Deal ID already, one is reversed
    deepStrictEqual(w.pool.map((t) => t.rfha), ['3000000000006'])
    const fxUrl = seen.find((u) => u.includes('/api/fx/FxTransaction'))!
    ok(fxUrl.includes("CompanyCode eq 'SG03'") && fxUrl.includes("CompanyCode eq 'AE13'"))
  })

  it('names the source that failed and offers nothing in its place', async () => {
    for (const failing of ['masterContract', 'tsfDealId', 'trmTrader', 'comp', 'FxTransaction']) {
      install(failing)
      await rejects(
        () => loadWorkbench(),
        (e: unknown) => e instanceof WorkbenchLoadError && e.resource === failing && e.message.startsWith(`Could not load ${failing}:`),
        failing,
      )
    }
  })

  it('opens empty rather than failing when there are no Deal IDs yet', async () => {
    sources['tsfDealId'] = []
    install()
    const w = await loadWorkbench()
    deepStrictEqual(w.deals, {})
    strictEqual(w.pool.length, 3)
  })
})
