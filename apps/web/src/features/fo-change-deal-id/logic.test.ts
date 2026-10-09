import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PREMIUMS, seedDeals } from './data.ts'
import { fmtAmt, fmtRate, recordCount } from './format.ts'
import {
  buildPlTable,
  cancelDeal,
  isDealOpen,
  isMcChangeBlocked,
  legStatus,
  loadDeal,
  NEW_RFHA_REQUIRED_MSG,
  parseExRate,
  premiumFields,
  recalculateInvoices,
  searchDeals,
  setExRate,
  showsInvoicePl,
  statusMeta,
  summaryFields,
  updateDealPair,
  updateMcRef,
  validateNewRfha,
} from './logic.ts'
import type { Deal } from './types.ts'

const deal = (id: string): Deal => {
  const d = loadDeal(seedDeals(), id)
  if (!d) throw new Error(`no deal ${id}`)
  return d
}

describe('format', () => {
  it('formats amounts like the page', () => {
    strictEqual(fmtAmt(9000000), '9,000,000.00')
    strictEqual(fmtAmt(-360.5), '-360.50')
    strictEqual(fmtAmt(0), '0.00')
    strictEqual(fmtAmt(''), '')
    strictEqual(fmtAmt(undefined), '')
  })
  it('blanks zero or missing rates', () => {
    strictEqual(fmtRate(90.2), '90.2000')
    strictEqual(fmtRate(-0.2), '-0.2000')
    strictEqual(fmtRate(0), '')
    strictEqual(fmtRate(''), '')
  })
  it('pluralises record counts', () => {
    strictEqual(recordCount(1), '1 record')
    strictEqual(recordCount(2), '2 records')
    strictEqual(recordCount(0), '0 records')
  })
})

describe('status', () => {
  it('maps known codes and falls back to a gray pill', () => {
    deepStrictEqual(statusMeta('01'), { label: '01 – Open', css: 'pill-blue' })
    deepStrictEqual(statusMeta('99'), { label: '99', css: 'pill-gray' })
  })
  it('shows legs 02 and 03 as Confirmed, anything else Open', () => {
    const r = deal('3000045210').top[0]!
    strictEqual(legStatus({ ...r, txnStatus: '02' }), '02')
    strictEqual(legStatus({ ...r, txnStatus: '03' }), '02')
    strictEqual(legStatus({ ...r, txnStatus: '01' }), '01')
  })
  it('only status 01 is open; status 30 hides the invoice plan and P&L', () => {
    strictEqual(isDealOpen(deal('3000045210')), true)
    strictEqual(isDealOpen(deal('3000045211')), false)
    strictEqual(showsInvoicePl(deal('3000045213')), false)
    strictEqual(showsInvoicePl(deal('3000045212')), true)
  })
})

describe('searchDeals', () => {
  const store = seedDeals()
  it('lists the first six deals for an empty term', () => {
    strictEqual(searchDeals(store, '  ').length, 5)
  })
  it('matches Deal ID, entity string, trader and MC ref, case-insensitively', () => {
    deepStrictEqual(searchDeals(store, '45213').map((d) => d.dealId), ['3000045213'])
    deepStrictEqual(searchDeals(store, 'ogA-dmcc-otl').map((d) => d.dealId), ['3000045211', '3000045214'])
    deepStrictEqual(searchDeals(store, 'kenji').map((d) => d.dealId), ['3000045213'])
    deepStrictEqual(searchDeals(store, '2000002699').map((d) => d.dealId), ['3000045212'])
    strictEqual(searchDeals(store, 'nothing').length, 0)
  })
})

describe('store updates', () => {
  it('loads a private copy', () => {
    const store = seedDeals()
    const d = loadDeal(store, '3000045210')!
    d.top[0]!.rfha = 'X'
    strictEqual(store['3000045210']!.top[0]!.rfha, '5000123401')
    strictEqual(loadDeal(store, 'nope'), null)
  })
  it('cancels, re-points the MC and updates a deal pair with the matched marker', () => {
    let store = seedDeals()
    store = cancelDeal(store, '3000045210')
    strictEqual(store['3000045210']!.status, '30')
    store = updateMcRef(store, '3000045210', '2000002716', 'OSIPL_Multi-Commodity')
    strictEqual(store['3000045210']!.mcRef, '2000002716')
    store = updateDealPair(store, '3000045210', 1, '5000999999')
    deepStrictEqual(
      store['3000045210']!.top.map((r) => [r.rfha, r.color]),
      [
        ['5000123401', ''],
        ['5000999999', 'C500'],
      ],
    )
  })
})

describe('MC change rule', () => {
  it('blocks while any leg is neither matched nor status 03', () => {
    strictEqual(isMcChangeBlocked(deal('3000045210')), true)
    strictEqual(isMcChangeBlocked(deal('3000045211')), false)
    const d = deal('3000045214')
    strictEqual(isMcChangeBlocked({ ...d, top: d.top.map((r) => ({ ...r, color: 'C500' })) }), false)
  })
})

describe('Edit Deal Pair validation', () => {
  it('requires a trimmed transaction number', () => {
    deepStrictEqual(validateNewRfha('   '), { ok: false, error: NEW_RFHA_REQUIRED_MSG })
    deepStrictEqual(validateNewRfha(' 5000123499 '), { ok: true, value: '5000123499' })
  })
})

describe('invoice plan', () => {
  it('parses exchange rates as parseFloat || 0', () => {
    strictEqual(parseExRate('91.5'), 91.5)
    strictEqual(parseExRate(''), 0)
    strictEqual(parseExRate('abc'), 0)
    strictEqual(parseExRate('94.123456'), 94.1235)
  })
  it('recalculates invoice amounts from the edited rate', () => {
    const d = deal('3000045211')
    strictEqual(d.inv[0]!.invAmt, 2974950)
    const inv = recalculateInvoices(setExRate(d.inv, 0, '91'))
    strictEqual(inv[0]!.exRate, 91)
    strictEqual(inv[0]!.invAmt, 33055 * 91)
  })
})

describe('P&L', () => {
  it('builds one column per invoice leg with the mock factors', () => {
    const t = buildPlTable(deal('3000045210').inv)
    if (t.empty) throw new Error('expected data')
    deepStrictEqual(t.headers, ['OGA-USD Amt', 'DMCC-INR Amt'])
    deepStrictEqual(
      t.rows.map((r) => [r.label, r.cells[0]!.text]),
      [
        ['NDF Fixing-Profit Adj', '108,000.00'],
        ['Option Premium Income', '54,000.00'],
        ['Option Premium Expense', '-36,000.00'],
        ['P&L Orign(%)', '72,000.00'],
      ],
    )
    strictEqual(t.rows[2]!.cells[0]!.negative, true)
    strictEqual(t.totals[0]!.text, '198,000.00')
    strictEqual(t.totals[0]!.negative, false)
    strictEqual(t.count, 4)
  })
  it('is empty without invoice legs', () => {
    deepStrictEqual(buildPlTable([]), { empty: true })
  })
})

describe('field grids', () => {
  it('summarises the deal with the trader label', () => {
    const f = summaryFields(deal('3000045211'))
    strictEqual(f.length, 12)
    deepStrictEqual(f[8], ['Model Description', 'INR – INR Staggered Call & Put Option'])
    deepStrictEqual(f[11], ['Trader', 'T02 – Alicia Fernandes'])
  })
  it('formats the premium adjustment', () => {
    const f = premiumFields(PREMIUMS['3000045213'])
    deepStrictEqual(f[0], ['Deal Value', '44,758.00 USD'])
    deepStrictEqual(f[2], ['RBI Rate', '0.0000'])
    deepStrictEqual(f[3], ['RBI Date', '–'])
    deepStrictEqual(premiumFields(PREMIUMS['3000045214'])[5], ['Net Premium per USD', '1.2080'])
  })
})
