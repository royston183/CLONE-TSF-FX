import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPosition, positionDeals, positionDetail, type PositionRaw } from './fxPosition.ts'

const deal = (id: string, over: Record<string, string> = {}) => ({
  ZDEAL_ID: id, ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_DESC: 'Deal ' + id, ZDEAL_STAT: '01', ZTSF_MODEL: 'M032',
  ZE_DATE: '2027-02-15', ZDEAL_AMT: '1000.50', ZPL: '10', ZBUKRS1: 'SG03', ZRFHA1: '0000000042', ...over,
})
const raw = (dealIds: Record<string, string>[], extra: Partial<PositionRaw> = {}): PositionRaw => ({
  dealIds, fx: [{ BUKRS: 'SG03', RFHA: '42', KONTRH: '0660000645', BP_NAME: 'DBS BANK LTD' }],
  statuses: [{ ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'Open for MO Confirmation' }],
  models: [], problems: [], loadedAt: new Date(), ...extra,
})

describe('positionDeals', () => {
  it('keeps live Deal IDs only: not cancelled, ending on or after the key date', () => {
    const r = raw([deal('1'), deal('2', { ZDEAL_STAT: '30' }), deal('3', { ZE_DATE: '2026-11-01' }), deal('4', { ZE_DATE: '2026-11-30' })])
    deepStrictEqual(positionDeals(r, '2026-11-30').map((d) => d.id), ['1', '4'])
  })
  it('uses the revised end date when there is one', () => {
    const d = positionDeals(raw([deal('1', { ZREV_DEDATE: '2028-03-01' })]), '2026-11-30')[0]!
    strictEqual(d.year, 2028)
    strictEqual(d.month, 2)
  })
  it('names the bank from the first leg the FX view knows, matching transaction numbers without leading zeros', () => {
    strictEqual(positionDeals(raw([deal('1')]), '2026-01-01')[0]!.bank, '0660000645 - DBS BANK LTD')
    strictEqual(positionDeals(raw([deal('1', { ZRFHA1: '', ZBUKRS2: 'SG03', ZRFHA2: '42' })]), '2026-01-01')[0]!.bank, '0660000645 - DBS BANK LTD')
    strictEqual(positionDeals(raw([deal('1', { ZRFHA1: '99' })]), '2026-01-01')[0]!.bank, 'Unassigned')
    strictEqual(positionDeals(raw([deal('1')], { fx: null }), '2026-01-01')[0]!.bank, 'Unassigned')
  })
  it('reads the status text, falling back to the code', () => {
    strictEqual(positionDeals(raw([deal('1')]), '2026-01-01')[0]!.status, 'Open for MO Confirmation')
    strictEqual(positionDeals(raw([deal('1', { ZDEAL_STAT: '05' })]), '2026-01-01')[0]!.status, '05')
  })
})

describe('buildPosition', () => {
  const view = buildPosition(
    raw([
      deal('1', { ZDEAL_AMT: '600' }),
      deal('2', { ZDEAL_AMT: '400', ZE_DATE: '2028-05-10', ZTSF_MODEL: 'M033', ZPL: '5' }),
    ]),
    '2026-01-01',
  )
  it('totals the USD volume and shares it out by bank', () => {
    strictEqual(view.volume, 1000)
    deepStrictEqual(view.banks.map((b) => [b.label, b.volume, b.count, Math.round(b.share)]), [['0660000645 - DBS BANK LTD', 1000, 2, 100]])
  })
  it('lays the maturity ladder out by year and month', () => {
    deepStrictEqual(view.ladder.years, [2027, 2028])
    strictEqual(view.ladder.cells[2027]!['FEB'], 600)
    strictEqual(view.ladder.cells[2028]!['MAY'], 400)
    strictEqual(view.ladder.total, 1000)
  })
  it('sums the planned P&L by year and FX model', () => {
    deepStrictEqual(view.pl.columns, ['M032', 'M033'])
    strictEqual(view.pl.cells[2027]!['M032'], 10)
    strictEqual(view.pl.cells[2028]!['M033'], 5)
    strictEqual(view.pl.rowTotal[2028], 5)
    strictEqual(view.pl.colTotal['M032'], 10)
    strictEqual(view.pl.total, 15)
  })
})

describe('positionDetail', () => {
  const deals = positionDeals(raw([deal('1'), deal('2', { ZE_DATE: '2028-05-10', ZTSF_MODEL: 'M033' })]), '2026-01-01')
  it('returns every Deal ID without a mark, and one group with it', () => {
    strictEqual(positionDetail(deals, 'BP wise summary').rows.length, 2)
    strictEqual(positionDetail(deals, 'BP wise summary', '0660000645 - DBS BANK LTD').rows.length, 2)
    strictEqual(positionDetail(deals, 'Deal ID status', 'Nothing').rows.length, 0)
    deepStrictEqual(positionDetail(deals, 'Maturity ladder', '2028|MAY').rows.map((r) => r['Deal ID']), ['2'])
    deepStrictEqual(positionDetail(deals, 'Planned P&L for upcoming settlement', '2027|M032').rows.map((r) => r['Deal ID']), ['1'])
  })
  it('formats the amounts and dates for reading', () => {
    const row = positionDetail(deals, 'BP wise summary').rows[0]!
    strictEqual(row['USD volume'], '1,000.50')
    strictEqual(row['End date'], '15-02-2027')
  })
})
