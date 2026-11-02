import { deepStrictEqual, ok, rejects, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { clearDealLink, clearDealLinkBody } from '../fx-blotter/appStr.ts'
import { DEAL_STATUS } from '../../shared/fx/deal-status.ts'
import { fxDelete, type FxRow } from '../../shared/fx/mw.ts'
import type { FxTransaction } from '../../shared/fx/ndf.ts'
import { FX_TXN_STATUS } from '../../shared/fx/txn-status.ts'
import { dealRow, fake, rec } from './analysisTestKit.ts'
import {
  cancelDealId,
  confirmDealId,
  loadReplacementCandidates,
  loadReplacementReference,
  partialFailureMessage,
  replaceDealTransaction,
  reverseMoConfirmation,
  type InvoiceRefInput,
} from './analysis.ts'
import { belowConfirmStatus, confirmationBlockers, exchangeRateEditable, isEligibleReplacement, referenceOf, slotColumns, slotOf, slotReplacement } from './analysisRules.ts'

const invoice = (no: string): InvoiceRefInput => ({
  ZINV_TRM_NO: no,
  ZTTYPE: 'T1',
  ZDTYPE: 'D1',
  ZTRD_SELL: 'OGA',
  ZTRD_BUY: 'DMCC',
  ZMC_REF_P: '2000000028',
  ZMC_REF_S: '',
  ZAMT: 1000,
  ZINV_AMT: 83000,
  ZTRD_CURR: 'USD',
  ZEX_RATE: 83,
})

describe('status domains', () => {
  it('Deal ID statuses and transaction statuses are separate constants and never mapped', () => {
    strictEqual(DEAL_STATUS.CONFIRMED, '02')
    strictEqual(FX_TXN_STATUS.FO_DELETE, '02') // same digits, different meaning
    strictEqual(DEAL_STATUS.MO_CONFIRMED, '03')
    strictEqual(FX_TXN_STATUS.FO_TO_MO_UNMATCHED, '03')
    strictEqual(FX_TXN_STATUS.MO_MATCH_RELEASE, '07')
    ok(!('MO_MATCH_RELEASE' in DEAL_STATUS))
    ok(!('BANK_SETTLEMENT_COMPLETED' in DEAL_STATUS)) // 50 is never introduced by this flow
  })
})

describe('analysis rules', () => {
  it('blocks confirmation for a persisted transaction status below 07, including none', () => {
    ok(belowConfirmStatus('03') && belowConfirmStatus('01') && belowConfirmStatus('') && belowConfirmStatus('00'))
    ok(!belowConfirmStatus('07') && !belowConfirmStatus('13') && !belowConfirmStatus('50'))
    const blockers = confirmationBlockers([
      { bukrs: 'SG03', rfha: '1', txnStatus: '07' },
      { bukrs: 'SG03', rfha: '2', txnStatus: '03' },
    ])
    deepStrictEqual(blockers.map((b) => b.rfha), ['2'])
  })

  it('maps slots to ZRFHA1..8 / ZBUKRS1..8 and writes into the chosen slot', () => {
    const names = ['D1', 'D2', 'D3', 'D4', 'DS1', 'DS2', 'DSS1', 'DSS2'] as const
    names.forEach((n, i) => deepStrictEqual(slotColumns(n), { bukrs: `ZBUKRS${i + 1}`, rfha: `ZRFHA${i + 1}` }))
    deepStrictEqual(slotReplacement('DS1', { bukrs: 'SG03', rfha: '9' }), { ZBUKRS5: 'SG03', ZRFHA5: '9' })
    deepStrictEqual(slotReplacement('DSS2', { bukrs: 'SG03', rfha: '9' }), { ZBUKRS8: 'SG03', ZRFHA8: '9' })
    strictEqual(slotOf(dealRow(), 'SG03', '100002'), 'D2')
    strictEqual(slotOf(dealRow(), 'XX01', '100002'), undefined) // BUKRS + RFHA, never RFHA alone
  })

  it('exchange rates are editable only while the Deal ID is Created', () => {
    ok(exchangeRateEditable('01'))
    ok(!exchangeRateEditable('02') && !exchangeRateEditable('03') && !exchangeRateEditable('30'))
  })

  const old: FxTransaction = {
    CompanyCode: 'SG03',
    FinancialTransaction: '100001',
    TransactionType: '619',
    ValueDate: '2026-10-30',
    LeadCurrency: 'USD',
    BuyCurrency: 'USD',
    SellCurrency: 'INR',
    BuyAmount: '1000.00',
    SellAmount: '83000.00',
    ActiveStatus: '0',
  }
  const ref = referenceOf(old)
  const cand = (over: Partial<FxTransaction> = {}): FxTransaction => ({ ...old, FinancialTransaction: '100005', ...over })
  const sold = { BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: '83000.00', SellAmount: '1000.00' }

  it('reads the reference from FxTransaction: lead currency, its side and its amount', () => {
    deepStrictEqual(ref, { bukrs: 'SG03', rfha: '100001', sfhaart: '619', delfz: '2026-10-30', side: 'B', currency: 'USD', amount: 1000 })
    const s = referenceOf({ ...old, ...sold })
    deepStrictEqual([s.side, s.currency, s.amount], ['S', 'USD', 1000])
    strictEqual(referenceOf({ ...old, ValueDate: '2026-10-30T00:00:00Z' }).delfz, '2026-10-30')
  })

  it('replacement filters follow the legacy rules one by one', () => {
    ok(isEligibleReplacement(ref, cand(), '03'))
    ok(isEligibleReplacement(ref, cand(), '07'))
    ok(!isEligibleReplacement(ref, cand({ FinancialTransaction: '100001' }), '03'), 'same RFHA')
    ok(!isEligibleReplacement(ref, cand({ CompanyCode: 'IN11' }), '03'), 'company code')
    ok(!isEligibleReplacement(ref, cand({ TransactionType: '620' }), '03'), 'transaction type')
    ok(!isEligibleReplacement(ref, cand({ ValueDate: '2026-11-30' }), '03'), 'value date')
    ok(!isEligibleReplacement(ref, cand(sold), '03'), 'buy / sell')
    ok(!isEligibleReplacement(ref, cand({ LeadCurrency: 'EUR', BuyCurrency: 'EUR' }), '03'), 'currency')
    ok(!isEligibleReplacement(ref, cand({ BuyAmount: '1001.00' }), '03'), 'amount')
    ok(!isEligibleReplacement(ref, cand({ ActiveStatus: '3' }), '03'), 'reversed (SAKTIV = 3)')
    ok(!isEligibleReplacement(ref, cand(), '01'), 'status 01')
    ok(!isEligibleReplacement(ref, cand(), ''), 'no APP_STR status')
    ok(!isEligibleReplacement(ref, cand(), '50'), 'status 50')
  })
})

describe('Cancel Deal ID', () => {
  it('sets ZDEAL_STAT = 30 and writes nothing else', async () => {
    const f = fake({ app: [rec('100001'), rec('100002')] })
    const r = await cancelDealId(dealRow(), f.ports)
    ok(r.ok)
    deepStrictEqual(f.log, ['deal {"ZDEAL_STAT":"30"}'])
    strictEqual(f.state.app.get('SG03|100001')!.TxnStatus, '07')
    strictEqual(f.state.app.get('SG03|100001')!.ZtsfDealID, '1000000231') // linkage untouched
  })
})

describe('Reverse MO Confirmation', () => {
  it('moves 02 / 03 back to 01 and deletes the invoice references, nothing else', async () => {
    for (const status of ['02', '03']) {
      const f = fake({ deal: dealRow({ ZDEAL_STAT: status }), inv: [{ ZDEAL_ID: '1000000231', ZINV_TRM_NO: 'A' }, { ZDEAL_ID: '1000000231', ZINV_TRM_NO: 'B' }], app: [rec('100001')] })
      const r = await reverseMoConfirmation('1000000231', {}, f.ports)
      ok(r.ok, status)
      deepStrictEqual(f.log, ['deal {"ZDEAL_STAT":"01"}', 'inv- A', 'inv- B'])
      strictEqual(f.state.app.get('SG03|100001')!.TxnStatus, '07') // no TXN_STATUS write, no Treasury reversal
    }
  })

  it('is refused for 01 and 30', async () => {
    for (const status of ['01', '30']) {
      const f = fake({ deal: dealRow({ ZDEAL_STAT: status }) })
      const r = await reverseMoConfirmation('1000000231', {}, f.ports)
      ok(!r.ok)
      deepStrictEqual(f.log, [])
    }
  })

  it('reports a partial failure, keeps the status change and finishes only the deletion on resume', async () => {
    const f = fake({ deal: dealRow({ ZDEAL_STAT: '02' }), inv: [{ ZDEAL_ID: '1000000231', ZINV_TRM_NO: 'A' }], failOn: 'deleteInvoiceRef' })
    const r = await reverseMoConfirmation('1000000231', {}, f.ports)
    ok(!r.ok)
    deepStrictEqual(r.steps.map((s) => s.status), ['done', 'failed'])
    strictEqual(f.state.deal['ZDEAL_STAT'], '01')
    ok(partialFailureMessage(r).includes('Already saved and kept'))

    const g = fake({ deal: f.state.deal, inv: f.state.inv })
    const retry = await reverseMoConfirmation('1000000231', { resume: true }, g.ports)
    ok(retry.ok)
    deepStrictEqual(retry.steps.map((s) => s.status), ['skipped', 'done'])
    deepStrictEqual(g.log, ['inv- A']) // the status is not patched again
    // Without resume, a Created deal is still refused.
    ok(!(await reverseMoConfirmation('1000000231', {}, fake({ deal: f.state.deal }).ports)).ok)
  })
})

describe('Change / Confirm', () => {
  const input = { dealId: '1000000231', model: 'M017', invoices: [invoice('T1'), invoice('T2')], pl: { pl: 100.5, localAmount: 8341.5, localCurrency: 'INR', rate: 83 } }

  it('is blocked, with the offending RFHA, while a linked transaction is below 07 — and writes nothing', async () => {
    const f = fake({ app: [rec('100001'), rec('100002', { TxnStatus: '03' })] })
    const r = await confirmDealId(input, f.ports)
    ok(!r.ok)
    ok(r.error!.includes('100002'))
    deepStrictEqual(f.log, [])
  })

  it('is blocked for a transaction with no APP_STR record', async () => {
    const f = fake({ app: [rec('100001')] })
    ok(!(await confirmDealId(input, f.ports)).ok)
    deepStrictEqual(f.log, [])
  })

  it('sets ZDEAL_STAT 02 and ZCONFIRM X with the P&L, saves the invoice references, and never writes TXN_STATUS', async () => {
    const f = fake({ app: [rec('100001'), rec('100002')] })
    const r = await confirmDealId(input, f.ports)
    ok(r.ok)
    deepStrictEqual(f.log.slice(0, 2), ['inv+ T1', 'inv+ T2'])
    const patch = JSON.parse(f.log.at(-1)!.replace(/^deal /, '')) as Record<string, string>
    strictEqual(patch['ZDEAL_STAT'], '02')
    strictEqual(patch['ZCONFIRM'], 'X')
    strictEqual(patch['ZPL_CURR'], 'USD')
    strictEqual(patch['ZPL'], '100.50')
    strictEqual(patch['ZPL_LCURR'], 'INR')
    strictEqual(patch['ZTSF_MODEL'], 'M017')
    ok(!f.log.some((l) => l.startsWith('app')), 'no APP_STR write when the MC did not change')
    ok(!f.log.some((l) => l.includes('TxnStatus')))
    strictEqual(f.state.app.get('SG03|100001')!.TxnStatus, '07')
  })

  it('an MC change updates the Deal ID, then every linked APP_STR by BUKRS + RFHA, before confirming', async () => {
    const f = fake({ app: [rec('100001'), rec('100002')] })
    const r = await confirmDealId({ ...input, mcRef: '2000000099' }, f.ports)
    ok(r.ok)
    deepStrictEqual(f.log.slice(0, 3), [
      'deal {"ZMC_REF":"2000000099","ZTSF_MODEL":"M017"}',
      'app~ SG03|100001 {"ZtsfMcRefNo":"2000000099"}',
      'app~ SG03|100002 {"ZtsfMcRefNo":"2000000099"}',
    ])
    ok(f.log.at(-1)!.includes('"ZDEAL_STAT":"02"'))
    ok(!f.log.some((l) => l.includes('TxnStatus')))
  })

  it('a failure after the MC change keeps it, stops before confirming, and a retry does not repeat it', async () => {
    const f = fake({ app: [rec('100001'), rec('100002')], failOn: 'createInvoiceRef' })
    const first = await confirmDealId({ ...input, mcRef: '2000000099' }, f.ports)
    ok(!first.ok)
    deepStrictEqual(first.steps.map((s) => s.status), ['done', 'done', 'failed', 'not-run'])
    strictEqual(f.state.deal['ZDEAL_STAT'], '01')
    ok(partialFailureMessage(first).includes('Run the action again'))

    const g = fake({ deal: f.state.deal, app: [...f.state.app.values()] })
    const retry = await confirmDealId({ ...input, mcRef: '2000000099' }, g.ports)
    ok(retry.ok)
    ok(!g.log.some((l) => l.startsWith('app~')), 'APP_STR already has the new MC')
    ok(!g.log.some((l) => l.startsWith('deal {"ZMC_REF"')), 'the Deal ID already has the new MC')
    ok(g.log.at(-1)!.includes('"ZDEAL_STAT":"02"'))
  })

  it('refuses a Deal ID that is not Created', async () => {
    const f = fake({ deal: dealRow({ ZDEAL_STAT: '02' }), app: [rec('100001'), rec('100002')] })
    ok(!(await confirmDealId(input, f.ports)).ok)
    deepStrictEqual(f.log, [])
  })
})

describe('Edit Deal Pair', () => {
  const edit = { dealId: '1000000231', slot: 'D1', oldTxn: { bukrs: 'SG03', rfha: '100001' }, newTxn: { bukrs: 'SG03', rfha: '100005' }, dealDesc: 'Deal', mcRef: '2000000028' }

  it('clears OLD, links NEW with the slot as deal type, and overwrites that slot — no TXN_STATUS anywhere', async () => {
    const f = fake({ app: [rec('100001'), rec('100002'), rec('100005', { ZtsfDealID: '', ZtsfDealType: '', ZtsfDealDesc: '', ZtsfMcRefNo: '', TxnStatus: '03' })] })
    const r = await replaceDealTransaction(edit, f.ports)
    ok(r.ok)
    deepStrictEqual(f.log, [
      'app0 SG03|100001',
      'app~ SG03|100005 {"ZtsfDealDesc":"Deal","ZtsfDealType":"D1","ZtsfDealID":"1000000231","ZtsfMcRefNo":"2000000028"}',
      'deal {"ZBUKRS1":"SG03","ZRFHA1":"100005"}',
    ])
    const oldRec = f.state.app.get('SG03|100001')!
    ok(!oldRec.ZtsfDealID && !oldRec.ZtsfMcRefNo && !oldRec.ZtsfDealType && !oldRec.ZtsfDealDesc)
    strictEqual(oldRec.TxnStatus, '07') // untouched
    strictEqual(f.state.app.get('SG03|100005')!.TxnStatus, '03') // untouched
    strictEqual(f.state.deal['ZRFHA2'], '100002') // other slots untouched
  })

  it('replaces DS1 -> ZRFHA5, not the next free slot', async () => {
    const deal = dealRow({ ZBUKRS5: 'SG03', ZRFHA5: '100007' })
    const f = fake({ deal, app: [rec('100007', { ZtsfDealType: 'DS1' })] })
    const r = await replaceDealTransaction({ ...edit, slot: 'DS1', oldTxn: { bukrs: 'SG03', rfha: '100007' } }, f.ports)
    ok(r.ok)
    ok(f.log.includes('deal {"ZBUKRS5":"SG03","ZRFHA5":"100005"}'))
    strictEqual(f.state.deal['ZRFHA3'], undefined)
  })

  it('does not clear a transaction that has since been linked to another Deal ID', async () => {
    const f = fake({ app: [rec('100001', { ZtsfDealID: '9999999999' })] })
    const r = await replaceDealTransaction(edit, f.ports)
    ok(r.ok)
    ok(!f.log.some((l) => l.startsWith('app0')))
  })

  it('a failure after clearing the old link is reported, and the retry skips what is done', async () => {
    const f = fake({ app: [rec('100001'), rec('100002'), rec('100005', { ZtsfDealID: '', ZtsfMcRefNo: '', TxnStatus: '03' })], failOn: 'updateAppStr' })
    const first = await replaceDealTransaction(edit, f.ports)
    ok(!first.ok)
    deepStrictEqual(first.steps.map((s) => s.status), ['done', 'failed', 'not-run'])
    strictEqual(f.state.deal['ZRFHA1'], '100001')

    const g = fake({ deal: f.state.deal, app: [...f.state.app.values()] })
    const retry = await replaceDealTransaction(edit, g.ports)
    ok(retry.ok)
    deepStrictEqual(retry.steps.map((s) => s.status), ['skipped', 'done', 'done'])
    ok(!g.log.some((l) => l.startsWith('app0')), 'the old link is not cleared twice')
    ok(g.log[0]!.startsWith('app~ SG03|100005'))
  })

  it('a second run after success changes nothing', async () => {
    const f = fake({ app: [rec('100001'), rec('100002')] })
    ok((await replaceDealTransaction(edit, f.ports)).ok)
    const before = f.log.length
    const again = await replaceDealTransaction(edit, f.ports)
    ok(again.ok)
    deepStrictEqual(again.steps.map((s) => s.status), ['skipped', 'skipped', 'skipped'])
    strictEqual(f.log.length, before)
  })

  it('refuses a stale slot, a bad slot, another company code, and a transaction already in another slot', async () => {
    const f = fake({ app: [rec('100001'), rec('100002')] })
    ok(!(await replaceDealTransaction({ ...edit, oldTxn: { bukrs: 'SG03', rfha: '999' } }, f.ports)).ok)
    ok(!(await replaceDealTransaction({ ...edit, slot: 'D9' }, f.ports)).ok)
    ok(!(await replaceDealTransaction({ ...edit, newTxn: { bukrs: 'IN11', rfha: '100005' } }, f.ports)).ok)
    ok(!(await replaceDealTransaction({ ...edit, newTxn: { bukrs: 'SG03', rfha: '100002' } }, f.ports)).ok)
    ok(!(await replaceDealTransaction({ ...edit, newTxn: edit.oldTxn }, f.ports)).ok)
    deepStrictEqual(f.log, [])
  })
})

describe('against the services', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  type Call = { method: string; url: string; body: Record<string, unknown> | null; ifMatch: string | null }
  const json = (status: number, body: unknown) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('the clear PATCH really sends null for the four linkage fields and nothing else', async () => {
    const calls: Call[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null, ifMatch: new Headers(init?.headers).get('if-match') })
      return json(204, null)
    }) as typeof fetch
    await clearDealLink('SG03', '100001')
    const [c] = calls
    strictEqual(c!.method, 'PATCH')
    ok(c!.url.includes("TrmFxApp(CompanyCode='SG03',FinancialTransaction='100001')"))
    deepStrictEqual(c!.body, { ZtsfDealDesc: null, ZtsfDealType: null, ZtsfDealID: null, ZtsfMcRefNo: null })
    ok(!('TxnStatus' in c!.body!))
    deepStrictEqual(Object.values(clearDealLinkBody()), [null, null, null, null])
  })

  it('DELETE of an invoice reference carries its key', async () => {
    const calls: Call[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null, ifMatch: null })
      return json(204, null)
    }) as typeof fetch
    await fxDelete('invRef', { ZDEAL_ID: '1000000231', ZINV_TRM_NO: 'A' })
    strictEqual(calls[0]!.method, 'DELETE')
    ok(calls[0]!.url.endsWith('/data/invRef'))
    deepStrictEqual(calls[0]!.body, { key: { ZDEAL_ID: '1000000231', ZINV_TRM_NO: 'A' } })
  })

  it('replacement candidates come from FxTransaction, take their status from APP_STR by BUKRS + RFHA and apply the filters', async () => {
    const old: FxTransaction = {
      CompanyCode: 'SG03',
      FinancialTransaction: '100001',
      TransactionType: '619',
      ValueDate: '2026-10-30',
      LeadCurrency: 'USD',
      BuyCurrency: 'USD',
      SellCurrency: 'INR',
      BuyAmount: '1000.00',
      SellAmount: '83000.00',
      ActiveStatus: '0',
    }
    const fx: FxTransaction[] = [
      { ...old, FinancialTransaction: '100005' },
      { ...old, FinancialTransaction: '100006' },
      { ...old, FinancialTransaction: '100007' },
      { ...old, FinancialTransaction: '100008', ActiveStatus: '3' },
      { ...old, CompanyCode: 'IN11', FinancialTransaction: '100005' },
    ]
    const urls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      // URLSearchParams writes a space as "+", which decodeURIComponent leaves alone.
      const url = decodeURIComponent(String(input).split('+').join(' '))
      urls.push(url)
      if (url.includes('/FxTransaction')) return json(200, { value: fx.filter((r) => url.includes(`CompanyCode eq '${r.CompanyCode}'`)) })
      if (url.includes('/trmfxapp/')) {
        return json(200, {
          value: [
            { CompanyCode: 'SG03', FinancialTransaction: '100005', TxnStatus: '03', ZtsfDealID: '' },
            { CompanyCode: 'SG03', FinancialTransaction: '100006', TxnStatus: '01' },
            { CompanyCode: 'SG03', FinancialTransaction: '100008', TxnStatus: '03' },
            { CompanyCode: 'IN11', FinancialTransaction: '100005', TxnStatus: '07' },
          ],
        })
      }
      return json(404, {})
    }) as typeof fetch
    const out = await loadReplacementCandidates(referenceOf(old))
    deepStrictEqual(out.map((c) => `${c.bukrs}|${c.rfha}|${c.txnStatus}`), ['SG03|100005|03'])
    ok(!urls.some((u) => u.includes('tsfvFx')), 'the stale ZSGTSFV_FX copy is not read')
  })

  it('finds a transaction only FxTransaction has (IN11 3000000000044) and reports a missing one', async () => {
    const found: FxTransaction = { CompanyCode: 'IN11', FinancialTransaction: '3000000000044', TransactionType: '619', ValueDate: '2026-11-16', LeadCurrency: 'USD', BuyCurrency: 'USD', BuyAmount: '200000.00', SellCurrency: 'INR', SellAmount: '17000000.00' }
    globalThis.fetch = (async () => json(200, { value: [found] })) as typeof fetch
    deepStrictEqual(await loadReplacementReference({ bukrs: 'IN11', rfha: '3000000000044' }), {
      bukrs: 'IN11', rfha: '3000000000044', sfhaart: '619', delfz: '2026-11-16', side: 'B', currency: 'USD', amount: 200000,
    })
    globalThis.fetch = (async () => json(200, { value: [] })) as typeof fetch
    await rejects(loadReplacementReference({ bukrs: 'IN11', rfha: '1' }), /not found in FxTransaction/)
  })
})
