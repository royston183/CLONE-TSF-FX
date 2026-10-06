import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DealContext } from '../../shared/fx/deal-id.ts'
import { eligibleDeals, selectionHelps, toRow } from './api.ts'
import { buildInitialData } from './fixtures.ts'
import { enrichRow, filterRows } from './logic.ts'
import { parseDate } from './format.ts'

// Shapes as the SLC middleware served them on 2026-10-05.
const comp = [
  { ZCOM_ID: 'OSIPL', ZBUTXT: 'Olam Agri India', ZREG_ID: 'R02' },
  { ZCOM_ID: 'DMCC', ZBUTXT: 'Olam International DMCC', ZREG_ID: 'R01' },
]
const ruleBt = [
  { ZMOD_ID: 'M032', ZNO_INV: '' },
  { ZMOD_ID: 'M033', ZNO_INV: 'X' },
  { ZMOD_ID: 'M035', ZNO_INV: 'X' },
  { ZMOD_ID: 'M035', ZNO_INV: '' },
]
const mc = (ref: string, model: string, origin: string) => ({ ZMC_REF_NO: ref, ZMOD_ID: model, ZMOD_DESC: `${model} desc`, ZORIGIN: origin, ZCOM_DESC: 'Cotton', ZSHIP_START: '2026-10-01', ZSHIP_END: '2027-01-31' })
const ctx: DealContext = {
  comp: new Map(comp.map((r) => [r.ZCOM_ID, r])),
  models: new Map(),
  statuses: [
    { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '02', ZDEAL_SDESC: 'MO: FX Deals & MC Assignment Confirmed' },
    { ZSUB_TYPE: 'FX2', ZDEAL_STAT: '02', ZDEAL_SDESC: 'Option text' },
  ],
  mcs: new Map([
    ['1', mc('1', 'M032', 'OSIPL')],
    ['2', mc('2', 'M033', 'OSIPL')],
    ['3', mc('3', 'M035', 'DMCC')],
    ['4', mc('4', 'M032', 'NOCOMP')],
    ['5', mc('5', 'M099', 'OSIPL')],
  ]),
  source: 'mysql',
}
const deal = (id: string, mcRef: string, stat = '02') => ({ ZDEAL_ID: id, ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: stat, ZMC_REF: mcRef, ZTSF_MODEL: 'M777', ZS_DATE: '2026-10-01', ZE_DATE: '2027-01-31' })

describe('FORM get_data selection', () => {
  it("keeps status 02 deals whose MC origin is in COMP and whose MC model has a RULE_BT row with ZNO_INV = ''", () => {
    const out = eligibleDeals([deal('9', '1'), deal('8', '2'), deal('7', '3'), deal('6', '4'), deal('5', '5'), deal('4', '1', '03'), deal('3', '99'), deal('9', '1')], ctx, ruleBt)
    // 8: M033 only ZNO_INV 'X'; 6: origin not in COMP (INNER JOIN); 5: model not in RULE_BT;
    // 4: status 03; 3: no MC; the second 9: DELETE ADJACENT DUPLICATES.
    deepStrictEqual(
      out.map((d) => d.ZDEAL_ID),
      ['7', '9'],
    )
  })

  it('P_ORG / P_REG / P_MOD helps: COMP ids, COMP regions, RULE_BT models', () => {
    deepStrictEqual(selectionHelps(comp, ruleBt), { origins: ['DMCC', 'OSIPL'], regions: ['R01', 'R02'], models: ['M032', 'M033', 'M035'] })
  })

  it("maps b~ fields from the MC, status text at 'FX1', and leaves the CDS amount gated", () => {
    const r = toRow(deal('9', '1'), ctx)
    strictEqual(r.model, 'M032')
    strictEqual(r.modelDesc, 'M032 desc')
    strictEqual(r.commodity, 'Cotton')
    strictEqual(r.region, 'R02')
    strictEqual(r.statusDesc, 'MO: FX Deals & MC Assignment Confirmed')
    strictEqual(r.shipStart, '01-10-2026')
    strictEqual(r.amount, null)
    strictEqual(r.earliestStart, addDaysCheck('31-01-2027', -270))
  })
})

function addDaysCheck(dmy: string, days: number): string {
  const d = parseDate(dmy)!
  d.setDate(d.getDate() + days)
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

describe('P_MARK date range: zship_start >= low AND zship_end >= high', () => {
  const rows = buildInitialData().map(enrichRow)
  it('drops rows shipping before the low date or ending before the high date', () => {
    const out = filterRows(rows, '', parseDate('01-10-2026'), parseDate('31-03-2027'), '', '', '')
    for (const r of out) {
      strictEqual(parseDate(r.shipStart)!.getTime() >= parseDate('01-10-2026')!.getTime(), true)
      strictEqual(parseDate(r.shipEnd)!.getTime() >= parseDate('31-03-2027')!.getTime(), true)
    }
    strictEqual(out.length > 0, true)
    strictEqual(out.length < rows.length, true)
  })
  it('only status 02 rows are listed', () => {
    const rows2 = rows.map((r, i) => (i === 0 ? { ...r, status: '03' } : r))
    strictEqual(
      filterRows(rows2, '', null, null, '', '', '').some((r) => r.dealId === rows[0]!.dealId),
      false,
    )
  })
})
