import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PREMIUM_DB, makeDealsDb, makeDmsDb } from './data.ts'
import { fmtAmt, fmtRate } from './format.ts'
import {
  actionVisibility,
  attachMockDocument,
  buildPlRows,
  canUpdatePair,
  cancelDealId,
  legNote,
  legRowClass,
  newEditDraft,
  nextSort,
  numStatus,
  quickPickLabel,
  resolveDealId,
  reverseMoConfirmation,
  saveConfirmDeal,
  sortedFilteredLegs,
  statusMeta,
  toggleEditing,
  toggleLeg,
  updateDealPair,
} from './logic.ts'
import type { Deal, Leg } from './types.ts'

const NO_SORT = { key: null, dir: 1 } as const

function get(deals: readonly Deal[], id: string): Deal {
  const d = deals.find((x) => x.dealId === id)
  if (!d) throw new Error(`no deal ${id}`)
  return d
}
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
  it('statusMeta falls back to the code with status-01', () => {
    deepStrictEqual(statusMeta('02'), { desc: 'Pending MO Confirmation', cls: 'status-02' })
    deepStrictEqual(statusMeta('99'), { desc: '99', cls: 'status-01' })
  })
  it('quick pick label is "id · status desc"', () => {
    strictEqual(quickPickLabel(get(makeDealsDb(), 'FXD2026005')), 'FXD2026005 · No Invoice Plan')
  })
})

describe('actionVisibility', () => {
  const vis = (status: string, ssDeal = false) => actionVisibility({ ...get(makeDealsDb(), 'FXD2026001'), status, ssDeal })
  it('UPD / CAN / DEAL_EDIT only at 01', () => {
    for (const s of ['01', '02', '03', '07', '30']) {
      const v = vis(s)
      strictEqual(v.upd, s === '01')
      strictEqual(v.can, s === '01')
      strictEqual(v.dealEdit, s === '01')
    }
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
  const deals = makeDealsDb()
  it('trims and uppercases', () => {
    deepStrictEqual(resolveDealId('  fxd2026003 ', deals), { ok: true, id: 'FXD2026003' })
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
  const legs = get(makeDealsDb(), 'FXD2026002').legs
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
  const leg = get(makeDealsDb(), 'FXD2026002').legs[0]!
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

describe('saveConfirmDeal', () => {
  it('blocks while any leg is below 07', () => {
    const deals = makeDealsDb()
    deepStrictEqual(saveConfirmDeal(deals, 'FXD2026002', { mcRef: 'X' }), {
      ok: false,
      msg: 'Transaction 5000128522 is not yet ready to be confirmed.',
    })
    deepStrictEqual(saveConfirmDeal(deals, 'NOPE', { mcRef: 'X' }), { ok: false, msg: 'Deal not found.' })
  })
  it('sets the deal and its legs to 07 and takes the MC Ref, without mutating', () => {
    const deals = makeDealsDb()
    const r = saveConfirmDeal(deals, 'FXD2026001', { mcRef: '2000009999' })
    if (!r.ok) throw new Error(r.msg)
    strictEqual(r.msg, 'Deal Confirmed Successfully')
    const d = get(r.deals, 'FXD2026001')
    strictEqual(d.status, '07')
    strictEqual(d.mcRef, '2000009999')
    ok(d.legs.every((l) => l.txnStatus === '07'))
    strictEqual(get(deals, 'FXD2026001').status, '01')
  })
})

describe('reverseMoConfirmation', () => {
  it('reverses 02 / 03 to 01 with legs', () => {
    const deals = makeDealsDb()
    const r = reverseMoConfirmation(deals, 'FXD2026003')
    if (!r.ok) throw new Error(r.msg)
    strictEqual(r.msg, 'MO Confirmation has been reversed successfully.')
    const d = get(r.deals, 'FXD2026003')
    strictEqual(d.status, '01')
    ok(d.legs.every((l) => l.txnStatus === '01'))
    strictEqual(get(deals, 'FXD2026003').status, '03')
  })
  it('refuses other statuses', () => {
    deepStrictEqual(reverseMoConfirmation(makeDealsDb(), 'FXD2026004'), {
      ok: false,
      msg: 'Selected Deal ID cannot be reversed.',
    })
  })
  it('a reversed deal then blocks Change / Confirm on its 01 legs', () => {
    const r = reverseMoConfirmation(makeDealsDb(), 'FXD2026002')
    if (!r.ok) throw new Error(r.msg)
    strictEqual(saveConfirmDeal(r.deals, 'FXD2026002', { mcRef: 'X' }).ok, false)
  })
})

describe('updateDealPair / cancelDealId', () => {
  it('renumbers the old leg only', () => {
    const deals = makeDealsDb()
    const r = updateDealPair(deals, 'FXD2026002', '5000128523', '5000129002')
    if (!r.ok) throw new Error(r.msg)
    strictEqual(r.msg, 'Deal pair updated successfully.')
    deepStrictEqual(rfhas(get(r.deals, 'FXD2026002').legs), ['5000128522', '5000129002'])
    deepStrictEqual(rfhas(get(deals, 'FXD2026002').legs), ['5000128522', '5000128523'])
  })
  it('cancel removes the deal entirely, keeping the others in order', () => {
    const deals = makeDealsDb()
    const r = cancelDealId(deals, 'FXD2026001')
    if (!r.ok) throw new Error(r.msg)
    strictEqual(r.msg, 'FX Deal ID deassigned successfully.')
    deepStrictEqual(
      r.deals.map((d) => d.dealId),
      ['FXD2026002', 'FXD2026003', 'FXD2026004', 'FXD2026005'],
    )
    strictEqual(deals.length, 5)
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

describe('attachMockDocument', () => {
  it('appends a numbered attachment without mutating', () => {
    const dms = makeDmsDb()
    const next = attachMockDocument(dms, 'FXD2026002')
    deepStrictEqual(next.FXD2026002?.[2], { name: 'Supporting_Doc_3.pdf', type: 'Attachment' })
    strictEqual(dms.FXD2026002?.length, 2)
    deepStrictEqual(attachMockDocument(dms, 'FXD2026005').FXD2026005, [
      { name: 'Supporting_Doc_1.pdf', type: 'Attachment' },
    ])
  })
})

describe('buildPlRows', () => {
  it('FXD2026002: sale/purchase by first side, premium income, NDF adj, P&L and %', () => {
    const deal = get(makeDealsDb(), 'FXD2026002')
    const rows = buildPlRows(deal, PREMIUM_DB.FXD2026002 ?? null)
    deepStrictEqual(
      rows.map((r) => r.type),
      ['Sale', 'Purchase', 'Option Premium Income', 'Option Premium Expense', 'NDF Fixing-Profit Adj', 'P&L', 'P&L Orign(%)'],
    )
    const [sale, purchase, income, expense, ndf, pl, pct] = rows
    deepStrictEqual([sale?.famt, sale?.lamt], [22889, 2052400])
    deepStrictEqual([purchase?.famt, purchase?.lamt], [22889, 2058010])
    strictEqual(income?.famt, 2440)
    strictEqual(income?.lamt, 2440 * 89.97)
    ok(Object.is(expense?.famt, -0))
    strictEqual(ndf?.famt, 2440)
    strictEqual(pl?.famt, 4880)
    strictEqual(pl?.cls, 'pl-total-row')
    strictEqual(pct?.cls, 'pl-pct-row')
    strictEqual(pct?.pct, true)
    strictEqual(pct?.famt, (4880 / 2052400) * 100)
    strictEqual(pct?.lamt, pct?.famt)
  })
  it('no sale leg gives 0 %, and a missing premium record makes the INR conversions NaN', () => {
    const deal = get(makeDealsDb(), 'FXD2026001')
    const rows = buildPlRows(deal, null)
    strictEqual(rows[6]?.famt, 0)
    strictEqual(rows[2]?.famt, 0)
    ok(Number.isNaN(rows[5]?.lamt))
    strictEqual(fmtAmt(rows[5]?.lamt), '-')
  })
})
