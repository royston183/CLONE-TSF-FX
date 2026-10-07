import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ndfRecord, type FxTransaction } from '../../shared/fx/ndf.ts'
import { dealFromRecord } from './api.ts'
import { formatAmount, formatDMY, parseDMY } from './format.ts'
import {
  EMPTY_FILTERS,
  applyFilterPanel,
  computeResults,
  countActiveFilters,
  filterByCriteria,
  filterDropdownItems,
  isValidDMY,
  filterPanelOptions,
  nextSort,
  pageOf,
  pagerWindow,
  parseAmountInput,
  resultsMeta,
  searchDeals,
  sortDeals,
  statusClass,
  validateSelection,
} from './logic.ts'
import type { NdfDeal, Selection } from './types.ts'

const SEL: Selection = { companyCode: 'SG03', companyCodeTo: '', fixingDate: '28-09-2027', ndfValue: '', trader: '' }
const ids = (list: NdfDeal[]) => list.map((d) => d.id)
const find = (list: NdfDeal[], id: string) => {
  const d = list.find((x) => x.id === id)
  if (!d) throw new Error(`no deal ${id}`)
  return d
}

/* Four NDF deals shaped as SAP serves them (FxTransaction + TrmFxApp + ZSGTSFV_FX), through the screen's mapping. */
const fx = (rfha: string, o: Partial<FxTransaction> = {}): FxTransaction => ({
  CompanyCode: 'SG03',
  FinancialTransaction: rfha,
  ProductType: '12D',
  TransactionType: '631',
  Partner: '400000002',
  ContractDate: '2026-10-01',
  BuyCurrency: 'USD',
  SellCurrency: 'INR',
  LeadCurrency: 'USD',
  FollowCurrency: 'INR',
  BuyAmount: 10000,
  SellAmount: 900000,
  ValueDate: '2027-09-28',
  ForwardRate: 90,
  ActiveStatus: '0',
  ...o,
})
const TEXTS = { '10': 'FO: NDF Fixing - pending MO confirmation', '12': 'FO: NDF Fixing Corrected' }
const mk = (f: FxTransaction, status: string, trader: string, view: Record<string, string> = {}) =>
  dealFromRecord(
    ndfRecord(
      f,
      { CompanyCode: f.CompanyCode, FinancialTransaction: f.FinancialTransaction, TxnStatus: status, Ztrcode: trader, ZtsfDealID: `D${f.FinancialTransaction}` },
      { BUKRS: f.CompanyCode, RFHA: f.FinancialTransaction, ...view },
    ),
    { C27: 'Akshay Mohnot', C14: 'Ashon V' },
    TEXTS,
    new Set(['SG03|2000000000012']),
  )
const DEALS: NdfDeal[] = [
  mk(fx('2000000000011'), '10', 'C27', { BP_NAME: 'HSBC' }),
  mk(fx('2000000000012', { BuyAmount: 100000, SellAmount: 9000000, ContractDate: '2026-09-30' }), '12', 'C14', { BP_NAME: 'BARCLAYS BANK PLC' }),
  mk(fx('2000000000013', { CompanyCode: 'AE13', ValueDate: '2027-10-15' }), '10', 'C27', { BP_NAME: 'DBS BANK LTD' }),
  mk(fx('2000000000014', { CompanyCode: 'AE11', BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: 450000, SellAmount: 5000 }), '10', 'C14'),
]
const A = 'SG03|2000000000011'
const B = 'SG03|2000000000012'
const C = 'AE13|2000000000013'
const D = 'AE11|2000000000014'

describe('format', () => {
  it('formats amounts and dates like the page', () => {
    strictEqual(formatAmount(1234567.891), '1,234,567.89')
    strictEqual(formatAmount(5), '5.00')
    strictEqual(formatDMY(new Date(2027, 8, 5)), '05-09-2027')
    strictEqual(parseDMY('28-09-2027').getTime(), new Date(2027, 8, 28).getTime())
  })
})

describe('inputs', () => {
  it('reads the K / M / CR NDF Value shorthand', () => {
    strictEqual(parseAmountInput('250k'), 250_000)
    strictEqual(parseAmountInput('1.5M'), 1_500_000)
    strictEqual(parseAmountInput('2cr'), 20_000_000)
    strictEqual(parseAmountInput(' 1,250.50 '), 1250.5)
    strictEqual(parseAmountInput('abc'), null)
    strictEqual(parseAmountInput(''), null)
  })

  it('accepts only real dd-mm-yyyy dates', () => {
    ok(isValidDMY('29-02-2028'))
    ok(!isValidDMY('29-02-2027'))
    ok(!isValidDMY('31-04-2027'))
    ok(!isValidDMY('1-09-2027'))
    ok(!isValidDMY('2027-09-01'))
    ok(!isValidDMY('01-13-2027'))
  })

  it('validates the Basic Selection with the page messages', () => {
    deepStrictEqual(validateSelection({ ...SEL, companyCode: ' ', fixingDate: '' }), {
      companyCode: 'Company Code is required.',
      fixingDate: 'Fixing Date is required.',
    })
    deepStrictEqual(validateSelection({ ...SEL, fixingDate: '31-02-2027' }), {
      companyCode: null,
      fixingDate: 'Enter a valid date as dd-mm-yyyy.',
    })
    deepStrictEqual(validateSelection({ ...SEL, fixingDate: ' 28-09-2027 ' }), { companyCode: null, fixingDate: null })
  })

  it('filters dropdown items on either line, ignoring case', () => {
    const items = [{ primary: 'C27 - Akshay Mohnot' }, { primary: 'SG03', secondary: 'Singapore' }]
    deepStrictEqual(filterDropdownItems(items, 'akshay'), [items[0]])
    deepStrictEqual(filterDropdownItems(items, 'singa'), [items[1]])
    strictEqual(filterDropdownItems(items, '  ').length, 2)
    strictEqual(filterDropdownItems(items, 'zzz').length, 0)
  })
})

describe('dealFromRecord', () => {
  it('maps a queued deal: status label, trader name, Accounting from VTBFHAPO, no NDF value without a fixing', () => {
    const d = find(DEALS, B)
    deepStrictEqual(
      [d.transaction, d.txnStatus, d.statusCode, d.trader, d.accounting, d.ndfValue, d.tradeDate, d.fixingDate, d.dealId],
      ['2000000000012', '12 - FO: NDF Fixing Corrected', '12', 'Ashon V', 'Posted', 0, '30-09-2026', '28-09-2027', 'D2000000000012'],
    )
    strictEqual(find(DEALS, A).accounting, 'Not Posted')
    // CURR1 (USD) sold: amount 1 negative, and Buy/Sell 2 is the INR leg, bought.
    deepStrictEqual([find(DEALS, D).amount1, find(DEALS, D).buySell2], [-5000, 'Buy'])
  })
})

describe('filterByCriteria', () => {
  it('matches one company code (any case) and the fixing date', () => {
    deepStrictEqual(ids(filterByCriteria(DEALS, { ...SEL, companyCode: 'sg03' })), [A, B])
  })

  it('treats From / To as a text range', () => {
    const rows = filterByCriteria(DEALS, { ...SEL, companyCode: 'AE11', companyCodeTo: 'ae13', fixingDate: '' })
    deepStrictEqual([...new Set(rows.map((d) => d.coCode))].sort(), ['AE11', 'AE13'])
  })

  it('filters by trader code', () => {
    deepStrictEqual(ids(filterByCriteria(DEALS, { ...SEL, companyCode: '', fixingDate: '', trader: 'C14' })), [B, D])
  })
})

describe('filter panel, search and sort', () => {
  it('applies every non-empty select and counts them', () => {
    const f = { ...EMPTY_FILTERS, status: '10 - FO: NDF Fixing - pending MO confirmation', currency1: 'USD' }
    strictEqual(countActiveFilters(EMPTY_FILTERS), 0)
    strictEqual(countActiveFilters(f), 2)
    deepStrictEqual(ids(applyFilterPanel(DEALS, f)), [A, C, D])
    strictEqual(applyFilterPanel(DEALS, EMPTY_FILTERS).length, DEALS.length)
  })

  it('searches the listed fields, ignoring case', () => {
    deepStrictEqual(ids(searchDeals(DEALS, 'd2000000000013')), [C])
    deepStrictEqual(ids(searchDeals(DEALS, 'fixing CORRECTED')), [B])
    strictEqual(searchDeals(DEALS, '   ').length, DEALS.length)
  })

  it('sorts numbers, dates and text', () => {
    strictEqual(sortDeals(DEALS, { field: 'amount1', dir: 'desc' })[0]?.id, B)
    strictEqual(sortDeals(DEALS, { field: 'tradeDate', dir: 'asc' })[0]?.id, B)
    strictEqual(sortDeals(DEALS, { field: 'partnerName', dir: 'asc' })[0]?.partnerName, '400000002')
    strictEqual(sortDeals(DEALS, { field: null, dir: 'asc' }), DEALS)
  })

  it('flips the same column and starts a new one ascending', () => {
    deepStrictEqual(nextSort({ field: null, dir: 'asc' }, 'dealId'), { field: 'dealId', dir: 'asc' })
    deepStrictEqual(nextSort({ field: 'dealId', dir: 'asc' }, 'dealId'), { field: 'dealId', dir: 'desc' })
    deepStrictEqual(nextSort({ field: 'dealId', dir: 'desc' }, 'trader'), { field: 'trader', dir: 'asc' })
  })
})

describe('paging', () => {
  it('slices the page and pulls a page past the end back', () => {
    const p = pageOf(DEALS, 2, 3)
    deepStrictEqual(ids(p.rows), [D])
    strictEqual(p.totalPages, 2)
    strictEqual(pageOf(DEALS, 9, 3).page, 2)
    strictEqual(resultsMeta(DEALS.length, p), 'Showing 4–4 of 4 deals')
    strictEqual(resultsMeta(0, null), 'Showing 0 of 0 deals')
  })

  it('shows up to five page buttons around the current page', () => {
    deepStrictEqual(pagerWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pagerWindow(1, 9), [1, 2, 3, 4, 5])
    deepStrictEqual(pagerWindow(6, 9), [4, 5, 6, 7, 8])
    deepStrictEqual(pagerWindow(9, 9), [5, 6, 7, 8, 9])
  })
})

describe('statuses', () => {
  it('classes each TXN_STATUS', () => {
    strictEqual(statusClass('11'), 'status-correction')
    strictEqual(statusClass('12'), 'status-correction')
    strictEqual(statusClass('13'), 'status-released')
    strictEqual(statusClass('10'), 'status-unmatched')
  })

  it('offers the filter panel the distinct values of the deals read from SAP', () => {
    const opts = filterPanelOptions(DEALS)
    deepStrictEqual(opts.companyCode, ['AE11', 'AE13', 'SG03'])
    deepStrictEqual(opts.status, ['10 - FO: NDF Fixing - pending MO confirmation', '12 - FO: NDF Fixing Corrected'])
    const none = filterPanelOptions([])
    deepStrictEqual([none.companyCode, none.status], [[], []])
  })

  it('runs the whole selection, filter, search and sort', () => {
    deepStrictEqual(ids(computeResults(DEALS, SEL, new Set(), EMPTY_FILTERS, '', { field: 'transaction', dir: 'desc' })), [B, A])
  })
})
