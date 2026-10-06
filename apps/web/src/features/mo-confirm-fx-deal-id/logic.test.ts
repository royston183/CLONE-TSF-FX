import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeDeal, makeOptionLegs } from './fixtures.ts'
import { fmtAmt, fmtRate } from './format.ts'
import {
  actionVisibility,
  canUpdatePair,
  legNote,
  legRowClass,
  newEditDraft,
  nextSort,
  numStatus,
  quickPickLabel,
  resolveDealId,
  sortedFilteredLegs,
  statusMeta,
  toggleEditing,
  toggleLeg,
} from './logic.ts'
import type { DealPick, Leg } from './types.ts'

const NO_SORT = { key: null, dir: 1 } as const

const rfhas = (legs: readonly Leg[]) => legs.map((l) => l.rfha)

describe('format', () => {
  it('fmtAmt groups, keeps sign and prints "-" for NaN', () => {
    strictEqual(fmtAmt(1234567.5), '1,234,567.50')
    strictEqual(fmtAmt(-1680), '-1,680.00')
    strictEqual(fmtAmt(NaN), '-')
    strictEqual(fmtAmt(undefined), '-')
  })
  it('fmtRate defaults to 4 dp', () => {
    strictEqual(fmtRate(90), '90.0000')
    strictEqual(fmtRate(12.345, 2), '12.35')
    strictEqual(fmtRate(NaN), '-')
  })
})

describe('status helpers', () => {
  it('numStatus parses codes, 0 for junk', () => {
    strictEqual(numStatus('07'), 7)
    strictEqual(numStatus('30'), 30)
    strictEqual(numStatus('x'), 0)
  })
  it('statusMeta takes the SAP text, falls back to the code, and keeps the colour class', () => {
    deepStrictEqual(statusMeta('02', 'MO: FX Deals & MC Assignment Confirmed'), {
      desc: 'MO: FX Deals & MC Assignment Confirmed',
      cls: 'status-02',
    })
    deepStrictEqual(statusMeta('99'), { desc: '99', cls: 'status-01' })
  })
  it('quick pick label is "id · status desc"', () => {
    strictEqual(quickPickLabel({ dealId: '7000000018', status: '30', statusText: 'Deal ID Cancelled' }), '7000000018 · Deal ID Cancelled')
    strictEqual(quickPickLabel({ dealId: '7000000006', status: '01', statusText: '' }), '7000000006 · 01')
  })
})

describe('actionVisibility', () => {
  const vis = (status: string, ssDeal = false, unwind = true) => actionVisibility(makeDeal({ status, ssDeal, unwind }))
  it('UPD / CAN / DEAL_EDIT only at 01', () => {
    for (const s of ['01', '02', '03', '07', '30']) {
      const v = vis(s)
      strictEqual(v.upd, s === '01')
      strictEqual(v.can, s === '01')
      strictEqual(v.dealEdit, s === '01')
    }
  })
  it('REV is excluded unless the user is in TVARVC ZSGTSF_UNWIND', () => {
    deepStrictEqual(
      ['01', '02', '03'].map((s) => vis(s, false, false).rev),
      [false, false, false],
    )
  })
  it('REV only at 02 / 03; PRE / REF / DMS always; SS only for an ssDeal', () => {
    deepStrictEqual(
      ['01', '02', '03', '07', '30'].map((s) => vis(s).rev),
      [false, true, true, false, false],
    )
    const v = vis('07')
    ok(v.pre && v.ref && v.dms)
    strictEqual(v.ssDeal, false)
    strictEqual(vis('30', true).ssDeal, true)
  })
})

describe('resolveDealId', () => {
  const deals: DealPick[] = [{ dealId: '7000000006', status: '01', statusText: '' }]
  it('trims and uppercases', () => {
    deepStrictEqual(resolveDealId('  7000000006 ', deals), { ok: true, id: '7000000006' })
  })
  it('errors on empty and unknown ids', () => {
    deepStrictEqual(resolveDealId('   ', deals), { ok: false, error: 'Enter a Deal ID.' })
    deepStrictEqual(resolveDealId('FXD9', deals), {
      ok: false,
      error: 'Deal ID not found. Try one of the quick picks below.',
    })
  })
})

describe('sortedFilteredLegs', () => {
  const legs = makeOptionLegs()
  it('searches rfha, type, counterparty, currencies and description, case-insensitively', () => {
    deepStrictEqual(rfhas(sortedFilteredLegs(legs, 'PUT', NO_SORT)), ['5000128523'])
    deepStrictEqual(rfhas(sortedFilteredLegs(legs, ' hsbc ', NO_SORT)), ['5000128522', '5000128523'])
    deepStrictEqual(sortedFilteredLegs(legs, 'nothing', NO_SORT), [])
  })
  it('sorts numbers numerically and flips with dir', () => {
    deepStrictEqual(rfhas(sortedFilteredLegs(legs, '', { key: 'fxPl', dir: 1 })), ['5000128523', '5000128522'])
    deepStrictEqual(rfhas(sortedFilteredLegs(legs, '', { key: 'fxPl', dir: -1 })), ['5000128522', '5000128523'])
  })
  it('sorts strings and the status description; MC Ref No leaves the order alone', () => {
    deepStrictEqual(rfhas(sortedFilteredLegs(legs, '', { key: 'rfha', dir: -1 })), ['5000128523', '5000128522'])
    const mixed = [{ ...legs[0]!, txnStatus: '07' }, { ...legs[1]!, txnStatus: '01' }]
    deepStrictEqual(rfhas(sortedFilteredLegs(mixed, '', { key: 'txnStatusDesc', dir: 1 })), ['5000128523', '5000128522'])
    deepStrictEqual(rfhas(sortedFilteredLegs(legs, '', { key: 'mcRef', dir: -1 })), ['5000128522', '5000128523'])
  })
  it('does not reorder its input', () => {
    sortedFilteredLegs(legs, '', { key: 'fxPl', dir: 1 })
    deepStrictEqual(rfhas(legs), ['5000128522', '5000128523'])
  })
  it('nextSort flips the same key and resets on a new one', () => {
    deepStrictEqual(nextSort(NO_SORT, 'amt1'), { key: 'amt1', dir: 1 })
    deepStrictEqual(nextSort({ key: 'amt1', dir: 1 }, 'amt1'), { key: 'amt1', dir: -1 })
    deepStrictEqual(nextSort({ key: 'amt1', dir: -1 }, 'rfha'), { key: 'rfha', dir: 1 })
  })
})

describe('leg selection', () => {
  const leg = makeOptionLegs()[0]!
  it('toggles', () => {
    strictEqual(toggleLeg(null, 'A'), 'A')
    strictEqual(toggleLeg('A', 'A'), null)
    strictEqual(toggleLeg('A', 'B'), 'B')
  })
  it('row classes: pending for 02, selected', () => {
    strictEqual(legRowClass(leg, true), 'row-pending row-selected')
    strictEqual(legRowClass({ ...leg, txnStatus: '07' }, false), '')
  })
  it('the hint', () => {
    strictEqual(legNote(null, false), 'Select a leg to enable Edit Deal Pair · drag it onto Edit Deal Pair')
    strictEqual(legNote(null, true), 'Select a leg to enable Edit Deal Pair')
    strictEqual(legNote('5000128522', true), 'Leg 5000128522 selected')
  })
})

describe('edit draft', () => {
  it('starts locked and empty; Deal Update needs a choice', () => {
    const d = newEditDraft('5000128411')
    deepStrictEqual(d, { oldRfha: '5000128411', editing: false, newRfha: '' })
    strictEqual(canUpdatePair(d), false)
    const e = toggleEditing(d)
    strictEqual(e.editing, true)
    strictEqual(canUpdatePair({ ...e, newRfha: '5000129001' }), true)
    strictEqual(toggleEditing(e).editing, false)
  })
})

