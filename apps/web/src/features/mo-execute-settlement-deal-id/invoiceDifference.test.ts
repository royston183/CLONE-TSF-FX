import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FxRow } from '../../shared/fx/mw.ts'
import { computeDifferences, rowsToSave, type DiffInput } from './invoiceDifference.ts'
import type { FxDeal, TradeInvoice } from './types.ts'

// Deal ID 7000000052 as the Invoice Finalisation screen showed it: M033, INR invoices at 83.20 / 83.4496, 800 x USD 2,336.50.
const leg = (over: Partial<FxDeal>): FxDeal =>
  ({ seq: '', dealType: 'D1', dealTypeChip: '', rfha: '3000000000035', bukrs: 'SG03', txnType: '619', bp: '', txnDate: '', valDate: '', entity: '', bs1: 'Buy', curr1: 'USD', amt1: 4000000, bs2: 'Sell', curr2: 'INR', amt2: 332800000, spot: '', rate: '', mcRefNo: '', status: '', statusChip: '', doc1: '', doc2: '', ...over }) as FxDeal
const d1 = leg({})
const d2 = leg({ dealType: 'D2', rfha: '2000000000056', txnType: '631' })

const inv = (legName: string, over: Partial<TradeInvoice> = {}): TradeInvoice =>
  ({ leg: legName, trfDesc: '', docType: '', xblnr: '', drPost: '', crPost: '', dueDate: '', postDate: '', invAmt: 0, curr: 'INR', payAmt: 0, recPay: '', trfType: '', fiDoc: '', setCo: false, ...over }) as TradeInvoice
const invoices = [
  inv('T1-S', { dMap: 'D1', dssDeal: 'DSS1' }),
  inv('T2-S', { dMap: 'D2', dssDeal: 'DSS2' }),
  inv('T3-S', { dMap: 'D2', dssDeal: '' }),
]

const invRef: FxRow[] = [
  { ZTTYPE: 'T1', ZAMT: '1869200.00', ZINV_AMT: '332800000.00', ZTRD_CURR: 'INR' },
  { ZTTYPE: 'T2', ZAMT: '1869200.00', ZINV_AMT: '332800000.00', ZTRD_CURR: 'INR' },
  { ZTTYPE: 'T3', ZAMT: '1869200.00', ZINV_AMT: '332800000.00', ZTRD_CURR: 'INR' },
]
const billAdj: FxRow[] = [
  { ZINV_REF: '7000000052-T1-I01', ZAMT_USD: '1869200.00', ZAMT: '155517440.00' },
  { ZINV_REF: '7000000052-T2-I01', ZAMT_USD: '1869200.00', ZAMT: '155983992.32' },
  { ZINV_REF: '7000000052-T3-I01', ZAMT_USD: '1869200.00', ZAMT: '155983992.32' },
]
const rules: FxRow[] = [{ ZMOD_ID: 'M033', ZD1_INV_LINK: '01', ZD1_INV_LINK2: '', ZD2_INV_LINK: '02', ZD2_INV_LINK2: '03', ZD1_PUT_CALL: '0' }]
const setSpt: FxRow[] = [
  { ZMOD_ID: 'M033', ZSIGN: '+', ZD1_BUKRS: 'SG03', ZD1_BCURR: 'INR', ZD2_BUKRS: 'IN11', ZD2_BCURR: 'USD' },
  { ZMOD_ID: 'M033', ZSIGN: '-', ZD1_BUKRS: 'IN11', ZD1_BCURR: 'USD', ZD2_BUKRS: 'SG03', ZD2_BCURR: 'INR' },
]
const input = (over: Partial<DiffInput> = {}): DiffInput => ({
  model: 'M033',
  dealId: '7000000052',
  fxDeals: [d1, d2],
  invoices,
  invRef,
  billAdj,
  rules,
  setSpt,
  tsfPay: [],
  existing: [],
  ...over,
})

describe('FX-Invoice Difference (PROCESS_DATA_NEW)', () => {
  it('compares the planned invoice, the final invoice and the deal amount of the leg it maps to', () => {
    const rows = computeDifferences(input())
    deepStrictEqual(rows.map((r) => [r.ttype, r.dealType]), [['T1', 'D1'], ['T2', 'D2'], ['T3', 'D2']])
    const [t1, t2] = rows
    strictEqual(t1!.planAmt, 332800000)
    strictEqual(t1!.finalAmt, 155517440)
    strictEqual(t1!.dealAmt, 332800000) // INR is not CURR1 of the leg: the absolute AMT2
    strictEqual(t1!.diffAmt, 177282560)
    strictEqual(t1!.diff2Amt, 177282560)
    strictEqual(t2!.finalAmt, 155983992.32)
    strictEqual(t2!.diff2Amt, 176816007.68)
  })

  it('takes the USD side of the bill adjustments for a USD invoice and the leg\'s AMT1 for the deal amount', () => {
    const usd = computeDifferences(input({ invRef: [{ ZTTYPE: 'T1', ZAMT: '1869200.00', ZINV_AMT: '0', ZTRD_CURR: 'USD' }] }))[0]!
    strictEqual(usd.planAmt, 1869200)
    strictEqual(usd.finalAmt, 1869200)
    strictEqual(usd.dealAmt, 4000000)
    strictEqual(usd.diff2Amt, 2130800)
  })

  it('picks the spot company and Buy / Sell from SET_SPT by the sign of the planned-minus-final difference', () => {
    const [t1] = computeDifferences(input())
    // plan > final: sign +, D1 row of the '+' setup: ZD1_BCURR INR equals the invoice currency -> Buy.
    deepStrictEqual([t1!.sbukrs, t1!.bs], ['SG03', 'Buy'])
    const lower = computeDifferences(input({ billAdj: [{ ZINV_REF: '7000000052-T1-I01', ZAMT_USD: '0', ZAMT: '400000000.00' }] }))[0]!
    deepStrictEqual([lower.diffAmt < 0, lower.sbukrs, lower.bs], [true, 'IN11', 'Sell'])
  })

  it('marks a row saved when IN_SPOT already holds its deal type', () => {
    const rows = computeDifferences(input({ existing: [{ ZDEAL_TYPE: 'D1' }] }))
    deepStrictEqual(rows.map((r) => r.saved), [true, false, false])
  })
})

describe('Save the difference (SAVE_SPOT_DATA_NEW)', () => {
  it('writes the DSS legs first (deal type, DSS type, the FX leg\'s company and RFHA) with the final invoice, deal amount and difference', () => {
    const inp = input()
    const rows = rowsToSave(inp, computeDifferences(inp))
    const t1 = rows.find((r) => r.ZDEAL_TYPE === 'D1' && r.ZDSS_TYPE === 'DSS1')!
    deepStrictEqual(
      [t1.ZMOD_ID, t1.ZDEAL_ID, t1.ZBUKRS, t1.ZRFHA, t1.ZT_TYPE, t1.ZF_AMT, t1.ZFX_AMT, t1.ZCURR, t1.ZD_AMT, t1.ZSBUKRS, t1.ZBS],
      ['M033', '7000000052', 'SG03', '3000000000035', 'T1', 155517440, 332800000, 'INR', 177282560, 'SG03', 'Buy'],
    )
  })

  it('leaves the forward (619) to the invoice rows and gives a non-forward leg a row with no DSS type, no company and no RFHA', () => {
    const inp = input()
    const rows = rowsToSave(inp, computeDifferences(inp))
    // D1 is a 619 forward: only its DSS row. D2 is an NDF (631): its DSS row and a second row without a DSS type.
    deepStrictEqual(rows.filter((r) => r.ZDEAL_TYPE === 'D1').map((r) => r.ZDSS_TYPE), ['DSS1'])
    const ndf = rows.find((r) => r.ZDEAL_TYPE === 'D2' && r.ZDSS_TYPE === '')!
    deepStrictEqual([ndf.ZBUKRS, ndf.ZRFHA], ['', ''])
  })

  it('skips a deal type that is already saved, and saves a zero difference all the same', () => {
    const skipped = rowsToSave(input({ existing: [{ ZDEAL_TYPE: 'D1' }] }), computeDifferences(input({ existing: [{ ZDEAL_TYPE: 'D1' }] })))
    strictEqual(skipped.some((r) => r.ZDEAL_TYPE === 'D1'), false)
    const equal = input({ billAdj: [{ ZINV_REF: '7000000052-T1-I01', ZAMT_USD: '0', ZAMT: '332800000.00' }] })
    const zero = rowsToSave(equal, computeDifferences(equal)).find((r) => r.ZDEAL_TYPE === 'D1')!
    strictEqual(zero.ZD_AMT, 0)
  })

  it('returns nothing to save when every row is already saved', () => {
    const inp = input({ existing: [{ ZDEAL_TYPE: 'D1' }, { ZDEAL_TYPE: 'D2' }] })
    deepStrictEqual(rowsToSave(inp, computeDifferences(inp)), [])
  })
})

import { saveDifference, toColumns, type DifferencePorts } from './differenceApi.ts'

describe('Writing ZSGTSFTR_IN_SPOT', () => {
  const fake = (existing: FxRow[] = []) => {
    const log: string[] = []
    const ports: DifferencePorts = {
      list: async () => existing,
      create: async (row) => void log.push(`create ${row['ZDEAL_TYPE']}|${row['ZDSS_TYPE']}|${row['ZD_AMT']}`),
      update: async (key, changes) => void log.push(`update ${key['ZDEAL_TYPE']}|${key['ZDSS_TYPE']}|${changes['ZD_AMT']}`),
    }
    return { ports, log }
  }
  const view = () => {
    const inp = input()
    return { rows: computeDifferences(inp), input: inp, note: '' }
  }

  it('inserts each new row with two-decimal amounts and never books a spot (ZSPOT_TXN / ZSPOT_CREATE are not written)', async () => {
    const { ports, log } = fake()
    const result = await saveDifference(view(), ports)
    strictEqual(result.ok && result.message, 'Details Saved Successfully..')
    strictEqual(log.every((l) => l.startsWith('create ')), true)
    strictEqual(log.includes('create D1|DSS1|177282560.00'), true)
    const columns = toColumns(rowsToSave(input(), computeDifferences(input()))[0]!)
    strictEqual('ZSPOT_TXN' in columns || 'ZSPOT_CREATE' in columns, false)
  })

  it('updates a row whose key exists and says "Data already saved.." when there is nothing new', async () => {
    const v = view()
    const first = rowsToSave(v.input, v.rows)[0]!
    // The same key already in IN_SPOT but for another deal type, so the row is still written, as an update.
    const { ports, log } = fake([{ ZMOD_ID: first.ZMOD_ID, ZDEAL_ID: first.ZDEAL_ID, ZDEAL_TYPE: first.ZDEAL_TYPE, ZDSS_TYPE: first.ZDSS_TYPE }])
    await saveDifference({ ...v, input: { ...v.input, existing: [] } }, ports)
    // Re-reading the table marks that deal type saved, so it is skipped rather than written twice.
    strictEqual(log.some((l) => l.startsWith('update D1|DSS1')), false)
    const all = fake([{ ZDEAL_TYPE: 'D1' }, { ZDEAL_TYPE: 'D2' }])
    const done = await saveDifference(v, all.ports)
    strictEqual(done.ok && done.message, 'Data already saved..')
    deepStrictEqual(all.log, [])
  })

  it('reports a failed write instead of claiming it saved', async () => {
    const ports: DifferencePorts = { ...fake().ports, create: async () => Promise.reject(new Error('MISSING_PRIMARY_KEY')) }
    const result = await saveDifference(view(), ports)
    strictEqual(!result.ok && result.error.includes('MISSING_PRIMARY_KEY'), true)
  })
})
