import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildFiDocument, categoryLine, postFxLeg, postInvoiceLeg, UNCONFIRMED, type FlowState, type FxPostDeps, type InvPostDeps, type PositionRow } from './posting.ts'

const row = (over: PositionRow = {}): PositionRow => ({
  ZDEAL_ID: 'D1', ZSEQ: '01', ZBUKRS: 'SG03', ZT_TYPE: 'T1-S', ZPOST_CHECK: 'X', ZEXE_CO: 'X', ZFI_TYPE: 'S1',
  ZPAY_AMT: 1250.5, ZSET_CURR: 'USD', ZDR_PK: '40', ZDR_ACC: '01', ZDR_ACCNT: 'Bank', ZDR_GL: '113100', ZCR_PK: '31', ZCR_ACC: '02', ZCR_ACCNT: 'BP-Vendor', ZCR_CV: '0000100055', ZDOC_TYPE: 'KR',
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

describe('account category -> line class', () => {
  it('reads the category, not the posting key: bank and clearing G/L, vendor and bank-BP vendor, customer', () => {
    deepStrictEqual(['01', '02', '03', '04', '05', '06', '07', ''].map(categoryLine), ['G', 'K', 'D', 'G', 'K', 'K', null, null])
  })
})

describe('buildFiDocument', () => {
  it('debit positive, credit negative; a bank line posts the G/L, a vendor line the vendor', () => {
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

  it('never sends the ZDR_ACCNT / ZCR_ACCNT label as an account', () => {
    const r = buildFiDocument(row(), undefined, { testRun: true, today: '2026-10-13' })
    if (!r.ok) throw new Error(r.message)
    const sent = JSON.stringify(r.body)
    strictEqual(sent.includes('BP-Vendor'), false)
    strictEqual(sent.includes('"Bank"'), false)
  })

  it('header text is the posting type, a dash and the Deal ID; document, posting and value date are the posting date', () => {
    const r = buildFiDocument(row({ ZFI_TYPE: 'P2', ZP_DATE: '20261001' }), undefined, { testRun: true, today: '2026-10-13' })
    if (!r.ok) throw new Error(r.message)
    strictEqual(r.body.AccountingDocumentHeaderText, '04 - D1')
    deepStrictEqual([r.body.DocumentDate, r.body.PostingDate, r.body._Item[0]!.ValueDate, r.body._Item[1]!.ValueDate], ['2026-10-01', '2026-10-01', '2026-10-01', '2026-10-01'])
    const plain = buildFiDocument(row({ ZFI_TYPE: '03' }), undefined, { testRun: true, today: '2026-10-13' })
    if (!plain.ok) throw new Error(plain.message)
    strictEqual(plain.body.AccountingDocumentHeaderText, '03 - D1')
  })

  it('a bank-BP line carries the vendor and its reconciliation G/L; a customer line only the customer', () => {
    const r = buildFiDocument(row({ ZDR_ACC: '05', ZDR_CV: 'BANKV', ZDR_GL: '121000', ZCR_ACC: '03', ZCR_CV: 'CUST9', ZCR_GL: '140000' }), undefined, { testRun: true, today: '2026-10-13' })
    if (!r.ok) throw new Error(r.message)
    deepStrictEqual(r.body._Item.map((i) => [i.LineCategory, i.Supplier, i.Customer, i.GLAccount]), [['K', 'BANKV', undefined, '121000'], ['D', undefined, 'CUST9', undefined]])
  })

  it('uses ZP_DATE, else the due date, when no date is given, and refuses what it cannot guess', () => {
    const r = buildFiDocument(row({ ZP_DATE: '20261001' }), undefined, { testRun: true, today: '2026-10-13' })
    if (!r.ok) throw new Error(r.message)
    strictEqual(r.body.PostingDate, '2026-10-01')
    strictEqual(r.body.DocumentReferenceID, 'D1')
    const due = buildFiDocument(row({ ZDUE_DATE: '20261120' }), undefined, { testRun: true, today: '2026-10-13' })
    if (!due.ok) throw new Error(due.message)
    strictEqual(due.body.PostingDate, '2026-11-20')
    for (const bad of [{ ZBUKRS: '' }, { ZPAY_AMT: 0 }, { ZDR_ACC: '' }, { ZDR_GL: '' }, { ZCR_CV: '' }, { ZCR_ACC: '07' }, { ZDOC_TYPE: '' }]) {
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
