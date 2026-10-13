import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildFiDocument, lineCategory, postFxLeg, postInvoiceLeg, UNCONFIRMED, type FlowState, type FxPostDeps, type InvPostDeps, type PositionRow } from './posting.ts'

const row = (over: PositionRow = {}): PositionRow => ({
  ZDEAL_ID: 'D1', ZSEQ: '01', ZBUKRS: 'SG03', ZT_TYPE: 'T1-S', ZPOST_CHECK: 'X', ZEXE_CO: 'X', ZFI_TYPE: 'F1',
  ZPAY_AMT: 1250.5, ZSET_CURR: 'USD', ZDR_PK: '40', ZDR_GL: '113100', ZCR_PK: '31', ZCR_ACCNT: '0000100055', ZDOC_TYPE: 'KR',
  ...over,
})

const invDeps = (over: Partial<InvPostDeps> = {}, state: { rows?: Record<string, unknown>[]; posts?: number } = {}): InvPostDeps => ({
  readPosition: async () => row(),
  readPostingType: async () => ({ ZXBLNR1: 'REFX', ZBKTXT: 'Trade inv', ZDR_TEXT: 'Dr text' }),
  findByReference: async () => [],
  postDocument: async () => {
    state.posts = (state.posts ?? 0) + 1
    return { fiscalYear: '2026', document: '1900000012' }
  },
  writePosition: async (_d, _s, fields) => {
    ;(state.rows ??= []).push(fields)
  },
  ...over,
})

describe('posting key -> line category', () => {
  it('follows the SAP posting key ranges', () => {
    deepStrictEqual(['01', '11', '21', '31', '40', '50'].map(lineCategory), ['D', 'D', 'K', 'K', 'G', 'G'])
  })
})

describe('buildFiDocument', () => {
  it('debit positive, credit negative, vendor line on 31, G/L on 40', () => {
    const r = buildFiDocument(row(), { ZXBLNR1: 'REFX', ZBKTXT: 'Trade inv' }, { testRun: false, today: '2026-10-13' })
    if (!r.ok) throw new Error(r.message)
    strictEqual(r.body.DocumentReferenceID, 'REFX')
    strictEqual(r.body.AccountingDocumentType, 'KR')
    strictEqual(r.body.PostingDate, '2026-10-13')
    deepStrictEqual(r.body._Item.map((i) => [i.LineCategory, i.AmountInTransactionCurrency, i.GLAccount ?? i.Supplier]), [
      ['G', 1250.5, '113100'],
      ['K', -1250.5, '0000100055'],
    ])
  })

  it('uses ZP_DATE when no date is given and refuses what it cannot guess', () => {
    const r = buildFiDocument(row({ ZP_DATE: '20261001' }), undefined, { testRun: true, today: '2026-10-13' })
    if (!r.ok) throw new Error(r.message)
    strictEqual(r.body.PostingDate, '2026-10-01')
    strictEqual(r.body.DocumentReferenceID, 'D1')
    for (const bad of [{ ZBUKRS: '' }, { ZPAY_AMT: 0 }, { ZDR_PK: '' }, { ZCR_ACCNT: '' }, { ZDOC_TYPE: '' }]) {
      strictEqual(buildFiDocument(row(bad), undefined, { testRun: false }).ok, false, JSON.stringify(bad))
    }
  })
})

describe('postInvoiceLeg', () => {
  it('posts, then records ZBELNR and ZMSG', async () => {
    const state: { rows?: Record<string, unknown>[]; posts?: number } = {}
    const out = await postInvoiceLeg('D1', '01', { testRun: false }, invDeps({}, state))
    strictEqual(out.ok && out.document, '1900000012')
    strictEqual(state.rows?.[0]?.['ZBELNR'], '1900000012')
    strictEqual(state.rows?.[0]?.['ZMSG'], 'Posted Successfully')
  })

  it('never posts a leg that already has a document, is not FI-posted or is not settled', async () => {
    for (const bad of [{ ZBELNR: '1' }, { ZPOST_CHECK: '' }, { ZEXE_CO: '' }]) {
      const state = { posts: 0 }
      const out = await postInvoiceLeg('D1', '01', { testRun: false }, invDeps({ readPosition: async () => row(bad) }, state))
      strictEqual(out.ok, false)
      strictEqual(state.posts, 0)
    }
  })

  it('a test run writes nothing', async () => {
    const state: { rows?: Record<string, unknown>[]; posts?: number } = {}
    const out = await postInvoiceLeg('D1', '01', { testRun: true }, invDeps({}, state))
    strictEqual(out.ok && out.test, true)
    strictEqual(state.rows, undefined)
  })

  it('a SAP refusal is stored as the message, a timeout as UNCONFIRMED', async () => {
    const state: { rows?: Record<string, unknown>[] } = {}
    const refused = await postInvoiceLeg('D1', '01', { testRun: false }, invDeps({ postDocument: async () => { throw Object.assign(new Error('Account blocked'), { status: 400 }) } }, state))
    strictEqual(refused.ok, false)
    strictEqual(state.rows?.[0]?.['ZMSG'], 'Account blocked')
    const timeout = await postInvoiceLeg('D1', '01', { testRun: false }, invDeps({ postDocument: async () => { throw Object.assign(new Error('gateway timeout'), { status: 504 }) } }, state))
    strictEqual(timeout.ok, false)
    strictEqual(String(state.rows?.[1]?.['ZMSG']).startsWith(UNCONFIRMED), true)
  })

  it('after UNCONFIRMED: one existing document is adopted, several or an unreadable lookup block the retry', async () => {
    const pending = async () => row({ ZMSG: `${UNCONFIRMED}: timeout` })
    const one = { posts: 0, rows: [] as Record<string, unknown>[] }
    const adopted = await postInvoiceLeg('D1', '01', { testRun: false }, invDeps({ readPosition: pending, findByReference: async () => [{ fiscalYear: '2026', document: '77' }] }, one))
    strictEqual(adopted.ok && adopted.document, '77')
    strictEqual(one.posts, 0)
    strictEqual(one.rows[0]?.['ZBELNR'], '77')

    for (const find of [async () => [{ fiscalYear: '2026', document: '1' }, { fiscalYear: '2026', document: '2' }], async () => { throw new Error('no filter') }]) {
      const s = { posts: 0 }
      strictEqual((await postInvoiceLeg('D1', '01', { testRun: false }, invDeps({ readPosition: pending, findByReference: find }, s))).ok, false)
      strictEqual(s.posts, 0)
    }

    const none = { posts: 0 }
    strictEqual((await postInvoiceLeg('D1', '01', { testRun: false }, invDeps({ readPosition: pending, findByReference: async () => [] }, none))).ok, true)
    strictEqual(none.posts, 1)
  })
})

describe('postFxLeg', () => {
  const released = (status = '1'): FlowState => ({ paymentDate: '2026-11-14', status, released: true })
  /** Flows before and after the post; postFlows records the due date it was asked for. */
  const fxDeps = (docs: Record<string, unknown>[], calls: { status?: unknown[]; due?: string[]; saved?: string[][] } = {}, flows: { before?: FlowState[]; after?: FlowState[] } = {}): FxPostDeps => {
    let reads = 0
    return {
      postFlows: async (p) => {
        ;(calls.due ??= []).push(p.DueDate)
        return docs
      },
      readFlows: async () => (reads++ === 0 ? flows.before ?? [released()] : flows.after ?? [released('2')]),
      setTxnStatus: async (_c, _t, fields) => {
        ;(calls.status ??= []).push(fields)
      },
      saveDocs: async (_c, _t, saved) => {
        ;(calls.saved ??= []).push(saved.map((d) => d.document))
      },
    }
  }

  it('a real run returns and stores the documents and sets TXN_STATUS 50', async () => {
    const calls: { status?: unknown[]; saved?: string[][] } = {}
    const out = await postFxLeg({ entity: 'SG03', rfha: '70001' }, { testRun: false }, fxDeps([{ CompanyCode: 'SG03', FinancialTransaction: '70001', FiscalYear: '2026', AccountingDocument: '1500000001', ReferenceKey: 'K' }], calls))
    strictEqual(out.ok && out.docs.length, 1)
    deepStrictEqual(calls.saved, [['1500000001']])
    deepStrictEqual(calls.status, [{ TxnStatus: '50' }])
  })

  it('a test run or a run with no document stores nothing', async () => {
    const calls: { saved?: string[][] } = {}
    await postFxLeg({ entity: 'SG03', rfha: '70001' }, { testRun: true }, fxDeps([{ AccountingDocument: '1500000001', FiscalYear: '2026' }], calls))
    await postFxLeg({ entity: 'SG03', rfha: '70001' }, { testRun: false }, fxDeps([], calls))
    strictEqual(calls.saved, undefined)
  })

  it('SAP posted but the documents could not be stored: still ok, and names them', async () => {
    const out = await postFxLeg({ entity: 'SG03', rfha: '70001' }, { testRun: false }, {
      ...fxDeps([{ AccountingDocument: '1500000001', FiscalYear: '2026' }]),
      saveDocs: async () => { throw new Error('disk full') },
    })
    strictEqual(out.ok, true)
    strictEqual(out.message.includes('could not be stored') && out.message.includes('1500000001/2026'), true)
  })

  it('the due date defaults to the latest released, unposted flow, not today', async () => {
    const calls: { due?: string[] } = {}
    const before = [{ paymentDate: '2026-11-13', status: '1', released: true }, released(), { paymentDate: '2026-12-31', status: '0', released: false }]
    await postFxLeg({ entity: 'SG03', rfha: '70001' }, { testRun: true }, fxDeps([], calls, { before }))
    deepStrictEqual(calls.due, ['2026-11-14'])
  })

  it('nothing released to post: SAP is not called', async () => {
    const calls: { due?: string[] } = {}
    const out = await postFxLeg({ entity: 'SG03', rfha: '70001' }, { testRun: false }, fxDeps([], calls, { before: [released('2'), { paymentDate: '', status: '0', released: false }] }))
    strictEqual(out.ok, false)
    strictEqual(calls.due, undefined)
  })

  it('a test run changes nothing; a run with no document and no flow posted is not a posting', async () => {
    const calls: { status?: unknown[] } = {}
    const test = await postFxLeg({ entity: 'SG03', rfha: '70001' }, { testRun: true }, fxDeps([{ AccountingDocument: '' }], calls))
    strictEqual(test.ok && test.test, true)
    strictEqual(calls.status, undefined)
    strictEqual((await postFxLeg({ entity: 'SG03', rfha: '70001' }, { testRun: false }, fxDeps([], calls, { after: [released()] }))).ok, false)
    strictEqual(calls.status, undefined)
  })

  it('SAP posted the flows but returned no document: posted, and says the number is missing', async () => {
    const calls: { status?: unknown[] } = {}
    const out = await postFxLeg({ entity: 'SG03', rfha: '70001' }, { testRun: false }, fxDeps([], calls))
    strictEqual(out.ok, true)
    strictEqual(out.message.includes('no FI document number'), true)
    deepStrictEqual(calls.status, [{ TxnStatus: '50' }])
  })

  it('flows left unposted (blocked) keep TXN_STATUS unchanged', async () => {
    const calls: { status?: unknown[] } = {}
    const blocked = { paymentDate: '2026-11-14', status: '0', released: false }
    const out = await postFxLeg({ entity: 'SG03', rfha: '70001' }, { testRun: false }, fxDeps([], calls, { before: [released(), blocked], after: [released('2'), blocked] }))
    strictEqual(out.ok, true)
    strictEqual(calls.status, undefined)
  })

  it('SAP posted but the status write failed: still ok, and says so', async () => {
    const out = await postFxLeg({ entity: 'SG03', rfha: '70001' }, { testRun: false }, {
      ...fxDeps([{ AccountingDocument: '15', FiscalYear: '2026' }]),
      setTxnStatus: async () => { throw new Error('locked') },
    })
    strictEqual(out.ok, true)
    strictEqual(out.message.includes('TXN_STATUS'), true)
  })
})
