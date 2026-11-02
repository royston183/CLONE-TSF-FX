import { deepStrictEqual, ok, rejects, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { createAdditionalLimit, createInitialLimit, loadCurrencyPairs, loadLimits, toRawLimit } from './api.ts'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const limit = { ZYEAR: '2026', ZCURR_PAIR: 'USD-INR', ZLIMIT_STARTDT: '20261001', ZLIMIT_MATDT: '20261031', ZCURR: 'USD', ZUNAPROV_AMT: '1500.25', ZUTL_AMT: '250', ZLIM_APP: 'X' }

describe('Limit Management middleware compatibility', () => {
  it('normalises SAP and ISO validity dates and decimal amounts for the dashboard', () => {
    const sap = toRawLimit(limit)
    deepStrictEqual([sap.startDt, sap.endDt, sap.zunaprov, sap.utl, sap.app], ['2026-10-01', '2026-10-31', 1500.25, 250, true])
    strictEqual(toRawLimit({ ...limit, ZLIMIT_STARTDT: '2026-10-01', ZLIMIT_MATDT: '2026-10-31' }).id, sap.id)
  })

  it('reads the gateway collection and retains only unique currency pairs with a USD leg', async () => {
    globalThis.fetch = (async (input) => json(String(input).includes('tsf-limit') ? { value: [limit] } : { value: [
      { F_CURR: 'USD', T_CURR: 'INR', PAIR: 'USD/INR' },
      { F_CURR: 'USD', T_CURR: 'INR', PAIR: 'USD-INR' },
      { F_CURR: 'EUR', T_CURR: 'USD', PAIR: '' },
      { F_CURR: 'EUR', T_CURR: 'GBP', PAIR: 'EUR-GBP' },
    ] })) as typeof fetch
    strictEqual((await loadLimits()).rows[0]!.startDt, '2026-10-01')
    deepStrictEqual(await loadCurrencyPairs(), ['EUR-USD', 'USD-INR'])
  })

  it('addresses initial and additional writes by the year, pair and SAP validity dates', async () => {
    const calls: { url: string; method: string | undefined; body: unknown }[] = []
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), method: init?.method, body: JSON.parse(String(init?.body)) })
      return json({})
    }) as typeof fetch
    await createInitialLimit({ pair: 'USD-INR', year: 2026, startDt: '2026-10-01', endDt: '2026-10-31', curr: 'USD', amount: 1500.25 })
    await createAdditionalLimit(toRawLimit(limit), 500.25)
    strictEqual(calls.length, 2)
    for (const call of calls) {
      ok(call.url.endsWith('/tsf-limit/2026/USD-INR/20261001/20261031'))
      strictEqual(call.method, 'PUT')
    }
    deepStrictEqual(calls[0]!.body, { ZCURR: 'USD', ZUNAPROV_AMT: 1500.25, ZLIM_SET: 'X' })
    deepStrictEqual(calls[1]!.body, { ZUNAPROV_AMT: 2000.5, ZLIM_ADDLIM: 'X', ZLIM_APP: '' })
  })

  it('reports unavailable middleware and propagates failed saves and cancellation', async () => {
    globalThis.fetch = (async () => json({ error: { message: 'Middleware unavailable' } }, 503)) as typeof fetch
    ok((await loadLimits()).unavailable?.includes('could not be read'))
    await rejects(createAdditionalLimit(toRawLimit(limit), 1))
    globalThis.fetch = (async () => { throw new DOMException('Cancelled', 'AbortError') }) as typeof fetch
    await rejects(loadLimits(), (e: unknown) => (e as { name?: string }).name === 'AbortError' || (e as { body?: { name?: string } }).body?.name === 'AbortError')
    await rejects(loadCurrencyPairs())
  })
})
