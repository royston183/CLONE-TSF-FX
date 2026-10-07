import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { realDeps } from './deps.ts'

type Seen = { url: string; method: string; body: unknown }

describe('real dependencies (stubbed fetch)', () => {
  const realFetch = globalThis.fetch
  let seen: Seen[] = []
  let reply: (url: string, method: string) => unknown = () => ({})
  beforeEach(() => {
    seen = []
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const req = input instanceof Request ? input : null
      const url = String(req ? req.url : input)
      const method = (req?.method ?? init?.method ?? 'GET').toUpperCase()
      const raw = req ? await req.text() : String(init?.body ?? '')
      seen.push({ url, method, body: raw ? JSON.parse(raw) : undefined })
      return new Response(JSON.stringify(reply(url, method)), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('createFx POSTs the body to FxTransaction and returns BUKRS + the new RFHA', async () => {
    reply = () => ({ FinancialTransaction: '1000000777', CompanyCode: 'SG03' })
    const ref = await realDeps.createFx({ CompanyCode: 'SG03', TransactionType: '619' })
    deepStrictEqual(ref, { companyCode: 'SG03', transaction: '1000000777' })
    strictEqual(seen[0]?.method, 'POST')
    strictEqual((seen[0]?.body as Record<string, unknown>)['TransactionType'], '619')
  })

  it('writeDealSlot writes the slot’s BUKRS and RFHA to every Deal ID row, never the other slot', async () => {
    reply = () => ({ ok: true })
    await realDeps.writeDealSlot([{ ZDEAL_ID: 'D-1', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1' }], 2, { companyCode: 'SG03', transaction: '55' })
    const patch = seen.find((s) => s.method === 'PATCH')
    const body = patch?.body as { key: Record<string, string>; changes: Record<string, string> }
    deepStrictEqual(body.key, { ZDEAL_ID: 'D-1', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1' })
    strictEqual(body.changes['ZBUKRS2'], 'SG03')
    strictEqual(body.changes['ZRFHA2'], '55')
    strictEqual('ZRFHA1' in body.changes, false)
  })

  it('cancellationStatusConfig reads ZGTCATR_PARAM for ZSGTSF_RMC_CHILD_DET', async () => {
    reply = () => ({ rows: [{ PROGNAM: 'ZSGTSF_RMC_CHILD_DET', PARAM1: '3' }] })
    deepStrictEqual(await realDeps.cancellationStatusConfig(), { status: '03', fromConfig: true })
    strictEqual(seen[0]?.url.includes('catrParam'), true)
    strictEqual(seen[0]?.url.includes('PROGNAM=ZSGTSF_RMC_CHILD_DET'), true)
  })
})
