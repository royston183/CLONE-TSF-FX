import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { FxTransaction } from '../../features/mo-fx-deal-confirmation/api.ts'
import {
  allOf,
  appKey,
  attachTrmFxApp,
  joinFxWithApp,
  keysFilter,
  listTrmFxApp,
  loadFxWithApp,
  statusFilter,
  type TrmFxApp,
} from './app-str.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const app = (cc: string, txn: string, extra: Partial<TrmFxApp> = {}): TrmFxApp => ({ CompanyCode: cc, FinancialTransaction: txn, ...extra })
const fx = (cc: string, txn: string): FxTransaction => ({ CompanyCode: cc, FinancialTransaction: txn }) as FxTransaction

/** Answers every request from `handler`, recording the URLs. */
function stub(handler: (url: URL) => unknown): URL[] {
  const seen: URL[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://gateway')
    seen.push(url)
    return new Response(JSON.stringify({ value: handler(url) }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return seen
}

describe('filters', () => {
  it('builds a key filter that pairs company code with transaction', () => {
    strictEqual(
      keysFilter([app('SG03', '1'), app('IN11', '2')]),
      "(CompanyCode eq 'SG03' and FinancialTransaction eq '1') or (CompanyCode eq 'IN11' and FinancialTransaction eq '2')",
    )
  })

  it('quotes a value that contains a quote', () => {
    strictEqual(keysFilter([app("O'B", '1')]), "(CompanyCode eq 'O''B' and FinancialTransaction eq '1')")
  })

  it('builds a status filter, and nothing for no statuses', () => {
    strictEqual(statusFilter(['07', '10']), "TxnStatus eq '07' or TxnStatus eq '10'")
    strictEqual(statusFilter([]), '')
  })

  it('combines clauses with parentheses so an inner or survives, dropping blanks', () => {
    strictEqual(allOf(statusFilter(['07', '10']), undefined, '', "ZtsfDealID ne ''"), "(TxnStatus eq '07' or TxnStatus eq '10') and (ZtsfDealID ne '')")
    strictEqual(allOf(), '')
  })
})

describe('listTrmFxApp', () => {
  it('pages until a short page, so a large result is not cut off', async () => {
    const rows = Array.from({ length: 1100 }, (_, i) => app('SG03', String(i)))
    const seen = stub((url) => rows.slice(Number(url.searchParams.get('$skip')), Number(url.searchParams.get('$skip')) + Number(url.searchParams.get('$top'))))
    const got = await listTrmFxApp("TxnStatus eq '11'")
    strictEqual(got.length, 1100)
    strictEqual(seen.length, 3)
    strictEqual(seen[0]?.searchParams.get('$filter'), "TxnStatus eq '11'")
    strictEqual(seen[0]?.searchParams.get('$orderby'), 'CompanyCode,FinancialTransaction')
  })

  it('sends no $filter for an unfiltered read', async () => {
    const seen = stub(() => [])
    deepStrictEqual(await listTrmFxApp(), [])
    strictEqual(seen[0]?.searchParams.has('$filter'), false)
  })
})

describe('joining application data to SAP transactions', () => {
  it('matches on company code AND transaction, never the transaction number alone', () => {
    const joined = joinFxWithApp(
      [app('SG03', '100', { TxnStatus: '10' }), app('IN11', '100', { TxnStatus: '03' })],
      [fx('IN11', '100')],
    )
    strictEqual(joined.length, 1)
    strictEqual(joined[0]?.app.TxnStatus, '03')
  })

  it('leaves out application rows SAP no longer serves a transaction for', () => {
    deepStrictEqual(joinFxWithApp([app('SG03', '1')], []), [])
  })

  it('loadFxWithApp reads the app rows by filter, then only their transactions', async () => {
    const seen = stub((url) => {
      if (url.pathname.includes('/trmfxapp/')) return [app('SG03', '1', { TxnStatus: '11' }), app('SG03', '2', { TxnStatus: '11' })]
      return [fx('SG03', '1')] // transaction 2 has no FxTransaction
    })
    const got = await loadFxWithApp(statusFilter(['11']))
    deepStrictEqual(got.map((g) => g.fx.FinancialTransaction), ['1'])
    strictEqual(seen.length, 2)
    strictEqual(seen[1]?.searchParams.get('$filter'), keysFilter([app('SG03', '1'), app('SG03', '2')]))
  })

  it('loadFxWithApp makes no SAP transaction call when no application row matches', async () => {
    const seen = stub(() => [])
    deepStrictEqual(await loadFxWithApp(statusFilter(['99'])), [])
    strictEqual(seen.length, 1)
  })

  it('attachTrmFxApp keeps every SAP transaction, with its record or undefined', async () => {
    stub(() => [app('SG03', '1', { ZtsfDealID: '7000000001' })])
    const got = await attachTrmFxApp([fx('SG03', '1'), fx('SG03', '2')])
    strictEqual(got[0]?.app?.ZtsfDealID, '7000000001')
    strictEqual(got[1]?.app, undefined)
  })

  it('chunks a long key list into several requests', async () => {
    const seen = stub(() => [])
    await attachTrmFxApp(Array.from({ length: 60 }, (_, i) => fx('SG03', String(i))))
    strictEqual(seen.length, 3) // 25 + 25 + 10
  })

  it('appKey separates the two parts', () => {
    strictEqual(appKey('SG03', '1'), 'SG03::1')
  })
})
