import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  AREA_CODES,
  declaredProperties,
  extendCreatePayload,
  extendedAppFields,
  fixingDateOf,
  forgetDeclaredProperties,
  installAreaCodes,
  portfolioOf,
  toAreaCodes,
} from './extendedFields.ts'
import type { BlotterRow } from './types.ts'

const row = (over: Partial<BlotterRow> = {}): BlotterRow =>
  ({
    txnType: 'FWD',
    curr1: 'USD',
    curr2: 'INR',
    group: 'G03',
    portfolio: '',
    assignment: 'BARX',
    profitCenter: 'TSF-SLC',
    businessArea: 'SINGAPORE',
    ndfRef: '',
    ndfDate: null,
    valueDate: new Date(2026, 10, 9),
    ...over,
  }) as BlotterRow

const metadata = (fx: string[], app: string[]) => (url: string) => {
  const props = (names: string[]) => names.map((n) => `<Property Name="${n}" Type="Edm.String"/>`).join('')
  if (url.includes('/api/fx/')) return `<Schema><EntityType Name="FxTransactionType">${props(fx)}</EntityType></Schema>`
  if (url.includes('/api/trmfxapp/')) return `<Schema><EntityType Name="TrmFxAppType">${props(app)}</EntityType></Schema>`
  return ''
}

describe('extended deal fields', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    forgetDeclaredProperties()
    installAreaCodes({ profitCenters: {}, businessAreas: {} })
  })
  const serve = (fx: string[], app: string[]) => {
    const body = metadata(fx, app)
    globalThis.fetch = (async (input: RequestInfo | URL) => new Response(body(String(input)), { status: 200 })) as typeof fetch
  }

  it('reads the property names an entity type declares', () => {
    deepStrictEqual([...declaredProperties('<EntityType Name="FxTransactionType"><Property Name="A"/><Property Name="B"/></EntityType>', 'FxTransaction')], ['A', 'B'])
    strictEqual(declaredProperties('', 'FxTransaction').size, 0)
  })

  it('maps profit centre and business area names to their codes, first one winning', () => {
    const codes = toAreaCodes([
      { ZFX_PC_NAME: 'TSF-SLC', ZFX_PRCTR: 'AE1147', ZBA_NAME: 'SINGAPORE', ZRBUSA: '0975', ZBA_NAME_O: 'SINGAPORE', ZRBUSA_O: '9999', ZBA_NAME_B: 'DUBAI', ZRBUSA_B: '0606' },
    ])
    deepStrictEqual(codes.profitCenters, { 'TSF-SLC': 'AE1147' })
    deepStrictEqual(codes.businessAreas, { SINGAPORE: '0975', DUBAI: '0606' })
  })

  it('fixes two working days before the value date unless the row names a date', () => {
    // SAP's own date for a deal valued Tue 10.11.2026 is Fri 06.11.2026, not the Sunday two calendar days back.
    deepStrictEqual(fixingDateOf({ ndfDate: null, valueDate: new Date(2026, 10, 10) }), new Date(2026, 10, 6))
    deepStrictEqual(fixingDateOf({ ndfDate: null, valueDate: new Date(2026, 10, 12) }), new Date(2026, 10, 10))
    deepStrictEqual(fixingDateOf({ ndfDate: new Date(2026, 10, 3), valueDate: new Date(2026, 10, 9) }), new Date(2026, 10, 3))
    strictEqual(fixingDateOf({ ndfDate: null, valueDate: null }), null)
  })

  it('adds nothing when the service declares none of the new fields and the portfolio is the blotter placeholder', async () => {
    serve(['CompanyCode', 'Portfolio'], [])
    deepStrictEqual(await extendCreatePayload({ CompanyCode: 'SG03' }, row({ portfolio: 'TRADING' })), { CompanyCode: 'SG03' })
    deepStrictEqual(await extendCreatePayload({ CompanyCode: 'SG03' }, row({ portfolio: '' })), { CompanyCode: 'SG03' })
  })

  it('sends a portfolio only when it is a real one', () => {
    strictEqual(portfolioOf({ portfolio: '2000' }), '2000')
    strictEqual(portfolioOf({ portfolio: 'TRADING' }), '')
    strictEqual(portfolioOf({ portfolio: '' }), '')
  })

  it('sends the fields the service declares, with codes for the profit centre and business area', async () => {
    installAreaCodes({ profitCenters: { 'TSF-SLC': 'AE1147' }, businessAreas: { SINGAPORE: '0975' } })
    serve(['BusinessArea', 'ProfitCenter', 'Assignment', 'NdfFixingDate', 'FixingReferenceId', 'NdfFixingCurrency'], [])
    const out = await extendCreatePayload({}, row({ txnType: 'DNDF', ndfRef: 'FIX1', portfolio: '2000' }))
    deepStrictEqual(out, {
      Portfolio: '2000',
      BusinessArea: '0975',
      ProfitCenter: 'AE1147',
      Assignment: 'BARX',
      NdfFixingDate: '2026-11-05',
      // FixingReferenceId is withheld while SEND_FIXING_REFERENCE is false.
    })
    assertNoLeak(AREA_CODES)
  })

  it('leaves the NDF fields off a forward', async () => {
    serve(['NdfFixingDate', 'NdfFixingCurrency'], [])
    const out = await extendCreatePayload({}, row())
    deepStrictEqual(out, {})
  })

  it('adds the TSF code, group and currency pair under the names TrmFxApp declares, and nothing it does not', async () => {
    serve([], ['ZtsfCode', 'Zgrp'])
    deepStrictEqual(await extendedAppFields(row(), 'USD/INR'), { ZtsfCode: 'DE6', Zgrp: 'G03' })
    forgetDeclaredProperties()
    serve([], [])
    deepStrictEqual(await extendedAppFields(row(), 'USD/INR'), {})
  })
})

function assertNoLeak(codes: typeof AREA_CODES) {
  strictEqual(Object.keys(codes.businessAreas).length, 1)
}
