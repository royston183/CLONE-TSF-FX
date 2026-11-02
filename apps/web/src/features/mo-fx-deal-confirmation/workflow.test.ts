import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { toDeal, type FxTransaction } from './api.ts'
import { moRemarkField, moRemarkPatch, transactionKey, worklistFilter, type MoAppRecord } from './appStr.ts'
import type { Deal } from './types.ts'
import { supportsExternalReference } from './references.ts'
import {
  CORRECTION_REMARK_REQUIRED,
  canMoAct,
  matchAndReleaseDeals,
  moBlockReason,
  requestCorrectionDeals,
  retryWorkflowSave,
  selectionBlockMessage,
  statusAfterMatchRelease,
} from './workflow.ts'

const sap = (over: Partial<FxTransaction> = {}): FxTransaction => ({
  CompanyCode: 'SG03',
  FinancialTransaction: '7000000000001',
  TransactionType: '619',
  Partner: '400000002',
  ContractDate: '2026-09-30',
  ValueDate: '2026-10-30',
  BuyCurrency: 'USD',
  SellCurrency: 'INR',
  BuyAmount: 1000,
  SellAmount: 83000,
  ActiveStatus: '0',
  ActivityCategory: '20',
  ...over,
})

const rec = (over: Partial<MoAppRecord> = {}): MoAppRecord => ({ CompanyCode: 'SG03', FinancialTransaction: '7000000000001', TxnStatus: '03', ...over })

const deal = (txn: Partial<FxTransaction> = {}, record: Partial<MoAppRecord> = {}): Deal => {
  const d = toDeal(sap(txn), new Map(), rec({ FinancialTransaction: txn.FinancialTransaction ?? '7000000000001', ...record }))
  ok(d)
  return d
}

const INPUT = { externalRef: '', internalRef: '', moRemark: '' }

type Call = { method: string; url: string; body: unknown; ifMatch: string | null }

/** Fakes the two services and records every call in order; the stored status is what a GET of the record returns. */
function backend(opts: { stored?: Partial<MoAppRecord> | null; settle?: 'ok' | 'fail'; patch?: 'ok' | 'fail'; externalSupport?: boolean; externalPatch?: 'ok' | 'fail'; metadataFail?: boolean } = {}) {
  const calls: Call[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = decodeURIComponent(String(input))
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined, ifMatch: headers.get('If-Match') })
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/$metadata')) {
      if (opts.metadataFail) return json(503, { error: { message: 'SAP unavailable' } })
      return new Response(`<Schema><EntityType Name="FxTransactionType">${opts.externalSupport ? '<Property Name="ExternalReference" Type="Edm.String" MaxLength="16"/>' : ''}</EntityType></Schema>`, { headers: { 'content-type': 'application/xml' } })
    }
    if (url.endsWith('.Settle')) {
      return opts.settle === 'fail'
        ? json(400, { error: { message: 'BAPI processing was terminated', details: [{ code: 'FTR0/007', message: 'Not yet due for settlement' }] } })
        : json(200, {})
    }
    if (method === 'PATCH' && url.startsWith('/api/fx/')) return opts.externalPatch === 'fail' ? json(400, { error: { message: 'External reference change refused' } }) : json(200, {})
    if (method === 'PATCH') return opts.patch === 'fail' ? json(500, { error: { message: 'APP_STR is locked' } }) : json(200, {})
    if (opts.stored === null) return json(404, { error: { message: 'not found' } })
    return json(200, rec(opts.stored ?? {}))
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = realFetch) }
}

const settles = (calls: Call[]) => calls.filter((c) => c.url.endsWith('.Settle'))
const patches = (calls: Call[]) => calls.filter((c) => c.method === 'PATCH')

let current: ReturnType<typeof backend> | undefined
const fake = (o?: Parameters<typeof backend>[0]) => (current = backend(o))
afterEach(() => current?.restore())

describe('what MO may act on', () => {
  it('allows 03 and 06 only', () => {
    for (const s of ['03', '06']) ok(canMoAct({ txnStatus: s }), s)
    for (const s of ['', '00', '01', '04', '07', '59', '13']) ok(!canMoAct({ txnStatus: s }), s)
  })

  it('says why 04, 07 and 59 are refused', () => {
    ok(moBlockReason('04')?.includes('with FO for correction'))
    ok(moBlockReason('07')?.includes('already been matched and released'))
    ok(moBlockReason('59')?.includes('offset'))
  })

  it('names the first deal in a selection that cannot be processed', () => {
    strictEqual(selectionBlockMessage([deal(), deal({ FinancialTransaction: '2' }, { TxnStatus: '03' })]), null)
    ok(selectionBlockMessage([deal(), deal({ FinancialTransaction: '2' }, { TxnStatus: '04' })])?.includes('2'))
  })

  it('writes 59 for a cancellation deal (ZTSF_DEAL_TYPE 00) and 07 for any other', () => {
    strictEqual(statusAfterMatchRelease('00'), '59')
    for (const t of ['', 'FX', undefined]) strictEqual(statusAfterMatchRelease(t), '07')
  })
})

describe('keys, filter and field mapping', () => {
  it('keys a record by company code and transaction together', () => {
    ok(transactionKey('SG03', '1') !== transactionKey('AE13', '1'))
  })

  it('selects 03/04/06 up to and including the date', () => {
    const f = worklistFilter(new Date(2026, 9, 6), ['SG03'])
    ok(f.includes('BlotterDate le 2026-10-06'))
    for (const s of ['03', '04', '06']) ok(f.includes(`TxnStatus eq '${s}'`))
    ok(!f.includes("'07'") && !f.includes('BlotterDate eq'))
  })

  it('puts the MO remark in the field of the product: Option, NDF, and none for a plain forward', () => {
    strictEqual(moRemarkField({ dealType: 'Options', txnTypeCode: '604' }), 'OptMoRem')
    strictEqual(moRemarkField({ dealType: 'FX', txnTypeCode: '631' }), 'NdfMoRem')
    strictEqual(moRemarkField({ dealType: 'FX', txnTypeCode: '632' }), 'NdfMoRem')
    strictEqual(moRemarkField({ dealType: 'FX', txnTypeCode: '619' }), null)
    deepStrictEqual(moRemarkPatch({ dealType: 'FX', txnTypeCode: '619' }, 'x'), {})
    deepStrictEqual(moRemarkPatch({ dealType: 'FX', txnTypeCode: '631' }, ' x '), { NdfMoRem: 'x' })
  })
})

describe('Match & Release', () => {
  it('settles in SAP first, then PATCHes 07 with the Internal Ref and remark by company code + transaction', async () => {
    const { calls } = fake()
    const out = await matchAndReleaseDeals([deal({ TransactionType: '631' })], { externalRef: '', internalRef: ' INT-1 ', moRemark: 'matched' })
    deepStrictEqual(out.done, [{ id: 'SG03-7000000000001', txnStatus: '07', moRemark: 'matched' }])
    deepStrictEqual(calls.map((c) => c.method + (c.url.endsWith('.Settle') ? ' settle' : '')), ['GET', 'POST settle', 'PATCH'])
    const patch = patches(calls)[0]!
    ok(patch.url.includes("CompanyCode='SG03'") && patch.url.includes("FinancialTransaction='7000000000001'"))
    strictEqual(patch.ifMatch, '*')
    deepStrictEqual(patch.body, { TxnStatus: '07', NdfMoRem: 'matched', ZolamDealNo: 'INT-1' })
  })

  it('sends no Internal Ref or remark field when none was entered, and no APP_STR record is created', async () => {
    const { calls } = fake()
    await matchAndReleaseDeals([deal()], INPUT)
    deepStrictEqual(patches(calls)[0]!.body, { TxnStatus: '07' })
    strictEqual(calls.filter((c) => c.method === 'POST' && !c.url.endsWith('.Settle')).length, 0)
  })

  it('writes 59 instead of 07 for a cancellation deal, from the stored deal type', async () => {
    const { calls } = fake({ stored: { ZtsfDealType: '00' } })
    const out = await matchAndReleaseDeals([deal()], INPUT)
    strictEqual(out.done[0]!.txnStatus, '59')
    strictEqual((patches(calls)[0]!.body as { TxnStatus: string }).TxnStatus, '59')
  })

  it('matches and releases a corrected deal (06)', async () => {
    fake({ stored: { TxnStatus: '06' } })
    const out = await matchAndReleaseDeals([deal({}, { TxnStatus: '06' })], INPUT)
    strictEqual(out.done[0]!.txnStatus, '07')
  })

  it('writes nothing when SAP refuses the settlement, and says why', async () => {
    const { calls } = fake({ settle: 'fail' })
    const out = await matchAndReleaseDeals([deal()], INPUT)
    strictEqual(out.failed?.stage, 'settle')
    strictEqual(out.failed?.reason, 'Not yet due for settlement')
    strictEqual(patches(calls).length, 0)
    deepStrictEqual(out.done, [])
  })

  it('refuses a stale row: the stored status is read again before SAP is called', async () => {
    for (const stored of ['04', '07', '59']) {
      const { calls } = fake({ stored: { TxnStatus: stored } })
      const out = await matchAndReleaseDeals([deal()], INPUT) // the row on screen still says 03
      strictEqual(out.failed?.stage, 'validate', stored)
      strictEqual(settles(calls).length, 0, stored)
      strictEqual(patches(calls).length, 0, stored)
      current?.restore()
    }
  })

  it('refuses a transaction that has no APP_STR record', async () => {
    const { calls } = fake({ stored: null })
    const out = await matchAndReleaseDeals([deal()], INPUT)
    strictEqual(out.failed?.stage, 'validate')
    strictEqual(settles(calls).length, 0)
  })

  it('stops at the first failure and leaves the earlier deals done', async () => {
    const { calls } = fake()
    const second = deal({ FinancialTransaction: '2' }, { TxnStatus: '03' })
    // The second deal's stored record says 04, so it fails validation after the first completes.
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input))
      if ((init?.method ?? 'GET') === 'GET' && url.includes("FinancialTransaction='2'")) {
        return new Response(JSON.stringify(rec({ FinancialTransaction: '2', TxnStatus: '04' })), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return realFetch(input, init)
    }) as typeof fetch
    const third = deal({ FinancialTransaction: '3' })
    const out = await matchAndReleaseDeals([deal(), second, third], INPUT)
    deepStrictEqual(out.done.map((d) => d.id), ['SG03-7000000000001'])
    strictEqual(out.failed?.id, 'SG03-2')
    strictEqual(settles(calls).length, 1)
  })

  it('refuses an unsupported External Ref before settling or writing workflow data', async () => {
    const { calls } = fake()
    const out = await matchAndReleaseDeals([deal({ TransactionType: '631' })], { ...INPUT, externalRef: 'EXT-9' })
    strictEqual(out.failed?.stage, 'validate')
    ok(out.failed?.reason.includes('External Ref cannot be saved'))
    strictEqual(settles(calls).length, 0)
    strictEqual(patches(calls).length, 0)
    deepStrictEqual(out.done, [])
  })

  it('writes External Ref to the exact SAP transaction and Internal Ref to its application record', async () => {
    const { calls } = fake({ externalSupport: true })
    const out = await matchAndReleaseDeals([deal()], { externalRef: ' EXT-9 ', internalRef: ' INT-1 ', moRemark: '' })
    strictEqual(out.done.length, 1)
    deepStrictEqual(out.notStored, [])
    const writes = calls.filter((c) => c.method !== 'GET')
    deepStrictEqual(writes.map(c => c.method), ['POST', 'PATCH', 'PATCH'])
    ok(writes[0]!.url.endsWith('.Settle'))
    strictEqual(writes[1]!.url, "/api/fx/FxTransaction(CompanyCode='SG03',FinancialTransaction='7000000000001')")
    strictEqual(writes[1]!.ifMatch, '*')
    deepStrictEqual(writes[1]!.body, { ExternalReference: 'EXT-9' })
    ok(writes[2]!.url.startsWith('/api/trmfxapp/'))
    deepStrictEqual(writes[2]!.body, { TxnStatus: '07', ZolamDealNo: 'INT-1' })
  })

  it('refuses references beyond the SAP field limits before any requests', async () => {
    const { calls } = fake({ externalSupport: true })
    for (const input of [{ ...INPUT, externalRef: 'X'.repeat(17) }, { ...INPUT, internalRef: 'I'.repeat(16) }]) {
      const out = await matchAndReleaseDeals([deal()], input)
      strictEqual(out.failed?.stage, 'validate')
    }
    strictEqual(calls.length, 0)
  })

  it('accepts the maximum 16-character External Ref and 15-character Internal Ref without truncation', async () => {
    const { calls } = fake({ externalSupport: true })
    const out = await matchAndReleaseDeals([deal()], { externalRef: 'X'.repeat(16), internalRef: 'I'.repeat(15), moRemark: '' })
    strictEqual(out.failed, undefined)
    deepStrictEqual(patches(calls).map(c => c.body), [{ ExternalReference: 'X'.repeat(16) }, { TxnStatus: '07', ZolamDealNo: 'I'.repeat(15) }])
  })

  it('does not settle when External Ref support cannot be checked', async () => {
    const { calls } = fake({ metadataFail: true })
    const out = await matchAndReleaseDeals([deal()], { ...INPUT, externalRef: 'EXT-1' })
    strictEqual(out.failed?.stage, 'validate')
    ok(out.failed?.reason.includes('could not be checked'))
    strictEqual(settles(calls).length, 0)
    strictEqual(patches(calls).length, 0)
  })

  it('says a plain forward\'s MO remark is not stored, since APP_STR has no field for it', async () => {
    fake()
    const out = await matchAndReleaseDeals([deal()], { ...INPUT, moRemark: 'ok' })
    ok(out.notStored.some((n) => n.startsWith('MO Remarks')))
  })
})

describe('SAP settled but the workflow save failed', () => {
  it('keeps both references after an external-reference failure and retries without settling again', async () => {
    const { calls } = fake({ externalSupport: true, externalPatch: 'fail' })
    const out = await matchAndReleaseDeals([deal()], { externalRef: 'EXT-1', internalRef: 'INT-1', moRemark: '' })
    strictEqual(out.failed?.stage, 'workflow')
    ok(out.failed?.reason.includes('External reference change refused'))
    strictEqual(out.failed?.pending?.externalRef, 'EXT-1')
    strictEqual(out.failed?.pending?.patch.ZolamDealNo, 'INT-1')
    strictEqual(settles(calls).length, 1)
    strictEqual(patches(calls).length, 1, 'workflow status must stay open until the reference is saved')
    current?.restore()
    const again = fake({ externalSupport: true })
    const retried = await retryWorkflowSave(out.failed!.pending!)
    ok(retried.ok)
    strictEqual(settles(again.calls).length, 0)
    deepStrictEqual(patches(again.calls).map(c => c.body), [{ ExternalReference: 'EXT-1' }, { TxnStatus: '07', ZolamDealNo: 'INT-1' }])
  })

  it('can retry after External Ref succeeded but Internal Ref or workflow failed', async () => {
    fake({ externalSupport: true, patch: 'fail' })
    const out = await matchAndReleaseDeals([deal()], { externalRef: 'EXT-1', internalRef: 'INT-1', moRemark: '' })
    strictEqual(out.failed?.stage, 'workflow')
    current?.restore()
    const again = fake({ externalSupport: true })
    ok((await retryWorkflowSave(out.failed!.pending!)).ok)
    strictEqual(settles(again.calls).length, 0)
    strictEqual(patches(again.calls).length, 2)
  })

  it('reports it, keeps what is needed to save again, and does not settle again on retry', async () => {
    const { calls } = fake({ patch: 'fail' })
    const out = await matchAndReleaseDeals([deal({ TransactionType: '631' })], { externalRef: '', internalRef: 'INT-1', moRemark: 'matched' })
    strictEqual(out.failed?.stage, 'workflow')
    ok(out.failed?.reason.includes('settled successfully'))
    ok(out.failed?.reason.includes('not settled again'))
    deepStrictEqual(out.failed?.pending, {
      id: 'SG03-7000000000001',
      companyCode: 'SG03',
      transaction: '7000000000001',
      patch: { TxnStatus: '07', NdfMoRem: 'matched', ZolamDealNo: 'INT-1' },
    })
    strictEqual(settles(calls).length, 1)
    current?.restore()

    const again = fake()
    const retried = await retryWorkflowSave(out.failed!.pending!)
    ok(retried.ok)
    strictEqual(settles(again.calls).length, 0)
    deepStrictEqual(patches(again.calls).map((c) => c.body), [{ TxnStatus: '07', NdfMoRem: 'matched', ZolamDealNo: 'INT-1' }])
  })

  it('keeps the cancellation status 59 for the retry', async () => {
    fake({ stored: { ZtsfDealType: '00' }, patch: 'fail' })
    const out = await matchAndReleaseDeals([deal()], INPUT)
    strictEqual(out.failed?.pending?.patch.TxnStatus, '59')
  })

  it('reports a retry that fails again, without losing anything', async () => {
    fake({ patch: 'fail' })
    const r = await retryWorkflowSave({ id: 'x', companyCode: 'SG03', transaction: '1', patch: { TxnStatus: '07' } })
    ok(!r.ok)
  })

  it('after a reload a deal SAP shows settled but still 03 is only saved, never settled again', async () => {
    const { calls } = fake()
    const out = await matchAndReleaseDeals([deal({ ActivityCategory: '30' })], INPUT)
    strictEqual(out.done[0]!.txnStatus, '07')
    strictEqual(settles(calls).length, 0)
    strictEqual(patches(calls).length, 1)
  })
})

describe('External Ref metadata', () => {
  it('accepts only the field on FxTransactionType, including prefixed XML', () => {
    strictEqual(supportsExternalReference('<Schema><EntityType Name="OtherType"><Property Name="ExternalReference"/></EntityType><EntityType Name="FxTransactionType"></EntityType></Schema>'), false)
    strictEqual(supportsExternalReference('<edm:Schema><edm:EntityType Name="FxTransactionType"><edm:Property Name="ExternalReference" Type="Edm.String"/></edm:EntityType></edm:Schema>'), true)
  })
})

describe('Correction Required', () => {
  it('requires the MO remark and touches nothing without it', async () => {
    const { calls } = fake()
    for (const blank of ['', '   ']) {
      const out = await requestCorrectionDeals([deal()], blank)
      strictEqual(out.failed?.reason, CORRECTION_REMARK_REQUIRED)
    }
    strictEqual(CORRECTION_REMARK_REQUIRED, 'Please fill the MO Remarks and Update')
    strictEqual(calls.length, 0)
  })

  it('PATCHes 04 and the NDF remark, and never calls SAP', async () => {
    const { calls } = fake()
    const out = await requestCorrectionDeals([deal({ TransactionType: '631' })], ' wrong value date ')
    deepStrictEqual(out.done, [{ id: 'SG03-7000000000001', txnStatus: '04', moRemark: 'wrong value date' }])
    strictEqual(settles(calls).length, 0)
    deepStrictEqual(patches(calls).map((c) => c.body), [{ TxnStatus: '04', NdfMoRem: 'wrong value date' }])
  })

  it('sends a plain forward back with the status alone and says its remark is not stored', async () => {
    const { calls } = fake()
    const out = await requestCorrectionDeals([deal()], 'wrong value date')
    deepStrictEqual(patches(calls).map((c) => c.body), [{ TxnStatus: '04' }])
    ok(out.notStored.length === 1)
  })

  it('corrects a corrected deal (06) again, and refuses one already with FO (04)', async () => {
    fake({ stored: { TxnStatus: '06' } })
    strictEqual((await requestCorrectionDeals([deal({}, { TxnStatus: '06' })], 'still wrong')).done.length, 1)
    current?.restore()
    const { calls } = fake({ stored: { TxnStatus: '04' } })
    const out = await requestCorrectionDeals([deal()], 'again')
    strictEqual(out.failed?.stage, 'validate')
    strictEqual(patches(calls).length, 0)
  })

  it('reports a failed save', async () => {
    fake({ patch: 'fail' })
    const out = await requestCorrectionDeals([deal()], 'x')
    strictEqual(out.failed?.stage, 'workflow')
    deepStrictEqual(out.done, [])
  })
})
