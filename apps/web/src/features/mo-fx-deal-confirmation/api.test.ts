import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ApiError } from '@slc/api-client'
import { dealKey, loadFxDeals, sapMessage, settleFxDeal, settleFxDeals, toDeal, type FxTransaction } from './api.ts'
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

const dealOf = (over: Partial<FxTransaction> = {}): Deal => {
  const d = toDeal(sap(over))
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

  it('reads activity category 30 as already Matched & Released', () => {
    strictEqual(dealOf({ ActivityCategory: '30' }).status, STATUS.MATCHED)
  })

  it('takes the company details from the screen\'s own company table, blank when unknown', () => {
    strictEqual(dealOf().companyName, 'SG03 - Olam Global Agri Pte. Ltd.')
    strictEqual(dealOf({ CompanyCode: 'ZZ99' }).companyName, '')
  })

  it('leaves what the service does not carry blank instead of inventing it', () => {
    const d = dealOf()
    deepStrictEqual([d.traderCode, d.traderName, d.accounting, d.assignment, d.fixRefId, d.foRemark, d.moRemark], ['', '', '', '', '', '', ''])
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

  it('settles the deals in order and stops at the first refusal, reporting why', async () => {
    const order: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input))
      order.push(/FinancialTransaction='(\d+)'/.exec(url)?.[1] ?? '?')
      if (url.includes("'2'")) {
        return json(400, {
          error: {
            message: 'BAPI processing was terminated',
            details: [
              { code: 'FTR0/007', message: 'Transaction is not yet due for settlement' },
              { code: 'FTR0/161', message: 'BAPI processing was terminated' },
            ],
          },
        })
      }
      return json(200, {})
    }) as typeof fetch
    const deals = ['1', '2', '3'].map((n) => dealOf({ FinancialTransaction: n }))
    const out = await settleFxDeals(deals)
    deepStrictEqual(order, ['1', '2'])
    deepStrictEqual(out.settled, ['SG03-1'])
    deepStrictEqual(out.failed, { id: 'SG03-2', reason: 'Transaction is not yet due for settlement' })
  })

  it('reports everything settled when SAP accepts every deal', async () => {
    globalThis.fetch = (async () => json(200, {})) as typeof fetch
    const out = await settleFxDeals([dealOf({ FinancialTransaction: '1' }), dealOf({ FinancialTransaction: '2' })])
    deepStrictEqual(out, { settled: ['SG03-1', 'SG03-2'] })
  })

  it('reads the FX deals of the screen\'s company codes and drops reversed ones', async () => {
    let url = ''
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      url = decodeURIComponent(String(input).replaceAll('+', ' '))
      return json(200, { value: [sap(), sap({ FinancialTransaction: '2', ActiveStatus: '3' }), sap({ FinancialTransaction: '3', ActivityCategory: '30' })] })
    }) as typeof fetch
    const deals = await loadFxDeals()
    deepStrictEqual(deals.map((d) => d.transaction), ['7000000000001', '3'])
    for (const c of ['SG03', 'AE13', 'AE11']) ok(url.includes(`CompanyCode eq '${c}'`))
  })

  it('gives SAP\'s cause, not the generic BAPI message', () => {
    const e = new ApiError('BAPI processing was terminated', 400, {
      error: { details: [{ code: 'FTR0/005', message: 'Number range 70 in company code SG03 does not exist' }, { code: 'FTR0/161', message: 'BAPI processing was terminated' }] },
    })
    strictEqual(sapMessage(e), 'Number range 70 in company code SG03 does not exist')
    strictEqual(sapMessage(new Error('boom')), 'boom')
  })
})

describe('the queue', () => {
  const selection: AppliedSelection = { companyCode: '', companyCodeTo: '', trader: '', displayType: 'FX' }

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

  it('keeps a deal sent back for correction in Correction Required while SAP still has it unmatched', () => {
    const sentBack = { ...dealOf(), status: STATUS.CORRECTION, moRemark: 'Wrong value date' }
    const merged = mergeLiveDeals([sentBack], [dealOf()])
    strictEqual(merged[0]!.status, STATUS.CORRECTION)
    strictEqual(merged[0]!.moRemark, 'Wrong value date')
  })

  it('lets SAP win once the deal is settled there', () => {
    const sentBack = { ...dealOf(), status: STATUS.CORRECTION, moRemark: 'x' }
    strictEqual(mergeLiveDeals([sentBack], [dealOf({ ActivityCategory: '30' })])[0]!.status, STATUS.MATCHED)
  })

  it('does not show a Matched & Released deal in the queue', () => {
    const rows = filterDeals([dealOf(), dealOf({ FinancialTransaction: '2', ActivityCategory: '30' })], selection, EMPTY_FILTERS, '', { key: null, dir: 'asc' })
    deepStrictEqual(rows.map((d) => d.transaction), ['7000000000001'])
  })

  it('does not hide a SAP deal when a trader is chosen, but still narrows the sample rows', () => {
    const dummy = withoutFxDeals(generateDeals())
    const options = { ...selection, displayType: 'Options' as const, trader: dummy[0]!.traderCode }
    const optionRows = filterDeals([...dummy, dealOf()], options, EMPTY_FILTERS, '', { key: null, dir: 'asc' })
    ok(optionRows.every((d) => d.traderCode === options.trader))
    const fxRows = filterDeals([...dummy, dealOf()], { ...selection, trader: 'C27' }, EMPTY_FILTERS, '', { key: null, dir: 'asc' })
    deepStrictEqual(fxRows.map((d) => d.transaction), ['7000000000001'])
  })
})
