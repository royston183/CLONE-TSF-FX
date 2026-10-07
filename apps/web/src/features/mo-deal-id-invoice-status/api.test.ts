import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DealContext } from '../../shared/fx/deal-id.ts'
import { fx1Statuses, modelHelp, originHelp, regionHelp, toRow } from './api.ts'
import { loadUsdAmounts } from '../mo-deal-id-invoice-mark/amount.ts'
import { buildSampleData } from './fixtures.ts'
import { filterRows } from './logic.ts'

// Rows as the SLC middleware served them on 2026-10-05.
const statuses = [
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: Option Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '40', ZDEAL_SDESC: 'Option only' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '30', ZDEAL_SDESC: 'Deal ID Cancelled' },
]
const comp = [
  { ZCOM_ID: 'OSIPL', ZBUTXT: 'Olam Agri India', ZREG_ID: 'R02' },
  { ZCOM_ID: 'DMCC', ZBUTXT: 'Olam International DMCC', ZREG_ID: 'R01' },
  { ZCOM_ID: 'OSL', ZBUTXT: 'Olam Shanghai', ZREG_ID: '' },
]

describe('selection-screen helps', () => {
  it('P_ORG from ZSGTSFTR_COMP, P_REG = the COMP region codes with no invented text', () => {
    deepStrictEqual(
      originHelp(comp).map((o) => o.id),
      ['DMCC', 'OSIPL', 'OSL'],
    )
    deepStrictEqual(regionHelp(comp), [
      { id: 'R01', desc: '' },
      { id: 'R02', desc: '' },
    ])
  })

  it('P_MOD from ZSGTSFTR_RULE_BT, one entry per model', () => {
    deepStrictEqual(
      modelHelp([
        { ZMOD_ID: 'M035', ZMOD_DESC: 'INR-INR-Put & Call Option' },
        { ZMOD_ID: 'M035', ZMOD_DESC: 'INR-INR-Put & Call Option' },
        { ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward' },
      ]),
      [
        { id: 'M032', desc: 'INR Long Forward' },
        { id: 'M035', desc: 'INR-INR-Put & Call Option' },
      ],
    )
  })

  it("status texts only from DEAL_ST at sub type 'FX1'", () => {
    deepStrictEqual(fx1Statuses(statuses), { '01': 'FO: FX Deals Created', '30': 'Deal ID Cancelled' })
  })
})

describe('toRow (FORM get_data join)', () => {
  const ctx: DealContext = {
    comp: new Map(comp.map((r) => [r.ZCOM_ID, r])),
    models: new Map(),
    statuses,
    mcs: new Map([['2000000005', { ZMC_REF_NO: '2000000005', ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward', ZORIGIN: 'OSIPL', ZMC_DESC: 'MC 5', ZMC_DATE: '2026-08-01', ZENT_DESC: 'OGA-DMCC-OSIPL' }]]),
    source: 'mysql',
  }

  it("takes origin, model and model text from the MC (b~), region from COMP, status text at 'FX1'", () => {
    const r = toRow({ ZDEAL_ID: '7000000006', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZMC_REF: '2000000005', ZTSF_MODEL: 'M099', ZS_DATE: '2026-09-30', ZE_DATE: '2026-10-30', ZTRD_CODE: 'C14' }, ctx)
    strictEqual(r.modelId, 'M032')
    strictEqual(r.modelDesc, 'INR Long Forward')
    strictEqual(r.origin, 'OSIPL')
    strictEqual(r.region, 'R02')
    strictEqual(r.dealStatusDesc, 'FO: FX Deals Created')
    strictEqual(r.startDate, '2026-09-30')
    strictEqual(r.utiAmt, null) // no amount supplied: blank, never a made-up 0
    strictEqual(r.invStatus, '') // BIL_ADJ assignment commented out in the report
    strictEqual(r.mcDesc, 'MC 5')
    strictEqual(r.entityString, 'OGA-DMCC-OSIPL')
    strictEqual(r.trader, 'C14')
  })

  it('blanks MC fields without an MC and the status text without an FX1 row (LEFT OUTER JOINs)', () => {
    const r = toRow({ ZDEAL_ID: '1', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '40', ZMC_REF: '999' }, ctx)
    strictEqual(r.modelId, '')
    strictEqual(r.origin, '')
    strictEqual(r.region, '')
    strictEqual(r.dealStatusDesc, '')
  })
})

describe('DELETE gt_data filters', () => {
  const rows = buildSampleData()
  it('P_DATE drops deals with zs_date > key date or ze_date < key date (and those without dates)', () => {
    deepStrictEqual(
      filterRows(rows, '', '', '', '', '2024-11-15').map((r) => r.dealId),
      ['1100000031', '1100000001', '1100000012'],
    )
    deepStrictEqual(
      filterRows(rows, '', '', '', '', '2025-01-15').map((r) => r.dealId),
      ['1100000031'],
    )
  })
  it('P_ORG / P_REG / P_MOD', () => {
    deepStrictEqual(
      filterRows(rows, '', 'DMCC', 'R04', 'M034', '').map((r) => r.dealId),
      ['1100000012', '1100000099'],
    )
  })
})

describe('D1(USD) from TrmFxApp + FxTransaction', () => {
  const ctx: DealContext = { comp: new Map(), models: new Map(), statuses: [], mcs: new Map(), source: 'mysql' }
  it('puts the supplied Deal Amt (USD) on the row, zero included', () => {
    strictEqual(toRow({ ZDEAL_ID: '7000000006', ZMC_REF: '2000000005' }, ctx, 125000).utiAmt, 125000)
    strictEqual(toRow({ ZDEAL_ID: '7000000007', ZMC_REF: '' }, ctx, 0).utiAmt, 0)
  })

  it('sums the Deal ID D1 legs (USD side) from TrmFxApp joined with FxTransaction, FX only', async () => {
    const realFetch = globalThis.fetch
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = decodeURIComponent(String(input))
      if (u.includes('/api/trmfxapp/TrmFxApp'))
        return json({ value: [
          { CompanyCode: 'SG03', FinancialTransaction: '1', ZtsfDealID: '7000000006', ZtsfDealType: 'D1', ZtsfMcRefNo: '2000000005' },
          { CompanyCode: 'SG03', FinancialTransaction: '2', ZtsfDealID: '7000000006', ZtsfDealType: 'D2', ZtsfMcRefNo: '2000000005' },
        ] })
      return json({ value: [
        { CompanyCode: 'SG03', FinancialTransaction: '1', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyCurrency: 'USD', SellCurrency: 'INR', BuyAmount: 1000, SellAmount: 83000, ActiveStatus: '0' },
        { CompanyCode: 'SG03', FinancialTransaction: '2', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyCurrency: 'USD', SellCurrency: 'INR', BuyAmount: 500, SellAmount: 41500, ActiveStatus: '0' },
      ] })
    }) as typeof fetch
    try {
      const out = await loadUsdAmounts(new Map([['7000000006', '2000000005']]))
      strictEqual(out.amounts?.get('7000000006'), 1000)
      ok(out.note.includes('WAITING FOR API'))
      ok(out.note.includes('option'))
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
