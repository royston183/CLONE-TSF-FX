import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  entityHelp,
  indicatorRows,
  isoDay,
  legsNotice,
  loadFxLegs,
  mcRefFilter,
  statusHelp,
  toDeal,
  toFxLeg,
  toMasterContract,
} from './api.ts'
import { COMP_ROWS, DEAL_ROWS, MC_ROWS, SET_TYP_ROWS, STATUS_ROWS } from './fixtures.ts'

describe('value helps', () => {
  it("Status: ZSGTSFTR_DEAL_ST WHERE zsub_type = 'FX1' (the <= '02' limit is commented out)", () => {
    deepStrictEqual(statusHelp(STATUS_ROWS), [
      { code: '01', sdesc: 'FO: FX Deals Created' },
      { code: '05', sdesc: 'Invoice Created in TRM' },
      { code: '07', sdesc: 'Partial Invoice Created iin TRM' },
      { code: '30', sdesc: 'Deal ID Cancelled' },
    ])
  })

  it('Origin Entity: ZSGTSFTR_COMP by code, with its region', () => {
    deepStrictEqual(entityHelp(COMP_ROWS).map((e) => `${e.code}/${e.regionId}`), ['DMCC/R01', 'OSIPL/R02', 'OSL/', 'OTL/R01'])
  })

  it('heads-up indicators: SET_TYP WHERE zhead_fx <> space OR zhead_opt <> space', () => {
    deepStrictEqual(indicatorRows(SET_TYP_ROWS), [
      { modelId: 'M033', headFx: 'X', headOpt: '' },
      { modelId: 'M03402', headFx: '', headOpt: 'X' },
    ])
  })
})

describe('row mappings', () => {
  it('maps a ZSGTSFTR_DEALID row; initial dates become blank', () => {
    const d = toDeal(DEAL_ROWS[1] ?? {})
    strictEqual(d.dealId, '7000000007')
    strictEqual(d.maturityDate, '2026-10-05')
    strictEqual(d.confirmed, true)
    strictEqual(d.plRate, 90.4)
    strictEqual(d.changedDate, '')
    strictEqual(isoDay('0000-00-00'), '')
    strictEqual(isoDay(null), '')
  })

  it('maps a ZSGTSFTR_MAS_CON row', () => {
    const mc = toMasterContract(MC_ROWS[0] ?? {})
    deepStrictEqual([mc.ref, mc.origin, mc.modelId, mc.amt], ['2000000005', 'OSIPL', 'M032', 100000])
  })

  it('maps a TrmFxApp row joined to its FxTransaction as an FX leg (bank = partner name, fixing day has no source)', () => {
    const fx = { CompanyCode: 'SG03', FinancialTransaction: '3', ProductType: '12D', TransactionType: '619', Partner: '400000002', BuyCurrency: 'INR', SellCurrency: 'USD', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyAmount: 830, SellAmount: -10 }
    const app = { CompanyCode: 'SG03', FinancialTransaction: '3', ZtsfDealID: '7', ZtsfDealType: 'D1', ZtsfMcRefNo: '2' }
    deepStrictEqual(toFxLeg({ fx, app }, { partners: new Map([['400000002', 'HSBC']]), txnTypes: new Map() }), {
      dealId: '7', type: 'D1', mcRef: '2', curr1: 'USD', curr2: 'INR', amt1: 10, amt2: 830, sgsart: '12D', bp: 'HSBC', ndfDate: '',
    })
    strictEqual(toFxLeg({ fx, app }).bp, '400000002', 'without a name the partner number is shown')
  })
})

describe('FX legs from ZSGTSFTR_APP_STR', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  it('filters by Master Contract reference', () => {
    strictEqual(mcRefFilter(['2', '3']), "(ZtsfMcRefNo eq '2' or ZtsfMcRefNo eq '3')")
  })
  it('reads the APP_STR rows of the MC refs and joins them to the transactions', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = decodeURIComponent(String(input).replaceAll('+', ' '))
      urls.push(u)
      const body = u.includes('/api/trmfxapp/')
        ? { value: [{ CompanyCode: 'SG03', FinancialTransaction: '3', ZtsfDealID: '7', ZtsfDealType: 'D1', ZtsfMcRefNo: '2' }] }
        : u.includes('/api/fx/')
          ? { value: [{ CompanyCode: 'SG03', FinancialTransaction: '3', ProductType: '12D', TransactionType: '619', Partner: '4', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyAmount: 10, SellAmount: 830 }] }
          : { value: [], d: { results: [] } }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const legs = await loadFxLegs(['2', '2', ''])
    deepStrictEqual(legs.map((l) => [l.dealId, l.type, l.mcRef, l.curr1, l.amt1, l.sgsart]), [['7', 'D1', '2', 'USD', 10, '12D']])
    ok(urls.some((u) => u.includes('/api/trmfxapp/') && u.includes("ZtsfMcRefNo eq '2'")))
  })
  it('reads nothing without Master Contract references', async () => {
    globalThis.fetch = (async () => {
      throw new Error('no request expected')
    }) as typeof fetch
    deepStrictEqual(await loadFxLegs([]), [])
  })
})

describe('option leg gate', () => {
  it('says WAITING FOR API for the option legs (utilisation) and the fixing day while ZSGTSFCDS_OPTION is not served', () => {
    strictEqual(
      legsNotice(false),
      'WAITING FOR API — ZSGTSFCDS_OPTION is not served by the middleware. FX Utilisation Amount stays blank; Fixing Day (NDF_DATE) has no source in ZSGTSFTR_APP_STR / FxTransaction.',
    )
    strictEqual(legsNotice(true), null)
  })
})
