import { deepStrictEqual, ok, rejects, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeHeadsup, loadHeadsup, type HeadsupInput } from './headsup.ts'
import { seedFxDeals, seedDeal } from './fixtures.ts'

function input(): HeadsupInput {
  const fx = seedFxDeals()
  return {
    model: 'M033',
    fxDeals: [{ ...fx[0]!, amt1: 100, amt2: 1000 }, { ...fx[1]!, amt1: 200, amt2: 2000 }],
    rules: [{ ZSUB_TYPE: 'FX1', ZD1_INV_LINK: '01', ZD2_INV_LINK: '02' }],
    invRef: [{ ZTTYPE: 'T1', ZTRD_CURR: 'USD' }, { ZTTYPE: 'T2', ZTRD_CURR: 'INR' }, { ZTTYPE: 'T3', ZTRD_CURR: 'USD' }],
    billAdj: [
      { ZINV_REF: '12345678901T1', ZAMT_USD: '10', ZAMT: '999' },
      { ZINV_REF: '12345678901T2', ZAMT_USD: '15', ZAMT: '1500' },
    ],
    setTyp: [
      { ZT_TYPE: 'T1-S', ZDSS_DEAL: 'DSS1', ZSELL: 'OGA', ZBUY: 'DMCC', ZHEAD_FX: 'X', ZACTFX: 'Book Spot For' },
      { ZT_TYPE: 'T2-P', ZDSS_DEAL: 'DSS2', ZSELL: 'DMCC', ZBUY: 'OSIPL', ZHEAD_FX: 'X', ZACTFX: 'Remit' },
      { ZT_TYPE: 'T3-P', ZDSS_DEAL: '', ZSELL: 'OGA', ZBUY: 'OSIPL', ZHEAD_FX: 'X', ZACTFX: 'Not selected' },
    ],
  }
}

describe('Headsup: original DIFF.PROCESS_DATA', () => {
  it('uses USD converted bill amounts, non-USD invoice amounts, and the original action rules', () => {
    deepStrictEqual(computeHeadsup(input()), { notice: '', rows: [
      { entity: 'OGA-DMCC', tradeType: 'T1', currency: 'USD', dealAmount: 100, finalAmount: 10, difference: 90, action: 'Book Spot For USD 90.00' },
      { entity: 'DMCC-OSIPL', tradeType: 'T2', currency: 'INR', dealAmount: 2000, finalAmount: 1500, difference: 500, action: 'Remit INR 1,500.00' },
    ] })
  })

  it('links by planned invoice row position, including the second invoice-link column', () => {
    const data = input()
    data.rules = [{ ZSUB_TYPE: 'FX1', ZD2_INV_LINK2: '01', ZD1_INV_LINK2: '02' }]
    deepStrictEqual(computeHeadsup(data).rows.map((r) => r.dealAmount), [200, 1000])
  })

  it('aggregates bills by reference offset 11 and does not use planned invoice amounts', () => {
    const data = input()
    data.invRef = [{ ...data.invRef[0], ZAMT: '99999', ZINV_AMT: '99999' }, ...data.invRef.slice(1)]
    data.billAdj = [...data.billAdj, { ZINV_REF: 'abcdefghijkT1', ZAMT_USD: '5' }, { ZINV_REF: 'T1-not-at-offset', ZAMT_USD: '900' }]
    strictEqual(computeHeadsup(data).rows[0]?.finalAmount, 15)
  })

  it('takes the absolute difference before taking the absolute final invoice total', () => {
    const data = input()
    data.billAdj = [{ ZINV_REF: '12345678901T1', ZAMT_USD: '-10' }]
    const row = computeHeadsup(data).rows[0]!
    deepStrictEqual([row.finalAmount, row.difference, row.action], [10, 110, 'Book Spot For USD 110.00'])
  })

  it('uses the first DSS-linked settlement row and keeps blank actions when flags are not set', () => {
    const data = input()
    data.setTyp = [{ ZT_TYPE: 'T1-P', ZDSS_DEAL: '', ZSELL: 'WRONG', ZHEAD_FX: 'X' }, { ...data.setTyp[0], ZHEAD_FX: '' }, { ...data.setTyp[0], ZSELL: 'LATER' }]
    const rows = computeHeadsup(data).rows
    strictEqual(rows.length, 1)
    deepStrictEqual([rows[0]?.entity, rows[0]?.action], ['OGA-DMCC', ''])
  })

  it('OIL and OGA take precedence over DMCC and use the difference amount', () => {
    const data = input()
    data.setTyp = [{ ...data.setTyp[1], ZSELL: 'DMCC', ZBUY: 'OIL' }]
    strictEqual(computeHeadsup(data).rows[0]?.action, 'Remit INR 500.00')
  })

  it('does not count DS/DSS spots when selecting the model rule', () => {
    const data = input()
    data.fxDeals = [...data.fxDeals, ...['DS1', 'DS2', 'DSS1', 'DSS2'].map((dealType) => ({ ...data.fxDeals[0]!, dealType }))]
    strictEqual(computeHeadsup(data).rows[0]?.dealAmount, 100)
  })

  it('requires the put/call rule when there are more than two base legs', () => {
    const data = input()
    data.fxDeals = [...data.fxDeals, { ...data.fxDeals[0]!, dealType: 'D3' }]
    throws(() => computeHeadsup(data), /invoice-link rules/)
    data.rules = [{ ...data.rules[0], ZD1_PUT_CALL: '1' }]
    strictEqual(computeHeadsup(data).rows[0]?.dealAmount, 100)
  })

  it('reports missing option data explicitly instead of inventing zero option amounts or reminders', () => {
    const data = input()
    data.rules = [{ ZSUB_TYPE: 'FX2' }]
    const view = computeHeadsup(data)
    deepStrictEqual(view.rows, [])
    ok(view.notice.includes('ZSGTSFCDS_OPTION'))
    ok(!view.notice.includes('source not exported'))
  })

  it('distinguishes unconfigured headsup rows from missing model configuration', () => {
    const data = input()
    data.setTyp = []
    deepStrictEqual(computeHeadsup(data), { rows: [], notice: '' })
    data.rules = []
    throws(() => computeHeadsup(data), /invoice-link rules/)
  })
})

describe('Headsup reads', () => {
  it('reads only the source’s four tables, using the full SET_TYP model and four-character RULE_BT model', async () => {
    const calls: { resource: string; filter: Record<string, string> }[] = []
    const signal = new AbortController().signal
    const data = input()
    await loadHeadsup({ ...seedDeal(), fxModelId: 'M03301', dealId: '7000000067' }, data.fxDeals, signal, async (resource, filter, options) => {
      calls.push({ resource, filter })
      strictEqual(options?.signal, signal)
      return resource === 'fxModel' ? [...data.rules] : []
    })
    deepStrictEqual(calls, [
      { resource: 'fxModel', filter: { ZMOD_ID: 'M033' } },
      { resource: 'invRef', filter: { ZDEAL_ID: '7000000067' } },
      { resource: 'billAdjustment', filter: { ZDEAL_ID: '7000000067' } },
      { resource: 'setTyp', filter: { ZMOD_ID: 'M03301' } },
    ])
  })

  it('reports read failures and missing models instead of showing a successful empty result', async () => {
    await rejects(loadHeadsup(seedDeal(), [], undefined, async () => { throw new Error('Unavailable') }), /Unavailable/)
    await rejects(loadHeadsup({ ...seedDeal(), fxModelId: '' }, []), /no master-contract model/)
  })
})
