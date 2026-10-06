import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DealContext } from '../../shared/fx/deal-id.ts'
import { dealListed, isT1, joins, statusHelp, statusThresholds, totalInvoicedT1 } from './api.ts'
import { buildDeals } from './fixtures.ts'
import { filterDeals, totalInvoiced, utilizationKnown } from './logic.ts'

// ZGTCATR_PARAM PROGNAM ZSGTSFVNP_BP_WORKBENCH as the middleware served it on 2026-10-05.
const param = { PROGNAM: 'ZSGTSFVNP_BP_WORKBENCH', PARAM1: 'USD', PARAM4: '02', PARAM5: '01', PARAM6: '03' }
const th = statusThresholds(param)!

describe('FORM modify_drop_down thresholds', () => {
  it("gv_deal = '0' && 3+3+2, gv_deal2 = '0' && 3+2, gv_deal3 = '0' && 3+1", () => {
    deepStrictEqual(th, { deal: '08', deal2: '05', deal3: '04' })
  })
  it('no usable params, no thresholds (the screen then says WAITING FOR API)', () => {
    strictEqual(statusThresholds({ PARAM4: '', PARAM5: '', PARAM6: '' }), null)
  })
  it("P_STAT: DEAL_ST WHERE zsub_type = 'FX1' AND zdeal_stat <= gv_deal", () => {
    const statuses = [
      { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '08', ZDEAL_SDESC: 'GT Invoice No. updated in TRM for Partial Invoice' },
      { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' },
      { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '20', ZDEAL_SDESC: 'Settlement Initiated' },
      { ZSUB_TYPE: 'FX2', ZDEAL_STAT: '02', ZDEAL_SDESC: 'Option' },
    ]
    deepStrictEqual(statusHelp(statuses, th), [
      ['01', 'FO: FX Deals Created'],
      ['08', 'GT Invoice No. updated in TRM for Partial Invoice'],
    ])
  })
})

describe('FORM sub_get_data', () => {
  it("zinv_ref+11(2) = 'T1'", () => {
    strictEqual(isT1({ ZINV_REF: '7000000006-T1' }), true)
    strictEqual(isT1({ ZINV_REF: '7000000006-T2' }), false)
    strictEqual(isT1({ ZINV_REF: '12000013-T1' }), false) // a short Deal ID puts T1 elsewhere: the report drops it too
  })

  it('a deal row survives up to gv_deal3; from gv_deal2 on only its T1 invoices keep it listed', () => {
    const t1 = [{ ZINV_REF: '7000000006-T1', ZINV_TYPE: 'I01', ZAMT_USD: '100.00' }]
    strictEqual(dealListed('01', [], th), true)
    strictEqual(dealListed('04', [], th), true)
    strictEqual(dealListed('05', [], th), false)
    strictEqual(dealListed('05', t1, th), true)
    strictEqual(dealListed('08', t1, th), true)
    strictEqual(dealListed('30', t1, th), false)
    strictEqual(dealListed('05', [{ ZINV_REF: '7000000006-T1', ZINV_TYPE: '' }], th), false)
  })

  it('Total Invoiced Amt = ZTOT_AMT_INV: the T1 ZAMT_USD over I01 / I02 / I03', () => {
    strictEqual(
      totalInvoicedT1([
        { ZINV_TYPE: 'I01', ZAMT_USD: '1000.50' },
        { ZINV_TYPE: 'I02', ZAMT_USD: '250.00' },
        { ZINV_TYPE: 'X', ZAMT_USD: '999' },
      ]),
      1250.5,
    )
  })

  it('INNER JOINs: MC, COMP (MC origin), FX1 status row, COMODIT (MC commodity)', () => {
    const ctx: DealContext = {
      comp: new Map([['OSIPL', { ZCOM_ID: 'OSIPL', ZREG_ID: 'R02' }]]),
      models: new Map(),
      statuses: [{ ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01' }],
      mcs: new Map([
        ['1', { ZMC_REF_NO: '1', ZORIGIN: 'OSIPL', ZCOMMODITY: 'C105' }],
        ['2', { ZMC_REF_NO: '2', ZORIGIN: 'OSIPL', ZCOMMODITY: 'C999' }],
        ['3', { ZMC_REF_NO: '3', ZORIGIN: 'XX', ZCOMMODITY: 'C105' }],
      ]),
      source: 'mysql',
    }
    const comodit = new Map([['C105', { ZCOM_ID: 'C105', ZCOM_DESC: 'Cotton' }]])
    strictEqual(joins({ ZDEAL_STAT: '01', ZMC_REF: '1' }, ctx, comodit), true)
    strictEqual(joins({ ZDEAL_STAT: '02', ZMC_REF: '1' }, ctx, comodit), false)
    strictEqual(joins({ ZDEAL_STAT: '01', ZMC_REF: '2' }, ctx, comodit), false)
    strictEqual(joins({ ZDEAL_STAT: '01', ZMC_REF: '3' }, ctx, comodit), false)
    strictEqual(joins({ ZDEAL_STAT: '01', ZMC_REF: '9' }, ctx, comodit), false)
  })
})

describe('screen filters (fixtures)', () => {
  const deals = buildDeals().map((d) => ({ ...d, origin: 'OSIPL', region: 'R01' }))
  const base = { q: '', region: 'ALL', origin: 'ALL', model: 'ALL', status: 'ALL' }
  it('a~ze_date IN p_date: BT with both dates, EQ with the low date only', () => {
    deepStrictEqual(
      filterDeals(deals, { ...base, dateFrom: '01-06-2026', dateTo: '30-09-2026' }).map((d) => d.dealId),
      ['TSF-9081', 'TSF-9042', 'TSF-8890'],
    )
    deepStrictEqual(
      filterDeals(deals, { ...base, dateFrom: '20-07-2026', dateTo: '' }).map((d) => d.dealId),
      ['TSF-9042'],
    )
  })
  it('a deal without an end date never matches a date range', () => {
    const noEnd = [{ ...deals[0]!, dealEnd: '' }]
    deepStrictEqual(filterDeals(noEnd, { ...base, dateFrom: '01-01-2026', dateTo: '31-12-2026' }), [])
  })
  it('utilization is blank without FX legs; Total Invoiced prefers ZTOT_AMT_INV', () => {
    const d = { ...deals[0]!, fx: [], totInvUsd: 42 }
    strictEqual(utilizationKnown(d), false)
    strictEqual(totalInvoiced(d), 42)
  })
})
