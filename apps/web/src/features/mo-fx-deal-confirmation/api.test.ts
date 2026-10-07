import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ApiError } from '@slc/api-client'
import { dealIdsByTransaction, dealKey, loadFxDeals, overUtilisedDealIds, sapMessage, settleFxDeal, toDeal, type FxTransaction } from './api.ts'
import type { MoAppRecord } from './appStr.ts'
import { STATUS, generateDeals } from './data.ts'
import { EMPTY_FILTERS, filterDeals, mergeLiveDeals, withoutFxDeals } from './logic.ts'
import type { AppliedSelection, Deal } from './types.ts'

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
  ActiveStatus: '0',
  ActivityCategory: '20',
  ...over,
})

const rec = (over: Partial<MoAppRecord> = {}): MoAppRecord => ({
  CompanyCode: 'SG03',
  FinancialTransaction: '7000000000001',
  TxnStatus: '03',
  BlotterDate: '2026-10-05',
  ...over,
})

const dealOf = (over: Partial<FxTransaction> = {}, record: MoAppRecord = rec({ FinancialTransaction: over.FinancialTransaction ?? '7000000000001' })): Deal => {
  const d = toDeal(sap(over), new Map(), record)
  ok(d)
  return d
}

describe('toDeal', () => {
  it('maps a created forward to an Unmatched FX row', () => {
    const d = dealOf()
    strictEqual(d.id, 'SG03-7000000000001')
    strictEqual(d.dealType, 'FX')
    strictEqual(d.coCode, 'SG03')
    strictEqual(d.transaction, '7000000000001')
    strictEqual(d.partnerCode, '400000002')
    strictEqual(d.txnTypeCode, '619')
    strictEqual(d.txnTypeDesc, '619 - FX Forwards: External-Forward')
    strictEqual(d.status, STATUS.UNMATCHED)
    strictEqual(d.live, true)
    strictEqual(d.allInRate, 83)
    strictEqual(d.tradeDate.getDate(), 30)
    strictEqual(d.valueDate.getMonth(), 9)
  })

  it('shows the buy leg positive and the sell leg negative, lead currency first', () => {
    const d = dealOf()
    deepStrictEqual([d.buySell1, d.currency1, d.amount1], ['Buy', 'USD', 1000])
    deepStrictEqual([d.buySell2, d.currency2, d.amount2], ['Sell', 'INR', -83000])
    const sell = dealOf({ BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: 83000, SellAmount: 1000 })
    deepStrictEqual([sell.buySell1, sell.currency1, sell.amount1], ['Sell', 'USD', -1000])
    deepStrictEqual([sell.buySell2, sell.currency2, sell.amount2], ['Buy', 'INR', 83000])
  })

  it('takes the status from APP_STR TXN_STATUS, not from SAP', () => {
    strictEqual(dealOf().status, STATUS.UNMATCHED)
    strictEqual(dealOf({}, rec({ TxnStatus: '04' })).status, STATUS.CORRECTION)
    strictEqual(dealOf({}, rec({ TxnStatus: '06' })).status, STATUS.CORRECTED)
    strictEqual(dealOf({}, rec({ TxnStatus: '07' })).status, STATUS.MATCHED)
    strictEqual(dealOf({}, rec({ TxnStatus: '59' })).status, STATUS.MATCHED)
    strictEqual(dealOf({}, rec({ TxnStatus: '04' })).txnStatus, '04')
  })

  it('knows SAP already settled a deal whose workflow status is still open', () => {
    strictEqual(dealOf({ ActivityCategory: '30' }).settledInSap, true)
    strictEqual(dealOf({ ActivityCategory: '30' }).status, STATUS.UNMATCHED)
    strictEqual(dealOf().settledInSap, false)
  })

  it('carries the deal type, the trader and the NDF remarks from APP_STR', () => {
    const d = dealOf({ TransactionType: '631' }, rec({ ZtsfDealType: '00', Ztrcode: 'C27', NdfFoRem: 'fo', NdfMoRem: 'mo' }))
    strictEqual(d.dealTypeCode, '00')
    deepStrictEqual([d.traderCode, d.traderName], ['C27', 'C27 - Akshay Mohnot'])
    deepStrictEqual([d.foRemark, d.moRemark], ['fo', 'mo'])
    strictEqual(dealOf({}, rec({ NdfMoRem: 'x' })).moRemark, '', 'a plain forward shows no NDF remark')
  })

  it('takes the company details from the screen\'s own company table, blank when unknown', () => {
    strictEqual(dealOf().companyName, 'SG03 - Olam Global Agri Pte. Ltd.')
    strictEqual(dealOf({ CompanyCode: 'ZZ99' }).companyName, '')
  })

  it('leaves what the service does not carry blank instead of inventing it', () => {
    const d = dealOf()
    deepStrictEqual([d.traderCode, d.traderName, d.accounting, d.assignment, d.fixRefId, d.foRemark, d.moRemark], ['', '', '', '', '', '', ''])
    strictEqual(toDeal(sap())?.txnStatus, '', 'without an APP_STR record there is no workflow status')
  })

  it('names a transaction type the value help lacks by its bare code', () => {
    strictEqual(dealOf({ TransactionType: 'TT6' }).txnTypeDesc, 'TT6')
  })

  it('leaves out a reversed deal and one without dates', () => {
    strictEqual(toDeal(sap({ ActiveStatus: '3' })), null)
    strictEqual(toDeal(sap({ ValueDate: null })), null)
    strictEqual(toDeal(sap({ ContractDate: '' })), null)
  })

  it('keys a deal by company and number, since a number repeats across companies', () => {
    strictEqual(dealKey('AE13', '3000000000000'), 'AE13-3000000000000')
    ok(dealOf().id !== dealOf({ CompanyCode: 'AE13' }).id)
  })
})

describe('talking to SAP', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('settles a deal with the bound Settle action', async () => {
    const calls: Array<{ url: string; method: string; body: string }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: decodeURIComponent(String(input)), method: init?.method ?? 'GET', body: String(init?.body ?? '') })
      return json(200, {})
    }) as typeof fetch
    await settleFxDeal('SG03', '1000000000001')
    strictEqual(calls.length, 1)
    strictEqual(calls[0]!.method, 'POST')
    strictEqual(
      calls[0]!.url,
      "/api/fx/FxTransaction(CompanyCode='SG03',FinancialTransaction='1000000000001')/com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.Settle",
    )
    strictEqual(calls[0]!.body, '{}')
  })

  it('reads the worklist from APP_STR (03/04/06, blotter date up to the day, the company codes) and joins it to SAP on BUKRS + RFHA', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = decodeURIComponent(String(input).replaceAll('+', ' '))
      if (u.includes('/api/trmfxapp/')) {
        urls.push(u)
        return json(200, {
          value: [
            rec(),
            rec({ FinancialTransaction: '2', TxnStatus: '06' }),
            rec({ CompanyCode: 'AE13', FinancialTransaction: '7000000000001', TxnStatus: '04' }),
            rec({ FinancialTransaction: '9', TxnStatus: '03' }),
          ],
        })
      }
      if (u.includes('/api/fx/')) {
        urls.push(u)
        return json(200, {
          value: [
            sap(),
            sap({ FinancialTransaction: '2', ActiveStatus: '3' }),
            sap({ CompanyCode: 'AE13', FinancialTransaction: '7000000000001' }),
          ],
        })
      }
      return json(200, { ok: true, rows: [] })
    }) as typeof fetch
    const deals = await loadFxDeals(new Date(2026, 9, 6), ['SG03', 'AE13'])
    deepStrictEqual(deals.map((d) => [d.coCode, d.transaction, d.txnStatus]), [['SG03', '7000000000001', '03'], ['AE13', '7000000000001', '04']])
    const appUrl = urls[0] ?? ''
    ok(appUrl.includes("TxnStatus eq '03'") && appUrl.includes("TxnStatus eq '04'") && appUrl.includes("TxnStatus eq '06'"))
    ok(appUrl.includes('BlotterDate le 2026-10-06'), 'up to the date, not equal to it')
    ok(appUrl.includes("CompanyCode eq 'SG03'") && appUrl.includes("CompanyCode eq 'AE13'"))
    ok(!appUrl.includes("'07'"))
  })

  it('reads nothing from SAP when APP_STR has nothing to review', async () => {
    let fxCalled = false
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input)
      if (u.includes('/api/fx/')) fxCalled = true
      return u.includes('/api/trmfxapp/') ? json(200, { value: [] }) : json(200, { ok: true, rows: [] })
    }) as typeof fetch
    deepStrictEqual(await loadFxDeals(new Date(2026, 9, 6), ['SG03']), [])
    strictEqual(fxCalled, false)
  })

  it('gives SAP\'s cause, not the generic BAPI message', () => {
    const e = new ApiError('BAPI processing was terminated', 400, {
      error: { details: [{ code: 'FTR0/005', message: 'Number range 70 in company code SG03 does not exist' }, { code: 'FTR0/161', message: 'BAPI processing was terminated' }] },
    })
    strictEqual(sapMessage(e), 'Number range 70 in company code SG03 does not exist')
    strictEqual(sapMessage(new Error('boom')), 'boom')
  })
})

describe('the Deal ID each transaction is on', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const rows = [
    { ZDEAL_ID: '7000000014', ZDEAL_STAT: '01', ZBUKRS1: 'SG03', ZRFHA1: '3000000000022', ZBUKRS2: 'SG03', ZRFHA2: '2000000000006' },
    { ZDEAL_ID: '7000000009', ZDEAL_STAT: '01', ZBUKRS1: 'SG03', ZRFHA1: '3000000000015', ZBUKRS2: 'SG03', ZRFHA2: '2000000000001' },
    { ZDEAL_ID: '7000000003', ZDEAL_STAT: '30', ZBUKRS1: 'SG03', ZRFHA1: '3000000000099' },
  ]

  it('maps each transaction on a Deal ID to that Deal ID, in any slot', () => {
    const m = dealIdsByTransaction(rows)
    strictEqual(m.get('SG03-3000000000022'), '7000000014')
    strictEqual(m.get('SG03-2000000000006'), '7000000014')
    strictEqual(m.get('SG03-2000000000001'), '7000000009')
    strictEqual(dealIdsByTransaction([{ ZDEAL_ID: '7', ZDEAL_STAT: '01', ZBUKRS5: 'AE13', ZRFHA5: '55' }]).get('AE13-55'), '7')
  })

  it('does not count a cancelled Deal ID, and leaves a transaction on no Deal ID blank', () => {
    const m = dealIdsByTransaction(rows)
    ok(!m.has('SG03-3000000000099'))
    strictEqual(toDeal(sap({ FinancialTransaction: '3000000000099' }), m)?.dealId, '')
  })

  it('shows the real Deal ID in the deal, and keeps the row key separate', () => {
    const d = toDeal(sap({ FinancialTransaction: '3000000000022' }), dealIdsByTransaction(rows))
    strictEqual(d?.dealId, '7000000014')
    strictEqual(d?.id, 'SG03-3000000000022')
  })

  it('shows the first Deal ID a transaction was given when it is on two, whatever order the rows come in', () => {
    const twice = [{ ZDEAL_ID: '7000000020', ZDEAL_STAT: '01', ZBUKRS1: 'SG03', ZRFHA1: '5' }, { ZDEAL_ID: '7000000010', ZDEAL_STAT: '01', ZBUKRS1: 'SG03', ZRFHA1: '5' }]
    strictEqual(dealIdsByTransaction(twice).get('SG03-5'), '7000000010')
    strictEqual(dealIdsByTransaction([...twice].reverse()).get('SG03-5'), '7000000010')
  })

  it('reads the Deal IDs when it loads the queue', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = decodeURIComponent(String(input))
      if (u.includes('/api/trmfxapp/')) return json(200, { value: [rec({ FinancialTransaction: '3000000000022' })] })
      if (u.includes('/api/fx/')) return json(200, { value: [sap({ FinancialTransaction: '3000000000022' })] })
      return json(200, { ok: true, rows })
    }) as typeof fetch
    try {
      const [d] = await loadFxDeals(new Date(2026, 9, 6), ['SG03'])
      strictEqual(d?.dealId, '7000000014')
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('the queue', () => {
  const selection: AppliedSelection = { upTo: new Date(2026, 9, 6), companyCode: '', companyCodeTo: '', trader: '', displayType: 'FX' }

  it('starts without any FX rows: only the Options sample data', () => {
    const start = withoutFxDeals(generateDeals())
    ok(start.length > 0)
    ok(start.every((d) => d.dealType === 'Options'))
  })

  it('replaces the FX rows with the SAP ones and keeps the Options rows', () => {
    const options = withoutFxDeals(generateDeals())
    const merged = mergeLiveDeals(options, [dealOf(), dealOf({ FinancialTransaction: '2' })])
    strictEqual(merged.filter((d) => d.dealType === 'FX').length, 2)
    strictEqual(merged.filter((d) => d.dealType === 'Options').length, options.length)
    ok(merged.filter((d) => d.dealType === 'FX').every((d) => d.live))
    const again = mergeLiveDeals(merged, [dealOf()])
    strictEqual(again.filter((d) => d.dealType === 'FX').length, 1)
  })

  it('takes the status from the backend on every load; nothing is carried over from the session', () => {
    const sentBack = { ...dealOf(), status: STATUS.CORRECTION, txnStatus: '04', moRemark: 'Wrong value date' }
    const merged = mergeLiveDeals([sentBack], [dealOf()])
    strictEqual(merged[0]!.txnStatus, '03')
    strictEqual(merged[0]!.status, STATUS.UNMATCHED)
  })

  it('shows a deal sent to FO (04) and a corrected one (06), but not one matched and released (07) or offset (59)', () => {
    const rows = filterDeals(
      [
        dealOf({ FinancialTransaction: '1' }, rec({ FinancialTransaction: '1', TxnStatus: '04' })),
        dealOf({ FinancialTransaction: '2' }, rec({ FinancialTransaction: '2', TxnStatus: '06' })),
        dealOf({ FinancialTransaction: '3' }, rec({ FinancialTransaction: '3', TxnStatus: '07' })),
        dealOf({ FinancialTransaction: '4' }, rec({ FinancialTransaction: '4', TxnStatus: '59' })),
      ],
      selection,
      EMPTY_FILTERS,
      '',
      { key: null, dir: 'asc' },
    )
    deepStrictEqual(rows.map((d) => d.transaction), ['1', '2'])
  })

  it('flags the Deal IDs over their limit from ZOVER_UTL', () => {
    deepStrictEqual([...overUtilisedDealIds([{ ZDEAL_ID: '7', ZOVER_UTL: 'X' }, { ZDEAL_ID: '8', ZOVER_UTL: '' }])], ['7'])
    const d = toDeal(sap(), new Map([['SG03-7000000000001', '7']]), rec(), new Set(['7']))
    strictEqual(d?.overUtilised, true)
  })

  it('does not hide a SAP deal that has no trader when one is chosen, but narrows the rest', () => {
    const dummy = withoutFxDeals(generateDeals())
    const options = { ...selection, displayType: 'Options' as const, trader: dummy[0]!.traderCode }
    const optionRows = filterDeals([...dummy, dealOf()], options, EMPTY_FILTERS, '', { key: null, dir: 'asc' })
    ok(optionRows.every((d) => d.traderCode === options.trader))
    const noTrader = dealOf({ FinancialTransaction: '1' })
    const c27 = dealOf({ FinancialTransaction: '2' }, rec({ FinancialTransaction: '2', Ztrcode: 'C27' }))
    const c33 = dealOf({ FinancialTransaction: '3' }, rec({ FinancialTransaction: '3', Ztrcode: 'C33' }))
    const fxRows = filterDeals([noTrader, c27, c33], { ...selection, trader: 'C27' }, EMPTY_FILTERS, '', { key: null, dir: 'asc' })
    deepStrictEqual(fxRows.map((d) => d.transaction), ['1', '2'])
  })
})
