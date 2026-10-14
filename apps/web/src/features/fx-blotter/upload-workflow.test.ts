import { deepStrictEqual, ok, rejects, strictEqual, throws } from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { canonicalUploadRow } from './logic.ts'
import { installFixtures } from './fixtures.ts'
import { BUSINESS_PARTNERS } from './data.ts'
import { forgetDeclaredProperties } from './extendedFields.ts'
import { prepareUpload, processSapUpload, unsupportedUploadFields, uploadCapabilities, type UploadCapabilities } from './upload-workflow.ts'
import { retryPendingAppData } from './workflow.ts'
import { resolveStatus } from './appStr.ts'

installFixtures()
const day = new Date(2026, 9, 14)
const context = { date: '14-10-2026', group: 'G03', trader: 'TER' }
const input = (extra: Record<string, string> = {}) => canonicalUploadRow({ bukrs: 'SG03', t_date: context.date,
  bp: '400000002', pc: '0000100000', unit: '0001', typ: '619', t_curr: 'USD', t_amt: '30000', o_curr: 'INR',
  buy_sell: 'Buy', v_date: '16-11-2026', all_rate: '95.9550', spot: '95.9', swap: '0.055',
  deal: 'OLAM-01', ztsf_deal_id: '12345', zdeal_type: 'D1', mc_ref: '123', zdeal_seq: '01',
  zmo_remark: 'MO note', zfo_remark: 'FO note', ...extra })
const fxNames = ['CompanyCode', 'FinancialTransaction', 'ProductType', 'TransactionType', 'Partner', 'Portfolio', 'ValuationClass',
  'SpotRate', 'SwapRate', 'ForwardRate', 'NdfFixingDate', 'NdfFixingCurrency', 'FixingReferenceId']
const appNames = ['CompanyCode', 'FinancialTransaction', 'TxnStatus', 'BlotterDate', 'ZtsfDealID', 'ZtsfMcRefNo', 'ZtsfDealType',
  'ZtsfDealDesc', 'ZtsfDealSq', 'NdfFoRem', 'NdfMoRem', 'ZolamDealNo', 'Ztrcode', 'ZtsfBcurr', 'ZtsfScurr']
const props = (names: string[]) => names.map((name) => `<Property Name="${name}" Type="Edm.String" MaxLength="${name === 'ZtsfDealID' ? 15 : name === 'NdfFoRem' || name === 'NdfMoRem' ? 80 : 100}"/>`).join('')
const fxXml = `<EntityType Name="FxTransactionType">${props(fxNames)}</EntityType><Action Name="Settle" IsBound="true"/>`
const appXml = `<EntityType Name="TrmFxAppType">${props(appNames)}</EntityType>`
const caps = (): UploadCapabilities => uploadCapabilities(fxXml, appXml)
type Call = { method: string; url: string; body: Record<string, unknown> }
type Failure = 'create' | 'app-create' | 'release' | 'settle' | 'settlement-status'

function serve(failure?: Failure) {
  const calls: Call[] = []
  const stored = new Map<string, Record<string, unknown>>()
  let number = 7000
  const json = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = (async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    calls.push({ method, url, body })
    if (url.endsWith('$metadata')) return new Response(url.includes('/api/fx/') ? fxXml : appXml)
    if (url.includes('/api/middleware/data/trmTrader')) return json({ rows: [{ ZTRADER: 'TERRY TAY', ZTRD_CODE: 'TRY' }] })
    const refusal = () => json({ error: { message: `Refused ${failure}` } }, 400)
    if (method === 'POST' && url.endsWith('/api/fx/FxTransaction')) return failure === 'create' ? refusal() : json({ ...body, FinancialTransaction: String(++number) }, 201)
    if (url.endsWith('.Settle')) return failure === 'settle' ? refusal() : json({}, 200)
    if (url.includes('/api/trmfxapp/TrmFxApp')) {
      const key = String(body['FinancialTransaction'] ?? /FinancialTransaction='([^']+)'/.exec(url)?.[1] ?? '')
      if (method === 'GET') return stored.has(key) ? json(stored.get(key)) : json({ error: { message: 'Not found' } }, 404)
      if (method === 'POST' && failure === 'app-create') return refusal()
      if (method === 'PATCH' && (body['TxnStatus'] === '03' && failure === 'release' || body['TxnStatus'] === '07' && failure === 'settlement-status')) return refusal()
      stored.set(key, { ...stored.get(key), ...body })
      return json(null, 204)
    }
    return json({ error: { message: `Unexpected ${method} ${url}` } }, 404)
  }) as typeof fetch
  return { calls, stored }
}

describe('FX upload DEALCREATE workflow', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => forgetDeclaredProperties())
  afterEach(() => { globalThis.fetch = realFetch; forgetDeclaredProperties() })
  const prepared = (rows = [input()]) => prepareUpload(rows, context, BUSINESS_PARTNERS, caps())
  const writes = (calls: Call[]) => calls.filter((c) => c.method !== 'GET')

  it('creates with exact SAP type, explicit rates, working deal-create defaults and real RFHA', async () => {
    const { calls, stored } = serve()
    const results = await processSapUpload(prepared(), 'CREATE', caps())
    strictEqual(results[0]?.state, 'success')
    strictEqual(results[0]?.row.transactionNumber, '7001')
    const post = writes(calls)[0]!
    deepStrictEqual([post.body['ProductType'], post.body['TransactionType'], post.body['ValuationClass'], post.body['Portfolio']], ['12B', '619', '0011', undefined])
    deepStrictEqual([post.body['BuyAmount'], post.body['SellAmount'], post.body['ForwardRate'], post.body['SpotRate']], [30000, 2878650, 95.955, 95.9])
    const app = stored.get('7001')!
    deepStrictEqual([app['TxnStatus'], app['ZtsfDealType'], app['ZtsfDealID'], app['ZolamDealNo']], ['01', 'D1', '12345', 'OLAM-01'])
    ok(!('NdfFoRem' in app) && !('NdfMoRem' in app))
    ok(!calls.some((c) => /Order|Execute|Settle/.test(c.url)))
  })

  it('Contract creates and releases to MO without requiring OrderExecute', async () => {
    const { calls, stored } = serve()
    const [result] = await processSapUpload(prepared(), 'CONTRACT', caps())
    strictEqual(result?.row.status, 'RELEASED')
    strictEqual(stored.get('7001')?.['TxnStatus'], '03')
    deepStrictEqual(writes(calls).map((c) => c.method), ['POST', 'POST', 'PATCH'])
  })

  it('Settlement uses the bound SAP action after release, then records 07', async () => {
    const { calls, stored } = serve()
    const [result] = await processSapUpload(prepared(), 'SETTLEMENT', caps())
    strictEqual(result?.state, 'success')
    strictEqual(result?.row.settled, true)
    strictEqual(stored.get('7001')?.['TxnStatus'], '07')
    deepStrictEqual(writes(calls).map((c) => c.url.includes('.Settle') ? 'settle' : c.url.includes('/api/fx/') ? 'create' : String(c.body['TxnStatus'])), ['create', '01', '03', 'settle', '07'])
  })

  for (const failure of ['create', 'app-create', 'release', 'settle', 'settlement-status'] as const) {
    it(`reports ${failure} honestly and never creates the next row or retries SAP`, async () => {
      const { calls } = serve(failure)
      const results = await processSapUpload(prepared([input(), input()]), 'SETTLEMENT', caps())
      strictEqual(results[0]?.state, failure === 'create' ? 'error' : 'partial')
      strictEqual(results[1]?.state, 'skipped')
      strictEqual(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/fx/FxTransaction')).length, 1)
      ok(!calls.some((c) => c.method === 'DELETE'))
      if (failure !== 'create') strictEqual(results[0]?.row.transactionNumber, '7001')
      if (failure === 'app-create' || failure === 'release') ok(!calls.some((c) => c.url.endsWith('.Settle')))
      if (failure === 'settlement-status') {
        strictEqual(results[0]?.row.settled, true)
        strictEqual(results[0]?.row.appDataPending?.intent, 'settle')
        // Refresh retries application data alone, with the saved per-row date.
        const row = results[0]!.row
        const next = serve()
        const retry = await retryPendingAppData([row], day)
        strictEqual(retry[0]?.ok, true)
        ok(!next.calls.some((c) => c.url.endsWith('.Settle') || c.url.endsWith('/api/fx/FxTransaction')))
        strictEqual(next.stored.get('7001')?.['TxnStatus'], '07')
      }
    })
  }

  it('uploads NDF dates and fixing reference even though the grid withholds fixing references', async () => {
    const { calls, stored } = serve()
    await processSapUpload(prepared([input({ typ: '631', ndf_date: '12-11-2026', ndf_ref: 'FBIL' })]), 'CREATE', caps())
    const post = writes(calls)[0]!.body
    deepStrictEqual([post['ProductType'], post['TransactionType'], post['FixingReferenceId'], post['NdfFixingDate'], post['NdfFixingCurrency']], ['12D', '631', 'FBIL', '2026-11-12', 'USD'])
    deepStrictEqual([stored.get('7001')?.['NdfFoRem'], stored.get('7001')?.['NdfMoRem']], ['FO note', 'MO note'])
  })

  it('keeps an explicit uploaded transaction status and row blotter date', async () => {
    const { stored } = serve()
    const [result] = await processSapUpload(prepared([input({ ztxn_status: '59', zblotr_date: '13-10-2026', zdeal_type: '00' })]), 'SETTLEMENT', caps())
    strictEqual(result?.row.txnStatus, '59')
    deepStrictEqual([stored.get('7001')?.['TxnStatus'], stored.get('7001')?.['BlotterDate'], stored.get('7001')?.['ZtsfDealType']], ['59', '2026-10-13', '00'])
  })

  it('refuses settlement without a declared action before any create', async () => {
    const { calls } = serve()
    await rejects(processSapUpload(prepared(), 'SETTLEMENT', { ...caps(), settle: false }), /does not support settlement/)
    strictEqual(writes(calls).length, 0)
  })

  it('never borrows another deal number when a create returns no key', async () => {
    const backend = serve()
    const original = globalThis.fetch
    globalThis.fetch = (async (request: RequestInfo | URL, init?: RequestInit) => {
      if (String(request).endsWith('/api/fx/FxTransaction') && init?.method === 'POST') return new Response(null, { status: 204 })
      return original(request, init)
    }) as typeof fetch
    const [result] = await processSapUpload(prepared(), 'CREATE', caps())
    strictEqual(result?.state, 'error')
    strictEqual(result?.row.transactionNumber, '')
    ok(result?.message.includes('Check SAP'))
    ok(!backend.calls.some((c) => c.url.includes('$orderby') || c.method !== 'GET'))
  })

  it('recovers a composite SAP key from the create response header without a list lookup', async () => {
    serve()
    const original = globalThis.fetch
    globalThis.fetch = (async (request: RequestInfo | URL, init?: RequestInit) => {
      if (String(request).endsWith('/api/fx/FxTransaction') && init?.method === 'POST') return new Response(null, { status: 204,
        headers: { 'OData-EntityId': "FxTransaction(CompanyCode='SG03',FinancialTransaction='000000007001')" } })
      return original(request, init)
    }) as typeof fetch
    const [result] = await processSapUpload(prepared(), 'CREATE', caps())
    strictEqual(result?.state, 'success')
    strictEqual(result?.row.transactionNumber, '000000007001')
  })
})

describe('upload preparation and compatibility', () => {
  it('maps numeric TOM and DNDF exactly instead of silently converting them', () => {
    const rows = prepareUpload([input({ typ: '602' }), input({ typ: '632' })], context, BUSINESS_PARTNERS, caps())
    deepStrictEqual(rows.map((r) => [r.row.txnType, r.row.uploadProduct?.transactionType]), [['TOM', '602'], ['DNDF', '632']])
  })
  it('calculates reversed pairs by division and per-100 pairs using the blotter rate convention', () => {
    const rows = prepareUpload([input({ t_curr: 'INR', o_curr: 'USD', t_amt: '2878650', buy_sell: 'Sell' }), input({ o_curr: 'IDR', t_amt: '1000', all_rate: '1580000' })], context, BUSINESS_PARTNERS, caps())
    strictEqual(rows[0]?.row.amt2, 30000)
    strictEqual(rows[1]?.row.amt2, 15800000)
  })
  it('rejects unsupported companies, types, malformed partners and missing agreed dates before writes', () => {
    for (const [extra, reason] of [
      [{ bukrs: 'XXXX' }, /Company Code/], [{ typ: 'Unknown' }, /Transaction Type/],
      [{ bp: 'Some New Bank' }, /Business Partner/], [{ bp: 'DBS SG' }, /Business Partner/],
      [{ v_date: '' }, /Value Date/], [{ typ: '631', ndf_ref: 'FBIL', ndf_date: '' }, /NDF Fixing Date/],
      [{ ztsf_deal_id: '1234567890123456' }, /service limit/], [{ typ: '631', ndf_date: '12-11-2026', ndf_ref: 'FBIL', zfo_remark: 'x'.repeat(81) }, /service limit/],
      [{ ztxn_status: '99' }, /workflow status/],
    ] as Array<[Record<string, string>, RegExp]>) throws(() => prepareUpload([input(extra)], context, BUSINESS_PARTNERS, caps()), reason)
    throws(() => prepareUpload([input()], { ...context, date: '31-02-2026' }, BUSINESS_PARTNERS, caps()), /Blotter Date/)
  })
  it('lists fields missing from metadata so users can review omissions', () => {
    deepStrictEqual(unsupportedUploadFields([input({ mot: '360T', ext_ref: 'BANK-01', zfin_proj: 'Project A' })], caps()), ['Profit Center', 'Business Area', 'Mode of Trade', 'External Reference', 'Finance Project', 'FO Remark', 'MO Remark'])
    strictEqual(resolveStatus('settle', '03', '07'), '07')
    strictEqual(resolveStatus('settle', '13', '07'), '13')
    strictEqual(resolveStatus('upload', '01', '59'), '59')
    strictEqual(resolveStatus('upload', '07', '01'), '07')
  })
})
