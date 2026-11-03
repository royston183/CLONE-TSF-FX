import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_FILTERS, setLookups } from './data.ts'
import { findTxn } from './flows.ts'
import { DEMO_USER, FIXTURE_AS_OF, FIXTURE_LOOKUPS, SEED_DEALS, fixtureData as freshData } from './fixtures.ts'
import { dmyToIso, formatAmount, isoToDMY, kpiCompact, parseDMY, parseNum } from './format.ts'
import {
  buildNdoSpot,
  calcCashSettlement,
  calcNdfSettlement,
  computeKpis,
  ndfSpotMissing,
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
  ssSpotFor,
  txnLinkClass,
  updateTxnStatus,
} from './logic.ts'
import type { Filters } from './types.ts'

// The rules run against the legacy page's dummy data, loaded as if SAP had served it.
setLookups(FIXTURE_LOOKUPS)

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
    strictEqual(isAuthorized(fetchTransactions(data, 'DL26000113'), DEMO_USER.authorizedCompanyCodes), false)
    strictEqual(isAuthorized(fetchTransactions(data, 'DL26000101'), DEMO_USER.authorizedCompanyCodes), true)
    strictEqual(isAuthorized(fetchTransactions(data, 'DL26000113')), true) // no SAP source for the user's authorisations
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
    strictEqual(marketRate(txn('1700004201')), 91.25) // latest TCURR M row on/before 20-10-2026
    strictEqual(marketRate({ ...txn('1700004201'), eDate: '2026-10-26' }), 91.25) // not the 27-10 row
    strictEqual(marketRate({ ...txn('1700004201'), eDate: '2026-10-27' }), 94.1)
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
    strictEqual(invoiceAmountFor(data, 'DL26000108', 'D1'), null) // ZRFHA set: already settled
    deepStrictEqual(ssSpotFor('M036', '646', 'Call'), { model: 'M036', opBs: '01', pc: '2', bs1: 'Sell', curr1: 'USD', bs2: 'Buy', curr2: 'INR' })
    strictEqual(ssSpotFor('M032', '646', 'Call'), null) // no SS_SPOT row for the model
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
    const k = computeKpis(data, fetchDeals(data.deals, F), FIXTURE_AS_OF)
    strictEqual(k.count, 12)
    deepStrictEqual(k.noAuth.map((d) => d.id), []) // WAITING FOR AUTH: no F_BKPF_BUK source, nothing excluded
    deepStrictEqual(k.due.map((x) => x.deal.id), ['DL26000110']) // 108 ends in 8 days; 109 is settled
    deepStrictEqual(k.overdue.map((x) => x.deal.id), ['DL26000111'])
    strictEqual(k.gains, 4)
    strictEqual(k.losses, 1)
    ok(k.totalItems > 0 && k.progressPct >= 0 && k.progressPct <= 100)
  })
})

describe('the same transaction number in two company codes', () => {
  // Deal 7000000055 holds SG03/3000000000037 and deal 7000000060 holds IN11/3000000000037.
  const twin = () => {
    const base = txn('1700004201')
    return { ...freshData(), txns: [{ ...base, dealId: '7000000055', bukrs: 'SG03', rfha: '3000000000037', status: '05' }, { ...base, dealId: '7000000060', bukrs: 'IN11', rfha: '3000000000037', status: '05' }] }
  }

  it('finds the transaction of the deal it is asked for, not the first with that number', () => {
    const data = twin()
    strictEqual(findTxn(data, '3000000000037')!.dealId, '7000000055')
    strictEqual(findTxn(data, '3000000000037', { dealId: '7000000060' })!.bukrs, 'IN11')
    strictEqual(findTxn(data, '3000000000037', { bukrs: 'IN11' })!.dealId, '7000000060')
    strictEqual(findTxn(data, '3000000000037', { dealId: '7000000060', bukrs: 'SG03' }), undefined)
  })

  it('changes only the scoped transaction when a status is updated', () => {
    const after = updateTxnStatus(twin(), '3000000000037', '24', null, { dealId: '7000000060' })
    deepStrictEqual(after.txns.map((t) => [t.dealId, t.status]), [['7000000055', '05'], ['7000000060', '24']])
  })

  it('carries the deal on every action item so Create opens the right deal', () => {
    const data = freshData()
    const d = SEED_DEALS[0]!
    for (const item of fetchActionItems(data, d, fetchTransactions(data, d.id))) strictEqual(item.dealId, d.id)
  })
})

describe('ndfSpotMissing', () => {
  const ndf = { sfhaart: '631', status: '10' }
  it('a fixed NDF with no DS1 / DS2 spot still offers Create Spot; one with its spot, or not yet fixed, does not', () => {
    strictEqual(ndfSpotMissing(ndf, [{ dealType: 'D2', sfhaart: '631' }, { dealType: 'D1', sfhaart: '619' }]), true)
    strictEqual(ndfSpotMissing(ndf, [{ dealType: 'D2', sfhaart: '631' }, { dealType: 'DS1', sfhaart: '605' }]), false)
    strictEqual(ndfSpotMissing({ sfhaart: '631', status: '07' }, [{ dealType: 'D2', sfhaart: '631' }]), false)
    strictEqual(ndfSpotMissing({ sfhaart: '619', status: '10' }, [{ dealType: 'D1', sfhaart: '619' }]), false)
  })
})
