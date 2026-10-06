import { deepStrictEqual, ok, rejects, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { companyFilter, dmyOf, fetchNdfDeal, isNdfProduct, loadNdfDeals, settleNdfDeal, toNdfDeal, tradersOf } from './api.ts'
import { STATUS } from './data.ts'
import { amountText, formatAmount, formatDMY, parseDMY } from './format.ts'
import {
  EMPTY_FILTERS,
  applyFilterPanel,
  canMatchRelease,
  computeResults,
  countActiveFilters,
  distinctOptions,
  filterByCriteria,
  filterDropdownItems,
  isValidDMY,
  nextSort,
  pageOf,
  pagerWindow,
  parseAmountInput,
  resultsMeta,
  searchDeals,
  sortDeals,
  statusClass,
  unappliedCriteria,
  validateSelection,
} from './logic.ts'
import type { NdfDeal, Selection } from './types.ts'

const SEL: Selection = { companyCode: 'SG03', companyCodeTo: '', fixingDate: '30-10-2026', ndfValue: '', trader: '' }

const sap = (over: Partial<FxTransaction> = {}): FxTransaction => ({
  CompanyCode: 'SG03',
  FinancialTransaction: '7000000000001',
  ProductType: '12D',
  TransactionType: '631',
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

const deal = (over: Partial<FxTransaction> = {}): NdfDeal => {
  const d = toNdfDeal(sap(over))
  ok(d)
  return d
}
const ids = (list: NdfDeal[]) => list.map((d) => d.id)

describe('format', () => {
  it('formats amounts and dates like the page', () => {
    strictEqual(formatAmount(1234567.891), '1,234,567.89')
    strictEqual(formatDMY(new Date(2027, 8, 5)), '05-09-2027')
    strictEqual(parseDMY('28-09-2027').getTime(), new Date(2027, 8, 28).getTime())
    strictEqual(amountText(null), '')
    strictEqual(amountText(5), '5.00')
  })
})

describe('inputs', () => {
  it('reads the K / M / CR NDF Value shorthand', () => {
    strictEqual(parseAmountInput('250k'), 250_000)
    strictEqual(parseAmountInput('2cr'), 20_000_000)
    strictEqual(parseAmountInput('abc'), null)
  })

  it('accepts only real dd-mm-yyyy dates', () => {
    ok(isValidDMY('29-02-2028'))
    ok(!isValidDMY('29-02-2027'))
    ok(!isValidDMY('2027-09-01'))
  })

  it('validates the Basic Selection with the page messages', () => {
    deepStrictEqual(validateSelection({ ...SEL, companyCode: ' ', fixingDate: '' }), {
      companyCode: 'Company Code is required.',
      fixingDate: 'Fixing Date is required.',
    })
    deepStrictEqual(validateSelection(SEL), { companyCode: null, fixingDate: null })
  })

  it('filters dropdown items on either line, ignoring case', () => {
    const items = [{ primary: 'C27 - Akshay Mohnot' }, { primary: 'SG03', secondary: 'Singapore' }]
    deepStrictEqual(filterDropdownItems(items, 'akshay'), [items[0]])
    strictEqual(filterDropdownItems(items, '  ').length, 2)
  })
})

describe('toNdfDeal', () => {
  it('maps an NDF transaction and leaves what SAP does not provide blank', () => {
    const d = deal()
    strictEqual(d.id, 'SG03-7000000000001')
    strictEqual(d.coCode, 'SG03')
    strictEqual(d.currency1, 'USD')
    strictEqual(d.amount1, 1000)
    strictEqual(d.currency2, 'INR')
    strictEqual(d.amount2, 83000)
    strictEqual(d.buySell2, 'Sell')
    strictEqual(d.allInRate, 83)
    strictEqual(d.tradeDate, '30-09-2026')
    strictEqual(d.valueDate, '30-10-2026')
    strictEqual(d.txnStatus, STATUS.UNMATCHED)
    for (const blank of [d.fixingDate, d.dealId, d.mcReference, d.trader, d.externalRef, d.foRemark, d.moRemark, d.busArea, d.tsfEntity]) strictEqual(blank, '')
    strictEqual(d.ndfValue, null)
  })

  it('reads a sold lead currency the other way round', () => {
    const d = deal({ BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: 83000, SellAmount: 1000 })
    strictEqual(d.buySell2, 'Buy')
    strictEqual(d.amount1, 1000)
    strictEqual(d.amount2, 83000)
  })

  it('shows the activity category as the status', () => {
    strictEqual(deal({ ActivityCategory: '30' }).txnStatus, STATUS.RELEASED)
  })

  it('names the partner and transaction type when the lookups answered, else keeps the codes', () => {
    const named = toNdfDeal(sap(), { partners: new Map([['400000002', 'DBS BANK LTD']]), txnTypes: new Map([['12D/631', 'NDF-TSF']]) })
    strictEqual(named?.partnerName, 'DBS BANK LTD')
    strictEqual(named?.txnTypeDesc, '631 - NDF-TSF')
    strictEqual(deal().partnerName, '400000002')
    strictEqual(deal().txnTypeDesc, '631')
  })

  it('drops reversed, non-NDF and undated transactions', () => {
    strictEqual(toNdfDeal(sap({ ActiveStatus: '3' })), null)
    strictEqual(toNdfDeal(sap({ ProductType: '12B' })), null)
    strictEqual(toNdfDeal(sap({ ValueDate: null })), null)
    ok(isNdfProduct('12D') && !isNdfProduct('12F') && !isNdfProduct(undefined))
    strictEqual(dmyOf('0000-00-00'), '')
  })
})

describe('traders and company filter', () => {
  it('reads ZSGTRMTR_TRADER as one row per code, sorted, named from ZNAME else ZTRADER', () => {
    deepStrictEqual(
      tradersOf([
        { ZTCODE: 'C33', ZTRADER: 'Pooja P', ZNAME: 'Pooja Pednekar' },
        { ZTCODE: 'C27', ZTRADER: 'Akshay M', ZNAME: '' },
        { ZTCODE: 'C27', ZTRADER: 'dup', ZNAME: 'dup' },
        { ZTCODE: '', ZTRADER: 'none' },
      ]),
      [
        { code: 'C27', name: 'Akshay M' },
        { code: 'C33', name: 'Pooja Pednekar' },
      ],
    )
  })

  it('filters one company code, or a range', () => {
    strictEqual(companyFilter(' sg03 ', ''), "CompanyCode eq 'SG03'")
    strictEqual(companyFilter('AE11', 'SG03'), "CompanyCode ge 'AE11' and CompanyCode le 'SG03'")
  })
})

describe('selection, filters, search and sort', () => {
  const a = deal({ FinancialTransaction: '1', ForwardRate: 83 })
  const b = deal({ FinancialTransaction: '2', ValueDate: '2026-11-02', ForwardRate: 80, CompanyCode: 'AE11', ActivityCategory: '30' })
  const all = [a, b]

  it('matches the Fixing Date against the value date and the company code (any case)', () => {
    deepStrictEqual(ids(filterByCriteria(all, SEL)), [a.id])
    deepStrictEqual(ids(filterByCriteria(all, { ...SEL, companyCode: 'sg03' })), [a.id])
    deepStrictEqual(ids(filterByCriteria(all, { ...SEL, companyCode: 'AE11', companyCodeTo: 'SG03', fixingDate: '' })), ids(all))
  })

  it('does not apply Trader or NDF Value, and says so', () => {
    deepStrictEqual(ids(filterByCriteria(all, { ...SEL, trader: 'C27', ndfValue: '5M' })), [a.id])
    deepStrictEqual(unappliedCriteria({ ...SEL, trader: 'C27', ndfValue: '5M' }), ['Trader Name', 'NDF Value'])
    deepStrictEqual(unappliedCriteria(SEL), [])
  })

  it('applies the filter panel and counts the active selects', () => {
    deepStrictEqual(ids(applyFilterPanel(all, { ...EMPTY_FILTERS, companyCode: 'AE11' })), [b.id])
    strictEqual(countActiveFilters({ ...EMPTY_FILTERS, status: STATUS.RELEASED, companyCode: 'AE11' }), 2)
    deepStrictEqual(distinctOptions(all, 'coCode'), ['AE11', 'SG03'])
    deepStrictEqual(distinctOptions(all, 'trader'), [])
  })

  it('searches the listed fields, ignoring case', () => {
    deepStrictEqual(ids(searchDeals(all, '400000002')), ids(all))
    strictEqual(searchDeals(all, 'zzz').length, 0)
  })

  it('sorts numbers, dates and text, with blank values first', () => {
    deepStrictEqual(ids(sortDeals(all, { field: 'allInRate', dir: 'asc' })), [b.id, a.id])
    deepStrictEqual(ids(sortDeals(all, { field: 'valueDate', dir: 'desc' })), [b.id, a.id])
    deepStrictEqual(ids(sortDeals(all, { field: 'ndfValue', dir: 'asc' })), ids(all))
    deepStrictEqual(ids(sortDeals(all, { field: 'fixingDate', dir: 'asc' })), ids(all))
    deepStrictEqual(nextSort({ field: 'dealId', dir: 'asc' }, 'dealId'), { field: 'dealId', dir: 'desc' })
    deepStrictEqual(nextSort({ field: 'dealId', dir: 'desc' }, 'trader'), { field: 'trader', dir: 'asc' })
  })

  it('computes the list from the selection, filters, search and sort', () => {
    deepStrictEqual(ids(computeResults(all, SEL, EMPTY_FILTERS, '', { field: null, dir: 'asc' })), [a.id])
  })

  it('lets Match & Release run only on a deal that is not already released', () => {
    ok(canMatchRelease(a))
    ok(!canMatchRelease(b))
    ok(!canMatchRelease(null))
    strictEqual(statusClass(b.txnStatus), 'status-released')
  })
})

describe('paging', () => {
  const rows = Array.from({ length: 60 }, (_, i) => deal({ FinancialTransaction: String(i) }))

  it('slices the page and pulls a page past the end back', () => {
    const p = pageOf(rows, 2, 20)
    deepStrictEqual(ids(p.rows), ids(rows.slice(20, 40)))
    strictEqual(p.totalPages, 3)
    strictEqual(pageOf(rows, 9, 50).page, 2)
    strictEqual(resultsMeta(rows.length, p), 'Showing 21–40 of 60 deals')
    strictEqual(resultsMeta(0, null), 'Showing 0 of 0 deals')
  })

  it('shows up to five page buttons around the current page', () => {
    deepStrictEqual(pagerWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pagerWindow(6, 9), [4, 5, 6, 7, 8])
  })
})

describe('SAP calls', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const decode = (input: RequestInfo | URL) => decodeURIComponent(String(input).replaceAll('+', ' '))

  it('reads the NDF transactions of the company code and drops reversed and non-NDF ones', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = decode(input)
      urls.push(u)
      if (u.includes('/api/fx/FxTransaction'))
        return json(200, {
          value: [
            sap({ FinancialTransaction: '1' }),
            sap({ FinancialTransaction: '2', ProductType: '12B' }),
            sap({ FinancialTransaction: '3', ActiveStatus: '3' }),
          ],
        })
      if (u.includes('TransactionType')) return json(200, { value: [{ ProductType: '12D', TransactionType: '631', TransactionTypeName: 'NDF-TSF' }] })
      return json(200, { d: { results: [{ BusinessPartner: '400000002', BusinessPartnerFullName: 'DBS BANK LTD' }] } })
    }) as typeof fetch
    const out = await loadNdfDeals({ from: 'sg03', to: '' })
    deepStrictEqual(ids(out), ['SG03-1'])
    strictEqual(out[0]?.partnerName, 'DBS BANK LTD')
    strictEqual(out[0]?.txnTypeDesc, '631 - NDF-TSF')
    ok(urls[0]?.includes("$filter=CompanyCode eq 'SG03'"))
  })

  it('still lists the deals when the name lookups fail', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      decode(input).includes('/api/fx/FxTransaction') ? json(200, { value: [sap()] }) : json(500, { error: { message: 'down' } })) as typeof fetch
    const out = await loadNdfDeals({ from: 'SG03', to: '' })
    strictEqual(out.length, 1)
    strictEqual(out[0]?.partnerName, '400000002')
  })

  it('settles with the bound Settle action and reads the transaction back', async () => {
    const calls: Array<{ url: string; method: string }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: decode(input), method: init?.method ?? 'GET' })
      return json(200, { value: [sap({ ActivityCategory: '30' })] })
    }) as typeof fetch
    await settleNdfDeal('SG03', '7000000000001')
    strictEqual(calls[0]?.method, 'POST')
    ok(calls[0]?.url.endsWith("(CompanyCode='SG03',FinancialTransaction='7000000000001')/com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.Settle"))
    const fresh = await fetchNdfDeal('SG03', '7000000000001')
    strictEqual(fresh?.txnStatus, STATUS.RELEASED)
  })

  it('surfaces a refused settlement instead of reporting success', async () => {
    globalThis.fetch = (async () => json(400, { error: { message: 'x', details: [{ code: 'FTR0/007', message: 'Not yet due for settlement' }] } })) as typeof fetch
    await rejects(() => settleNdfDeal('SG03', '1'))
  })
})
