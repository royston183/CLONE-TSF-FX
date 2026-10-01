import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_FILTERS, SEED_DEALS, freshData } from './data.ts'
import { dmyToIso, formatAmount, isoToDMY, kpiCompact, parseDMY, parseNum } from './format.ts'
import {
  buildNdoSpot,
  calcCashSettlement,
  calcNdfSettlement,
  computeKpis,
  createSpotTransaction,
  dateErrors,
  decideExercise,
  defaultFixingRate,
  fetchActionItems,
  fetchDeals,
  fetchTransactions,
  filterSortDeals,
  invoiceAmountFor,
  isAuthorized,
  leadCurr,
  marketRate,
  nextSort,
  recalcSpotAmounts,
  scaledRate,
  txnLinkClass,
  updateTxnStatus,
} from './logic.ts'
import type { Filters } from './types.ts'

const F: Filters = { ...DEFAULT_FILTERS }
const ids = (list: readonly { id: string }[]) => list.map((d) => d.id)
const txn = (rfha: string) => {
  const t = freshData().txns.find((x) => x.rfha === rfha)
  if (!t) throw new Error(`no txn ${rfha}`)
  return t
}
const deal = (id: string) => SEED_DEALS.find((d) => d.id === id)!
const near = (a: number, b: number, eps = 1e-6) => ok(Math.abs(a - b) < eps, `${a} != ${b}`)

describe('format', () => {
  it('parses and prints dd-mm-yyyy, rejecting impossible dates', () => {
    strictEqual(dmyToIso('01-09-2026'), '2026-09-01')
    strictEqual(isoToDMY('2026-10-15'), '15-10-2026')
    strictEqual(parseDMY('31-02-2026'), null)
    strictEqual(formatAmount(1234.5), '1,234.50')
    ok(isNaN(parseNum('abc')))
    strictEqual(kpiCompact(1_250_000), '1.25M')
  })
})

describe('FETCH_DEAL_DETAILS', () => {
  it('lists the default window without cancelled deals, keeping an old short straddle', () => {
    deepStrictEqual(ids(fetchDeals(SEED_DEALS, F)), [
      'DL26000101', 'DL26000102', 'DL26000103', 'DL26000104', 'DL26000105', 'DL26000106',
      'DL26000107', 'DL26000108', 'DL26000109', 'DL26000110', 'DL26000111', 'DL26000113',
    ])
  })

  it('applies model, status and deal filters, and returns nothing for a bad window', () => {
    deepStrictEqual(ids(fetchDeals(SEED_DEALS, { ...F, model: 'M032' })), ['DL26000101', 'DL26000109', 'DL26000113'])
    deepStrictEqual(ids(fetchDeals(SEED_DEALS, { ...F, status: '40' })), ['DL26000109'])
    deepStrictEqual(ids(fetchDeals(SEED_DEALS, { ...F, deal: 'DL26000114' })), [])
    deepStrictEqual(fetchDeals(SEED_DEALS, { ...F, from: '31-12-2026', to: '01-09-2026' }), [])
    deepStrictEqual(dateErrors({ from: '', to: '32-01-2026' }), { from: 'Required', to: 'Use dd-mm-yyyy' })
    deepStrictEqual(dateErrors({ from: '10-10-2026', to: '01-10-2026' }), { from: '', to: 'Before From date' })
  })

  it('searches every column and sorts numerically on amount columns', () => {
    deepStrictEqual(ids(filterSortDeals(SEED_DEALS, F, 'straddle', { field: 'id', dir: 'asc' })), [])
    deepStrictEqual(ids(filterSortDeals(SEED_DEALS, F, 'SS-0', { field: 'id', dir: 'asc' })), ['DL26000104', 'DL26000111'])
    const byAmt = filterSortDeals(SEED_DEALS, F, '', { field: 'mcAmt', dir: 'desc' })
    strictEqual(byAmt[0]!.mcAmt, 500000000)
    deepStrictEqual(nextSort({ field: 'id', dir: 'asc' }, 'id'), { field: 'id', dir: 'desc' })
  })
})

describe('transactions and action items', () => {
  const data = freshData()

  it('sorts by txn type and marks the straddle legs whose settlement spot is pending', () => {
    const rows = fetchTransactions(data, 'DL26000104')
    deepStrictEqual(rows.map((r) => r.rfha), ['1700004401', '1700004402', '1700004403'].sort((a, b) => (txn(a).sfhaart < txn(b).sfhaart ? -1 : 1)))
    const call = rows.find((r) => r.rfha === '1700004401')!
    strictEqual(call.sdPending, true)
    strictEqual(call.sdAmt, 10000)
    strictEqual(rows.find((r) => r.rfha === '1700004403')!.sdAmt, '')
  })

  it('checks company code authorisation and colours settled transactions', () => {
    strictEqual(isAuthorized(fetchTransactions(data, 'DL26000113')), false)
    strictEqual(isAuthorized(fetchTransactions(data, 'DL26000101')), true)
    const [fwd, spot] = fetchTransactions(data, 'DL26000109').sort((a, b) => (a.rfha < b.rfha ? -1 : 1))
    strictEqual(txnLinkClass(fwd!), 'cell-green') // status 30 > 07
    strictEqual(txnLinkClass(spot!), 'cell-green')
    strictEqual(txnLinkClass(fetchTransactions(data, 'DL26000101')[0]!), '')
  })

  it('short straddle: straddle texts, and the covered forward is done without a button', () => {
    const items = fetchActionItems(data, deal('DL26000104'), fetchTransactions(data, 'DL26000104'))
    const byRfha = Object.fromEntries(items.map((i) => [i.rfha, i]))
    strictEqual(byRfha['1700004401']!.text, 'Exercise or expire the straddle leg')
    strictEqual(byRfha['1700004401']!.state, 'pending')
    strictEqual(byRfha['1700004403']!.text, 'Create opposite spot for forward')
    strictEqual(byRfha['1700004403']!.state, 'done')
    strictEqual(byRfha['1700004403']!.button, false)
  })

  it('a deal whose spot exists is done; an expired option asks for a settlement spot', () => {
    strictEqual(fetchActionItems(data, deal('DL26000108'), fetchTransactions(data, 'DL26000108'))[0]!.state, 'done')
    const exp = fetchActionItems(data, deal('DL26000110'), fetchTransactions(data, 'DL26000110'))[0]!
    strictEqual(exp.text, 'Option expired – create settlement spot')
    strictEqual(exp.state, 'done') // status 34 > 07
  })
})

describe('calculations', () => {
  it('lead currency, market rate and the exercise decision', () => {
    deepStrictEqual(leadCurr('INR', 'USD'), { lead: 'USD', follow: 'INR' })
    deepStrictEqual(leadCurr('EUR', 'USD'), { lead: 'EUR', follow: 'USD' })
    strictEqual(marketRate(txn('1700004201')), 91.25) // first TCURR row on/after 20-10-2026
    strictEqual(decideExercise({ pc1: 'Call', strike: 90 }, 91.25), 'Exercise')
    strictEqual(decideExercise({ pc1: 'Put', strike: 86 }, 91.25), 'Expire')
    strictEqual(decideExercise({ pc1: 'Call', strike: 90 }, 0), '')
  })

  it('cash settlement of a USD-led call: |amt2 / rate - amt1|', () => {
    near(calcCashSettlement(txn('1700004301'), 94), Math.abs(93000000 / 94 - 1000000))
  })

  it('NDF settlement at the RBI fixing, and the VND scaling for a DNDF', () => {
    const ndf = txn('1700004501')
    strictEqual(defaultFixingRate(ndf), 95.8425)
    const r = calcNdfSettlement(ndf, 95.8425)
    near(r.ndf, 1000000 + -96200000 / 95.8425)
    strictEqual(r.scurr, 'USD')
    const dndf = txn('1700004601')
    strictEqual(scaledRate(dndf, 250), 25000)
    const d = calcNdfSettlement(dndf, 250)
    near(d.dndf, Math.abs(Math.abs(2500000000 * 100) - 100000 * 25000) / 100)
    strictEqual(defaultFixingRate(dndf), 0)
  })

  it('NDO spot defaults: from the invoice amount when one is saved, else from the option', () => {
    const data = freshData()
    const call = txn('1700004201')
    const inv = invoiceAmountFor(data, 'DL26000102', 'D1')
    const s = buildNdoSpot(call, { invoice: inv, rate: 0 })
    deepStrictEqual([s.curr1, s.bs1, s.amt1, s.curr2, s.bs2, s.amt2, s.base, s.invText1, s.bukrs], ['USD', 'Buy', 480000, 'INR', 'Sell', 43200000, 1, 'Invoice Value', 'IN11'])
    const put = buildNdoSpot(txn('1700004202'), { invoice: null, rate: 0 })
    deepStrictEqual([put.curr1, put.bs1, put.amt1, put.rate], ['USD', 'Sell', 250000, 86])
    strictEqual(recalcSpotAmounts({ ...s, rate: 0 }).amt2, 0)
    strictEqual(invoiceAmountFor(data, 'DL26000108', 'D1'), null) // spot already booked
  })
})

describe('mutations', () => {
  it('books a spot with signed amounts and marks the settlement spot created', () => {
    const before = freshData()
    const { data, rfha } = createSpotTransaction(
      before,
      { dealId: 'DL26000101', dealType: 'D1', sourceRfha: '1700004101', bukrs: 'IN11', sfhaart: '604', bs1: 'Buy', curr1: 'USD', amt1: 50000, bs2: 'Sell', curr2: 'INR', amt2: 4660000, rate: 93.2, bp: '1000124' },
      '2026-10-01',
    )
    strictEqual(rfha, '170005901')
    const t = data.txns.find((x) => x.rfha === rfha)!
    deepStrictEqual([t.amt1, t.amt2, t.status, t.tradeDate, t.cptyName, t.mcRef], [50000, -4660000, '03', '2026-10-01', 'HSBC', '2000002728'])
    const rec = data.inSpot.find((s) => s.dealId === 'DL26000101')!
    deepStrictEqual([rec.spotCreate, rec.spotTxn], ['X', rfha])
    strictEqual(before.inSpot.find((s) => s.dealId === 'DL26000101')!.spotCreate, '') // input untouched
    strictEqual(updateTxnStatus(before, '1700004201', '24').txns.find((x) => x.rfha === '1700004201')!.status, '24')
  })
})

describe('KPIs', () => {
  it('counts the listed deals as of 01-10-2026', () => {
    const data = freshData()
    const k = computeKpis(data, fetchDeals(data.deals, F))
    strictEqual(k.count, 12)
    deepStrictEqual(k.noAuth.map((d) => d.id), ['DL26000113'])
    deepStrictEqual(k.due.map((x) => x.deal.id), ['DL26000110']) // 108 ends in 8 days; 109 is settled
    deepStrictEqual(k.overdue.map((x) => x.deal.id), ['DL26000111'])
    strictEqual(k.gains, 4)
    strictEqual(k.losses, 1)
    ok(k.totalItems > 0 && k.progressPct >= 0 && k.progressPct <= 100)
  })
})
