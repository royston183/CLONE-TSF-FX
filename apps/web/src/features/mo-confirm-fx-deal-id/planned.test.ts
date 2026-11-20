import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { invoiceRows, pnlGrid, storedInvoiceRows } from '../../shared/fx/planned.ts'
import { buildPnl, type PlanLine } from './analysisPlan.ts'
import { sapDisplayLines } from './planned.ts'

/** Deal ID 1100002739 as the SAP screens show it: T1 OIL->DMCC USD, T2 DMCC->OFIIPL USD (both D1, rate 99.00), T3 OFIIPL->OIL INR (D2, 99.60). */
const line = (type: string, seller: string, buyer: string, curr: string, linked: 'D1' | 'D2', amt: number, inv: number, rate: number): PlanLine => ({
  ZINV_TRM_NO: `1100002739-${type}`, ZTTYPE: type, ZDTYPE: linked, ZTRD_SELL: seller, ZTRD_BUY: buyer, ZMC_REF_P: `${buyer}-${seller}-P`, ZMC_REF_S: `${seller}-${buyer}-S`,
  ZTRD_CURR: curr, ZAMT: amt, ZINV_AMT: inv, ZEX_RATE: rate, linked, reused: false, seller, buyer,
})
const calculated = [
  line('T1', 'OIL', 'DMCC', 'USD', 'D1', 10_000_000, 10_000_000, 1),
  line('T2', 'DMCC', 'OFIIPL', 'USD', 'D1', 10_000_000, 10_000_000, 1),
  line('T3', 'OFIIPL', 'OIL', 'INR', 'D2', 10_000_000, 996_000_000, 99.6),
]
const legs = [{ dealType: 'D1', rateVal: 99 }, { dealType: 'D2', rateVal: 99.6 }]

describe('sapDisplayLines', () => {
  const shown = sapDisplayLines(calculated, legs)
  it('shows a USD trade at the linked leg\'s rate with the amount in the other currency', () => {
    deepStrictEqual([shown[0]!.ZEX_RATE, shown[0]!.ZINV_AMT, shown[0]!.ZAMT], [99, 990_000_000, 10_000_000])
    deepStrictEqual([shown[1]!.ZEX_RATE, shown[1]!.ZINV_AMT], [99, 990_000_000])
  })
  it('leaves the INR trade and any saved line as calculated', () => {
    deepStrictEqual([shown[2]!.ZEX_RATE, shown[2]!.ZINV_AMT], [99.6, 996_000_000])
    const saved = [{ ...calculated[0]!, reused: true }]
    strictEqual(sapDisplayLines(saved, legs)[0]!.ZINV_AMT, 10_000_000)
  })
  it('does not change the lines it was given', () => {
    strictEqual(calculated[0]!.ZINV_AMT, 10_000_000)
  })
})

describe('Planned Trade Invoices rows', () => {
  it('has the SAP columns for each line', () => {
    const rows = invoiceRows(sapDisplayLines(calculated, legs))
    deepStrictEqual(rows[2], {
      tradeType: 'T3', invTrmRefNo: '1100002739-T3', sell: 'OFIIPL', buy: 'OIL', mcRefP: 'OIL-OFIIPL-P', mcRefSale: 'OFIIPL-OIL-S',
      dealType: 'D2', invCurr: 'INR', invAmt: 10_000_000, invAmount: 996_000_000, exchangeRate: 99.6,
    })
  })
  it('shows saved lines with the columns they do not carry left blank', () => {
    const r = storedInvoiceRows([{ tradeRef: 'X-T1', invType: 'T1', exRate: 90, amt: 5, invAmt: 450, curr: 'USD' }])[0]!
    deepStrictEqual([r.invTrmRefNo, r.sell, r.buy, r.invAmount], ['X-T1', '', '', 450])
  })
})

describe('Planned P&L grid (the SAP screen)', () => {
  const grid = pnlGrid(buildPnl(sapDisplayLines(calculated, legs), 1), 'INR', { entity: 'OIL', amount: 996_010_000 })!
  const at = (label: string, column: string) => grid.rows.find((r) => r.label === label)!.cells[grid.columns.findIndex((c) => c.label === column)]
  it('has an INR and a USD column for each entity', () => {
    deepStrictEqual(grid.columns.map((c) => c.label), ['OIL-INR', 'OIL-USD', 'DMCC-INR', 'DMCC-USD', 'OFIIPL-INR', 'OFIIPL-USD'])
  })
  it('has the sale and purchase of the screen', () => {
    strictEqual(at('Sale', 'OIL-INR'), 990_000_000)
    strictEqual(at('Sale', 'OIL-USD'), 10_000_000)
    strictEqual(at('Sale', 'OFIIPL-INR'), 996_000_000)
    strictEqual(at('Purchase', 'OIL-INR'), -996_000_000)
    strictEqual(at('Purchase', 'OFIIPL-INR'), -990_000_000)
    strictEqual(at('Purchase', 'DMCC-USD'), -10_000_000)
  })
  it('has the NDF adjustment, the P&L and its origin percentage', () => {
    strictEqual(at('NDF Fixing-Profit Adj', 'OIL-INR'), 996_010_000)
    strictEqual(at('P&L', 'OIL-INR'), 990_010_000)
    strictEqual(at('P&L', 'OFIIPL-INR'), 6_000_000)
    strictEqual(at('P&L Origin(%)', 'OIL-INR'), 100)
    strictEqual(at('P&L Origin(%)', 'OFIIPL-INR'), 0.6)
  })
  it('keeps the P&L out of the USD columns', () => {
    strictEqual(at('P&L', 'OIL-USD'), null)
  })
  it('is empty without entities, and USD-only without another currency', () => {
    strictEqual(pnlGrid([], 'INR'), null)
    deepStrictEqual(pnlGrid(buildPnl(calculated, 1), 'USD')!.columns.map((c) => c.side), ['usd', 'usd', 'usd'])
  })
})
