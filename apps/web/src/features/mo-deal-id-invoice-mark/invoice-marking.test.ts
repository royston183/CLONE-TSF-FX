import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DealContext } from '../../shared/fx/deal-id.ts'
import { autoCandidates, describeOutcome, eligibleDeals, markDealsForInvoicing, MARKED_STATUS } from './api.ts'
import { calculateDealUsdAmount, fxLeg, mergeTransactions, type AppStrLink, type Leg } from './amount.ts'
import { enrichRow, filterRows } from './logic.ts'
import { parseDate } from './format.ts'
import type { DealRow } from './types.ts'

const mc = (ref: string, model: string, start: string) => ({ ZMC_REF_NO: ref, ZMOD_ID: model, ZORIGIN: 'OSIPL', ZSHIP_START: start, ZSHIP_END: '2027-12-31' })
const ctx: DealContext = {
  comp: new Map([['OSIPL', { ZCOM_ID: 'OSIPL', ZREG_ID: 'R02' }]]),
  models: new Map(),
  statuses: [],
  mcs: new Map([
    ['1', mc('1', 'M032', '2026-09-01')], // started
    ['2', mc('2', 'M032', '2026-10-06')], // starts today
    ['3', mc('3', 'M032', '2026-10-07')], // starts tomorrow
    ['4', mc('4', 'M033', '2026-09-01')], // No Invoice model
  ]),
  source: 'mysql',
}
const ruleBt = [
  { ZMOD_ID: 'M032', ZNO_INV: '' },
  { ZMOD_ID: 'M033', ZNO_INV: 'X' },
]
const deal = (id: string, mcRef: string, stat = '02') => ({ ZDEAL_ID: id, ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: stat, ZMC_REF: mcRef })
const TODAY = new Date(2026, 9, 6)

describe('manual eligibility', () => {
  it('lists status 02 deals of an invoiced model, one row per Deal ID', () => {
    const out = eligibleDeals([deal('A', '1'), deal('A', '1'), deal('B', '3')], ctx, ruleBt)
    deepStrictEqual(out.map((d) => d.ZDEAL_ID), ['A', 'B'])
  })
  it('excludes No Invoice models (ZNO_INV populated)', () => {
    deepStrictEqual(eligibleDeals([deal('N', '4')], ctx, ruleBt), [])
  })
  it('excludes deals that are not at 02', () => {
    deepStrictEqual(eligibleDeals([deal('X', '1', '03'), deal('Y', '1', '01')], ctx, ruleBt), [])
  })
})

describe('automatic eligibility', () => {
  const base = eligibleDeals([deal('A', '1'), deal('T', '2'), deal('F', '3'), deal('N', '4')], ctx, ruleBt)
  it('keeps shipment start <= today, drops future starts and No Invoice models', () => {
    deepStrictEqual(autoCandidates(base, ctx, TODAY).map((d) => d.ZDEAL_ID), ['A', 'T'])
  })
  it('uses today, not the selected shipment range', () => {
    const rows = autoCandidates(base, ctx, TODAY).map((d) => enrichRow({ dealId: String(d.ZDEAL_ID), dealDesc: '', mcRef: '', commodity: '', dealStart: '01-01-2026', dealEnd: '01-01-2027', origin: 'OSIPL', model: 'M032', region: 'R02', amount: null, shipStart: '01-09-2026', shipEnd: '31-12-2027', trader: '', mcDesc: '', mcDate: '', entityString: '', currencyString: '' }))
    // A range far from the shipment dates removes everything in manual mode, nothing in auto mode.
    const from = parseDate('01-01-2030')
    const to = parseDate('31-12-2030')
    strictEqual(filterRows(rows, '', from, to, '', '', '', true).length, 0)
    strictEqual(filterRows(rows, '', from, to, '', '', '', false).length, 2)
  })
})

describe('manual date rule', () => {
  const row = (shipStart: string, shipEnd: string): DealRow =>
    enrichRow({ dealId: 'D', dealDesc: '', mcRef: '', commodity: '', dealStart: '01-01-2026', dealEnd: '01-01-2027', origin: '', model: '', region: '', amount: null, shipStart, shipEnd, trader: '', mcDesc: '', mcDate: '', entityString: '', currencyString: '' })
  it('is ship start >= low AND ship end >= high, as written', () => {
    const from = parseDate('01-10-2026')
    const to = parseDate('31-03-2027')
    strictEqual(filterRows([row('01-10-2026', '31-03-2027')], '', from, to, '', '', '').length, 1)
    strictEqual(filterRows([row('30-09-2026', '31-03-2027')], '', from, to, '', '', '').length, 0)
    strictEqual(filterRows([row('01-10-2026', '30-03-2027')], '', from, to, '', '', '').length, 0)
  })
})

describe('Deal Amt (USD)', () => {
  const link = (companyCode: string, transaction: string, dealId: string, dealType = 'D1'): AppStrLink => ({ companyCode, transaction, dealId, dealType, mcRef: '1' })
  const leg = (companyCode: string, transaction: string, curr1: string, amt1: number, curr2: string, amt2: number): Leg => ({ companyCode, transaction, curr1, amt1, curr2, amt2 })

  it('sums the USD leg of FX and option transactions of the Deal ID, D1 only, as an absolute value', () => {
    const merged = mergeTransactions(
      [link('IN11', '1', 'A'), link('IN11', '2', 'A'), link('IN11', '3', 'A', 'D2'), link('IN11', '4', 'B')],
      [leg('IN11', '1', 'USD', 100, 'INR', -9000), leg('IN11', '2', 'INR', 5000, 'USD', 40), leg('IN11', '3', 'USD', 999, 'INR', -1), leg('IN11', '4', 'USD', 777, 'INR', -1)],
    )
    strictEqual(calculateDealUsdAmount('A', merged), 140)
  })
  it('nets opposite USD legs before taking the absolute value', () => {
    const merged = mergeTransactions([link('IN11', '1', 'A'), link('IN11', '2', 'A')], [leg('IN11', '1', 'USD', 100, 'INR', -1), leg('IN11', '2', 'USD', -30, 'INR', 1)])
    strictEqual(calculateDealUsdAmount('A', merged), 70)
  })
  it('excludes non-D1 and other Deal IDs', () => {
    const merged = mergeTransactions([link('IN11', '1', 'A', 'D2'), link('IN11', '2', 'B')], [leg('IN11', '1', 'USD', 100, 'INR', -1), leg('IN11', '2', 'USD', 50, 'INR', -1)])
    strictEqual(calculateDealUsdAmount('A', merged), 0)
  })
  it('keeps the same RFHA under another company code distinct (BUKRS + RFHA)', () => {
    const merged = mergeTransactions([link('IN11', '7', 'A'), link('AE13', '7', 'B')], [leg('IN11', '7', 'USD', 100, 'INR', -1), leg('AE13', '7', 'USD', 25, 'INR', -1)])
    strictEqual(merged.length, 2)
    strictEqual(calculateDealUsdAmount('A', merged), 100)
    strictEqual(calculateDealUsdAmount('B', merged), 25)
  })
  it('ignores a link whose company code has no matching leg', () => {
    deepStrictEqual(mergeTransactions([link('IN11', '7', 'A')], [leg('AE13', '7', 'USD', 100, 'INR', -1)]), [])
  })
  it('reads an FxTransaction as lead / follow legs, sell negative, and skips reversed deals', () => {
    const buy = fxLeg({ CompanyCode: 'IN11', FinancialTransaction: '1', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyCurrency: 'USD', SellCurrency: 'INR', BuyAmount: '100', SellAmount: '9000' })
    deepStrictEqual(buy, { companyCode: 'IN11', transaction: '1', curr1: 'USD', amt1: 100, curr2: 'INR', amt2: -9000 })
    const sell = fxLeg({ CompanyCode: 'IN11', FinancialTransaction: '2', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: '9000', SellAmount: '100' })
    deepStrictEqual(sell, { companyCode: 'IN11', transaction: '2', curr1: 'USD', amt1: -100, curr2: 'INR', amt2: 9000 })
    strictEqual(fxLeg({ CompanyCode: 'IN11', FinancialTransaction: '3', ActiveStatus: '3' }), null)
  })
})

describe('marking 02 -> 03', () => {
  const deals = ['A', 'B', 'C'].map((id) => deal(id, '1'))
  it('writes only ZDEAL_STAT (and the audit stamp) to the Deal ID, never an APP_STR status', async () => {
    const writes: Array<{ key: Record<string, string>; changes: Record<string, unknown> }> = []
    const outcome = await markDealsForInvoicing([deals[0]!], async (key, changes) => void writes.push({ key, changes }))
    deepStrictEqual(outcome, { succeeded: ['A'], failed: [] })
    deepStrictEqual(writes[0]!.key, { ZDEAL_ID: 'A', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1' })
    strictEqual(writes[0]!.changes['ZDEAL_STAT'], MARKED_STATUS)
    strictEqual(MARKED_STATUS, '03')
    deepStrictEqual(Object.keys(writes[0]!.changes).filter((k) => !k.startsWith('ZCHANGED_')), ['ZDEAL_STAT'])
  })
  it('only the given (selected) deals are written', async () => {
    const touched: string[] = []
    await markDealsForInvoicing([deals[1]!], async (key) => void touched.push(key['ZDEAL_ID']!))
    deepStrictEqual(touched, ['B'])
  })
  it('reports partial failure per Deal ID and keeps going', async () => {
    const outcome = await markDealsForInvoicing(deals, async (key) => {
      if (key['ZDEAL_ID'] === 'B') throw new Error('locked')
    })
    deepStrictEqual(outcome.succeeded, ['A', 'C'])
    deepStrictEqual(outcome.failed, [{ dealId: 'B', reason: 'locked' }])
    strictEqual(describeOutcome(outcome).includes('B (locked)'), true)
  })
  it('a retry of only the failed deal succeeds without touching the others', async () => {
    const touched: string[] = []
    const outcome = await markDealsForInvoicing([deals[1]!], async (key) => void touched.push(key['ZDEAL_ID']!))
    deepStrictEqual(outcome.failed, [])
    deepStrictEqual(touched, ['B'])
  })
})
