import { deepStrictEqual, rejects, strictEqual } from 'node:assert/strict'
import { it, mock } from 'node:test'
import { loadLinkedDeals } from './api.ts'

it('reads every linked Deal ID for the selected master contract, including cancelled deals', async () => {
  const controller = new AbortController()
  const deals = [
    { ZMC_REF: '2000000001', ZDEAL_ID: '7000000001', ZDEAL_STAT: '01' },
    { ZMC_REF: '2000000001', ZDEAL_ID: '7000000002', ZDEAL_STAT: '30' },
  ]
  const mocked = mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    strictEqual(url.pathname.endsWith('/data/tsfDealId'), true)
    strictEqual(url.searchParams.get('ZMC_REF'), '2000000001')
    strictEqual(url.searchParams.has('ZDEAL_STAT'), false)
    strictEqual(init?.signal, controller.signal)
    return new Response(JSON.stringify({ rows: deals }), { headers: { 'content-type': 'application/json' } })
  })
  try {
    deepStrictEqual(await loadLinkedDeals(2000000001, controller.signal), deals)
  } finally {
    mocked.mock.restore()
  }
})

it('returns a real empty list and reports backend failures without sample Deal IDs', async () => {
  let refused = false
  const mocked = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(refused ? { message: 'Access denied' } : { rows: [] }), {
    status: refused ? 403 : 200,
    headers: { 'content-type': 'application/json' },
  }))
  try {
    deepStrictEqual(await loadLinkedDeals(2000000001), [])
    refused = true
    await rejects(loadLinkedDeals(2000000001))
  } finally {
    mocked.mock.restore()
  }
})
