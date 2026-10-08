import { deepStrictEqual, ok, rejects, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { fromFxTransaction, type FxTransaction } from './api.ts'
import { applyAppStr, cleanFields, fieldsOfRow, legTypeOf, resolveStatus, type AppStrRecord } from './appStr.ts'
import { BUSINESS_PARTNERS } from './data.ts'
import { installFixtures } from './fixtures.ts'
import { applyCreated, initialBlotter, mergeLiveRows, setAppDataPending, viewRowPairs } from './logic.ts'
import type { BlotterRow } from './types.ts'
import { createBlotterDeal, loadBlotterDeals, releaseBlotterRows, retryPendingAppData, reverseBlotterDeal } from './workflow.ts'

installFixtures()

const SAP: FxTransaction = {
  CompanyCode: 'SG03',
  FinancialTransaction: '100024',
  ProductType: '12B',
  TransactionType: '619',
  Partner: '400000002',
  ContractDate: '2026-09-30',
  BuyCurrency: 'USD',
  SellCurrency: 'INR',
  LeadCurrency: 'USD',
  FollowCurrency: 'INR',
  BuyAmount: 1000,
  SellAmount: 83000,
  ValueDate: '2026-10-30',
  SpotRate: 83,
  SwapRate: 0,
  ForwardRate: 83,
}

const ctx = { group: 'G03', trader: 'TER' }
const live = (over: Partial<FxTransaction> = {}) => fromFxTransaction({ ...SAP, ...over }, ctx, BUSINESS_PARTNERS)!.row

const draft = (over: Partial<BlotterRow> = {}): BlotterRow => ({
  ...live(),
  id: 'R1',
  seq: 1,
  status: 'DRAFT',
  draftLabel: 'DRAFT-001',
  transactionNumber: '',
  live: false,
  entity: 'OGA',
  ...over,
})

const inSap = (over: Partial<BlotterRow> = {}): BlotterRow => ({
  ...live(),
  id: 'R1',
  seq: 1,
  ...over,
})

const rec = (over: Partial<AppStrRecord> = {}): AppStrRecord => ({ CompanyCode: 'SG03', FinancialTransaction: '100024', TxnStatus: '01', ...over })

const day = new Date(2026, 8, 30)
const empty = () => initialBlotter(day, [], [...BUSINESS_PARTNERS])

describe('application data fields', () => {
  it('sends nothing for a field the row cannot supply', () => {
    deepStrictEqual(fieldsOfRow(inSap()), {})
  })

  it('maps the Deal ID fields once the row has them, and the remarks only on NDF rows', () => {
    // No D1 / D2 label on the row: the Deal ID goes, a deal type does not (and never the Deal ID's own 'FX').
    deepStrictEqual(fieldsOfRow(inSap({ dealId: '7000000007', mcRef: '2000000028', dealDescription: 'Nidhi S_OSIPL_2026' })), {
      ZtsfDealID: '7000000007',
      ZtsfMcRefNo: '2000000028',
      ZtsfDealDesc: 'Nidhi S_OSIPL_2026',
    })
    deepStrictEqual(fieldsOfRow(inSap({ dealId: '7000000007', dealType: 'D2 (Paired Model)' })), { ZtsfDealID: '7000000007', ZtsfDealType: 'D2' })
    // A leg label without a Deal ID is not a link: nothing is written.
    deepStrictEqual(fieldsOfRow(inSap({ dealType: 'D1 (Paired Model)' })), {})
    deepStrictEqual(fieldsOfRow(inSap({ foRemark: 'fo', moRemark: 'mo' })), {})
    deepStrictEqual(fieldsOfRow(inSap({ txnType: 'NDF', foRemark: 'fo', moRemark: 'mo' })), { NdfFoRem: 'fo', NdfMoRem: 'mo' })
  })

  it('cuts a field to the length the service stores and drops blanks', () => {
    deepStrictEqual(cleanFields({ ZtsfDealDesc: 'x'.repeat(200), NdfFoRem: '  ', ZtsfBcurr: ' USD ' }), { ZtsfDealDesc: 'x'.repeat(80), ZtsfBcurr: 'USD' })
  })
})

describe('resolveStatus', () => {
  it('Release writes 03 unless the transaction is already past FO', () => {
    strictEqual(resolveStatus('release', '01', '03'), '03')
    strictEqual(resolveStatus('release', undefined, '03'), '03')
    strictEqual(resolveStatus('release', '07', '03'), '07')
  })
  it('a retried create keeps the stored status; a reverse always writes its own', () => {
    strictEqual(resolveStatus('create', '03', '01'), '03')
    strictEqual(resolveStatus('create', undefined, '01'), '01')
    strictEqual(resolveStatus('reverse', '03', '05'), '05')
  })
})

describe('merging SAP deals with APP_STR on company code + transaction', () => {
  it('shows a deal stored as 03 or 07 as Released, and one stored as 01 as Created', () => {
    const rows = [live(), live({ FinancialTransaction: '100025' }), live({ FinancialTransaction: '100026' })]
    const out = applyAppStr(rows, [
      rec({ TxnStatus: '03', ZtsfDealID: '7000000007', ZtsfMcRefNo: '2000000028' }),
      rec({ FinancialTransaction: '100025', TxnStatus: '07' }),
      rec({ FinancialTransaction: '100026', TxnStatus: '01' }),
    ])
    deepStrictEqual(out.map((r) => r.status), ['RELEASED', 'RELEASED', 'CREATED'])
    deepStrictEqual(out.map((r) => r.txnStatus), ['03', '07', '01'])
    strictEqual(out[0]!.dealId, '7000000007')
    strictEqual(out[0]!.mcRef, '2000000028')
  })

  it('does not join on the transaction number alone', () => {
    const [row] = applyAppStr([live()], [rec({ CompanyCode: 'SG04', TxnStatus: '03' })])
    strictEqual(row!.status, 'CREATED')
    strictEqual(row!.txnStatus, undefined)
  })

  it('never undoes a reversal that SAP reports', () => {
    const [row] = applyAppStr([live({ ActiveStatus: '3' })], [rec({ TxnStatus: '03' })])
    strictEqual(row!.status, 'REVERSED')
  })

  it('a deal with no record stays as SAP shows it', () => {
    const [row] = applyAppStr([live()], [])
    strictEqual(row!.status, 'CREATED')
  })
})

describe('reloading the grid', () => {
  const grid = (row: BlotterRow) => ({ ...empty(), rows: [row] })

  it('picks up a release another user made since the row was loaded', () => {
    const shown = inSap({ txnStatus: '01' })
    const incoming = applyAppStr([live()], [rec({ TxnStatus: '03' })])
    const out = mergeLiveRows(grid(shown), incoming, [])
    strictEqual(out.rows.find((r) => r.id === 'R1')!.status, 'RELEASED')
    strictEqual(out.rows.find((r) => r.id === 'R1')!.txnStatus, '03')
  })

  it('keeps a row Released while its save is still owed, rather than taking the old stored status', () => {
    const shown = inSap({ status: 'RELEASED', appDataPending: { intent: 'release' } })
    const out = mergeLiveRows(grid(shown), applyAppStr([live()], [rec({ TxnStatus: '01' })]), [])
    strictEqual(out.rows.find((r) => r.id === 'R1')!.status, 'RELEASED')
  })

  it('never moves a Released row back to Created', () => {
    const shown = inSap({ status: 'RELEASED', txnStatus: '07' })
    const out = mergeLiveRows(grid(shown), applyAppStr([live()], [rec({ TxnStatus: '01' })]), [])
    strictEqual(out.rows.find((r) => r.id === 'R1')!.status, 'RELEASED')
  })
})

describe('row bookkeeping', () => {
  it('a created row takes 01 when its data saved, and carries the owed save when it did not', () => {
    const b = { ...empty(), rows: [draft(), draft({ id: 'R2', seq: 2 })] }
    const out = applyCreated(
      b,
      new Map([
        ['R1', { companyCode: 'SG03', transaction: '100024' }],
        ['R2', { companyCode: 'SG03', transaction: '100025', appDataPending: { intent: 'create' as const } }],
      ]),
    )
    strictEqual(out.rows[0]!.txnStatus, '01')
    strictEqual(out.rows[0]!.appDataPending, undefined)
    strictEqual(out.rows[1]!.txnStatus, undefined)
    deepStrictEqual(out.rows[1]!.appDataPending, { intent: 'create' })
  })

  it('setAppDataPending clears a settled save and shows the status in View', () => {
    const b = { ...empty(), rows: [inSap({ appDataPending: { intent: 'release' } })] }
    const out = setAppDataPending(b, new Map([['R1', { txnStatus: '03' }]]))
    strictEqual(out.rows[0]!.appDataPending, undefined)
    ok(viewRowPairs(out.rows[0]!, []).some(([k, v]) => k === 'SAP Txn Status' && v.startsWith('03 - FO->MO')))
    ok(viewRowPairs(b.rows[0]!, []).some(([k]) => k === 'Application Data'))
  })
})

// ---------------------------------------------------------------- the calls

type Call = { method: string; url: string; body: Record<string, unknown> | null; ifMatch: string | null }

describe('workflow against the services', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

  /** `stored`: the APP_STR record that exists (null for none). `appFails`: every APP_STR write is refused. */
  const install = (calls: Call[], opts: { stored?: AppStrRecord | null; appFails?: boolean } = {}) => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const headers = new Headers(init?.headers)
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null, ifMatch: headers.get('if-match') })
      if (url.includes('/data/trmTrader')) return json(200, { rows: [{ ZTCODE: 'TRY', ZTRADER: 'TERRY TAY' }] })
      if (url.includes('/api/trmfxapp/')) {
        if (method !== 'GET' && opts.appFails) return json(500, { error: { message: { value: 'service down' } } })
        if (method === 'GET' && url.includes('TrmFxApp(')) return opts.stored ? json(200, opts.stored) : json(404, { error: { message: { value: 'not found' } } })
        if (method === 'GET') return json(200, { value: opts.stored ? [opts.stored] : [] })
        if (method === 'POST') return json(201, {})
        return json(204, null)
      }
      if (method === 'POST' && url.includes('/api/fx/FxTransaction')) return json(201, { ...SAP, FinancialTransaction: '100024' })
      if (method === 'DELETE' && url.includes('/api/fx/FxTransaction')) return json(204, null)
      if (method === 'GET' && url.includes('/api/fx/FxTransaction')) return json(200, { value: [SAP] })
      return json(404, { error: { message: { value: 'unexpected ' + method + ' ' + url } } })
    }) as typeof fetch
  }

  const appWrites = (calls: Call[]) => calls.filter((c) => c.url.includes('/api/trmfxapp/') && c.method !== 'GET')

  it('create: SAP books the deal first, then APP_STR gets BUKRS + RFHA with status 01', async () => {
    const calls: Call[] = []
    install(calls)
    const out = await createBlotterDeal(draft(), day)
    deepStrictEqual([out.companyCode, out.transaction, out.appDataError], ['SG03', '100024', undefined])
    const order = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url.includes('/api/fx/') ? 'fx' : 'app'}`)
    deepStrictEqual(order, ['POST fx', 'POST app'])
    const body = appWrites(calls)[0]!.body!
    strictEqual(body['CompanyCode'], 'SG03')
    strictEqual(body['FinancialTransaction'], '100024')
    strictEqual(body['TxnStatus'], '01')
    strictEqual(body['BlotterDate'], '2026-09-30')
    strictEqual(body['ZtsfBcurr'], 'USD')
    strictEqual(body['ZtsfScurr'], 'INR')
    strictEqual(body['Ztrcode'], 'TRY') // the SAP code of the blotter's trader (TER = TERRY TAY), not the dropdown key
    ok(!('LocalCreatedBy' in body) && !('LastChangedAt' in body))
  })

  it('create: when APP_STR fails the SAP deal stands, nothing is reversed, and the owed save is reported', async () => {
    const calls: Call[] = []
    install(calls, { appFails: true })
    const out = await createBlotterDeal(draft(), day)
    strictEqual(out.transaction, '100024')
    deepStrictEqual(out.appDataPending, { intent: 'create' })
    ok(out.appDataError?.includes('100024') && out.appDataError.includes('created successfully'))
    ok(!calls.some((c) => c.method === 'DELETE'))
    strictEqual(calls.filter((c) => c.method === 'POST' && c.url.includes('/api/fx/')).length, 1)
  })

  it('create: a failed SAP create saves nothing', async () => {
    const calls: Call[] = []
    install(calls)
    await rejects(() => createBlotterDeal(draft({ txnType: 'SWAP' }), day), /not available in SAP/)
    ok(!calls.length)
  })

  it('retry of a create updates the record that exists instead of making a second one', async () => {
    const calls: Call[] = []
    install(calls, { stored: rec({ TxnStatus: '03' }) })
    const outs = await retryPendingAppData([inSap({ appDataPending: { intent: 'create' } })], day)
    ok(outs[0]!.ok)
    const writes = appWrites(calls)
    deepStrictEqual(writes.map((c) => c.method), ['PATCH'])
    strictEqual(writes[0]!.body!['TxnStatus'], '03') // a retried create never moves a released deal back to 01
    strictEqual(writes[0]!.ifMatch, '*')
    ok(writes[0]!.url.includes("TrmFxApp(CompanyCode='SG03',FinancialTransaction='100024')"))
  })

  it('release: PATCHes the Deal ID fields and 03 by composite key, and never repeats a SAP operation', async () => {
    const calls: Call[] = []
    install(calls, { stored: rec() })
    const row = inSap({ status: 'RELEASED', dealId: '7000000007', mcRef: '2000000028' })
    const outs = await releaseBlotterRows([row], { dealId: '7000000007', mcRef: '2000000028', dealDesc: 'D' }, day)
    ok(outs[0]!.ok)
    const [w] = appWrites(calls)
    strictEqual(w!.method, 'PATCH')
    strictEqual(w!.body!['TxnStatus'], '03')
    strictEqual(w!.body!['ZtsfDealID'], '7000000007')
    // This row carries no D1 / D2 label, so no deal type is written: never the Deal ID's own 'FX'.
    ok(!('ZtsfDealType' in w!.body!))
    strictEqual(w!.body!['ZtsfMcRefNo'], '2000000028')
    strictEqual(w!.body!['ZtsfDealDesc'], 'D')
    strictEqual(w!.body!['Ztrcode'], 'TRY')
    ok(!calls.some((c) => c.url.includes('/api/fx/'))) // no SAP Treasury operation is repeated
  })

  it('release: writes each row own leg, D1 or D2, as ZTSF_DEAL_TYPE, never the Deal ID type', async () => {
    const calls: Call[] = []
    install(calls, { stored: rec() })
    const link = { dealId: '7000000007', mcRef: '2000000028' }
    const d1 = inSap({ status: 'RELEASED', dealId: '7000000007', dealType: 'D1 (Paired Model)' })
    const d2 = inSap({ id: 'R2', status: 'RELEASED', dealId: '7000000007', dealType: 'Deal 2 (Auto Deal)', transactionNumber: '100025' })
    await releaseBlotterRows([d1, d2], link, day)
    const writes = appWrites(calls)
    deepStrictEqual(writes.map((w) => w.body!['ZtsfDealType']), ['D1', 'D2'])
  })

  it('release: a settlement leg, a short straddle or a plain attach gets no deal type at all', async () => {
    const calls: Call[] = []
    install(calls, { stored: rec() })
    const link = { dealId: '7000000007', mcRef: '2000000028' }
    const rows = ['Settlement', 'Short Straddle (No-Invoice)', 'PAIR', ''].map((dealType, i) =>
      inSap({ id: 'S' + i, status: 'RELEASED', dealId: '7000000007', dealType, transactionNumber: '20000' + i }),
    )
    await releaseBlotterRows(rows, link, day)
    ok(appWrites(calls).every((w) => !('ZtsfDealType' in w.body!)))
  })

  it('legTypeOf reads D1 / D2 from every label the blotter gives a leg, and nothing else', () => {
    deepStrictEqual(
      ['D1', 'D1 (Paired Model)', 'Deal 1', 'Deal 1 (Auto Deal)'].map(legTypeOf),
      ['D1', 'D1', 'D1', 'D1'],
    )
    deepStrictEqual(['D2', 'D2 (Paired Model)', 'Deal 2', 'Deal 2 (Auto Deal)'].map(legTypeOf), ['D2', 'D2', 'D2', 'D2'])
    deepStrictEqual(['', undefined, 'Settlement', 'PAIR', 'FX', 'D10', 'DS1', 'Short Straddle'].map(legTypeOf), Array(8).fill(undefined))
  })

  it('release: a transaction MO already matched (07) keeps 07', async () => {
    const calls: Call[] = []
    install(calls, { stored: rec({ TxnStatus: '07' }) })
    await releaseBlotterRows([inSap({ status: 'RELEASED' })], undefined, day)
    strictEqual(appWrites(calls)[0]!.body!['TxnStatus'], '07')
  })

  it('release: a failed save is reported per row and can be retried alone', async () => {
    const calls: Call[] = []
    install(calls, { stored: rec(), appFails: true })
    const outs = await releaseBlotterRows([inSap({ status: 'RELEASED' })], undefined, day)
    strictEqual(outs[0]!.ok, false)
    ok(outs[0]!.error?.includes('released successfully'))
    install((calls.length = 0, calls), { stored: rec() })
    const again = await retryPendingAppData([inSap({ status: 'RELEASED', appDataPending: { intent: 'release' } })], day)
    ok(again[0]!.ok)
    strictEqual(appWrites(calls)[0]!.body!['TxnStatus'], '03')
  })

  it('release: a demo row, which has no SAP transaction, is skipped', async () => {
    const calls: Call[] = []
    install(calls)
    deepStrictEqual(await releaseBlotterRows([inSap({ live: false })], undefined, day), [])
    ok(!calls.length)
  })

  it('reverse: SAP reverses first, then APP_STR gets 02 (still with FO) or 05 (already released)', async () => {
    const calls: Call[] = []
    install(calls, { stored: rec() })
    const created = await reverseBlotterDeal(inSap({ status: 'CREATED' }), day)
    strictEqual(created.status, '02')
    const released = await reverseBlotterDeal(inSap({ status: 'RELEASED' }), day)
    strictEqual(released.status, '05')
    const order = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url.includes('/api/fx/') ? 'fx' : 'app'}`)
    deepStrictEqual(order, ['DELETE fx', 'PATCH app', 'DELETE fx', 'PATCH app'])
    deepStrictEqual(appWrites(calls).map((c) => c.body!['TxnStatus']), ['02', '05'])
  })

  it('reverse: if APP_STR fails the reversal still stands and the save is owed', async () => {
    const calls: Call[] = []
    install(calls, { stored: rec(), appFails: true })
    const out = await reverseBlotterDeal(inSap({ status: 'CREATED' }), day)
    deepStrictEqual(out.pending, { intent: 'reverse', status: '02' })
    ok(out.error?.includes('reversed successfully'))
  })

  it('load: reads the day’s deals and their records by BUKRS + RFHA together', async () => {
    const calls: Call[] = []
    install(calls, { stored: rec({ TxnStatus: '03' }) })
    const out = await loadBlotterDeals(day)
    strictEqual(out.deals.length, 1)
    strictEqual(out.records[0]!.TxnStatus, '03')
    const q = decodeURIComponent(calls.find((c) => c.url.includes('/api/trmfxapp/TrmFxApp?'))!.url.replace(/\+/g, ' '))
    ok(q.includes("CompanyCode eq 'SG03' and FinancialTransaction eq '100024'"))
  })

  it('load: an unreadable APP_STR still returns the deals, flagged, with nothing guessed', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      String(input).includes('/api/trmfxapp/') ? json(500, { error: { message: { value: 'down' } } }) : json(200, { value: [SAP] })) as typeof fetch
    const out = await loadBlotterDeals(day)
    strictEqual(out.deals.length, 1)
    deepStrictEqual(out.records, [])
    ok(out.appDataError)
  })
})
