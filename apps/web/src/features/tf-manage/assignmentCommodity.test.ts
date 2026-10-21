import { deepStrictEqual, match, rejects, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { assignmentCommodityError, dealCommodity, validateAssignmentCommodity } from './assignmentCommodity.ts'
import type { DealCommodity } from './assignmentCommodity.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const fx = { ZDEAL_ID: '7000000019', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZMC_REF: '2000000032' }
const mc = { ZMC_REF_NO: '2000000032', ZCOMMODITY: 'C106', ZCOM_DESC: 'WHEAT' }
const context: DealCommodity = dealCommodity(fx, mc)

describe('ASS_DEAL FX commodity rule', () => {
  it('allows the same GT commodity code, ignoring surrounding SAP padding', () => {
    strictEqual(assignmentCommodityError(dealCommodity(fx, { ...mc, ZCOMMODITY: 'C106 ' }), ' C106 '), '')
  })

  it('blocks a different commodity code and names the parent MC and both codes', () => {
    const error = assignmentCommodityError(context, 'C108')
    match(error, /C108.*2000000032.*C106/)
  })

  it('preserves C001 as the MC-only multi-commodity exception', () => {
    const multi = dealCommodity(fx, { ...mc, ZCOMMODITY: 'C001' })
    strictEqual(assignmentCommodityError(multi, 'C108'), '')
    strictEqual(assignmentCommodityError(multi, ''), '')
    match(assignmentCommodityError(context, 'C001'), /does not match/)
  })

  it('does not substitute the invoice commodity or a matching description for the GT code', () => {
    match(assignmentCommodityError(context, 'WHEAT'), /does not match/)
    match(assignmentCommodityError(context, ''), /GT Commodity is not maintained/)
  })

  it('blocks unavailable MC commodity data, including an absent MC reference', () => {
    match(assignmentCommodityError(dealCommodity(fx), 'C106'), /Cannot verify the master contract commodity/)
    match(assignmentCommodityError({ ...context, mcRefNo: '' }, 'C106'), /Cannot verify/)
  })

  it('leaves the ABAP non-FX branch without a commodity restriction', () => {
    strictEqual(assignmentCommodityError(dealCommodity({ ...fx, ZDEAL_TYPE: 'CT', ZSUB_TYPE: 'ICFSI' }), 'C108'), '')
  })

  it('uses the actual FX type even when the popup structure was changed to CT', () => {
    const actual = dealCommodity(fx, mc, 'CT')
    strictEqual(actual.dealStructure, 'FX')
    match(assignmentCommodityError(actual, 'C108'), /does not match/)
  })

  it('recognizes an FX subtype if the stored structure is absent and blocks unknown structures', () => {
    strictEqual(dealCommodity({ ...fx, ZDEAL_TYPE: '', ZSUB_TYPE: 'FX2' }, mc).dealStructure, 'FX')
    match(assignmentCommodityError(dealCommodity({ ZDEAL_ID: '1' }), 'C106'), /Cannot verify the structure/)
  })
})

function stub(commodity = 'C106', missing: 'deal' | 'mc' | '' = '') {
  const seen: { url: URL; method: string }[] = []
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input), 'http://gateway')
    seen.push({ url, method: init?.method ?? 'GET' })
    const rows = url.pathname.endsWith('/tsfDealId') ? (missing === 'deal' ? [] : [fx]) :
      (missing === 'mc' ? [] : [{ ...mc, ZCOMMODITY: commodity }])
    return new Response(JSON.stringify({ rows }), { status: 200 })
  }) as typeof fetch
  return seen
}

describe('Update commodity preflight', () => {
  it('re-reads exactly the selected Deal ID and its MC without writing', async () => {
    const seen = stub()
    await validateAssignmentCommodity('7000000019', 'C106')
    deepStrictEqual(seen.map((r) => r.url.pathname), ['/api/middleware/data/tsfDealId', '/api/middleware/data/masterContract'])
    strictEqual(seen[0]?.url.searchParams.get('ZDEAL_ID'), '7000000019')
    strictEqual(seen[1]?.url.searchParams.get('ZMC_REF_NO'), '2000000032')
    deepStrictEqual(seen.map((r) => r.method), ['GET', 'GET'])
  })

  it('rejects an MC commodity changed after the popup staged its assignment', async () => {
    stub('C106')
    await validateAssignmentCommodity('7000000019', 'C106')
    const seen = stub('C108')
    await rejects(validateAssignmentCommodity('7000000019', 'C106'), /does not match/)
    strictEqual(seen.every((r) => r.method === 'GET'), true)
  })

  it('accepts a freshly read C001 MC and refuses missing records', async () => {
    stub('C001')
    await validateAssignmentCommodity('7000000019', 'C108')
    stub('C106', 'deal')
    await rejects(validateAssignmentCommodity('7000000019', 'C106'), /does not exist/)
    stub('C106', 'mc')
    await rejects(validateAssignmentCommodity('7000000019', 'C106'), /Cannot verify/)
  })

  it('does not fall back to cached commodity data if the live MC read fails', async () => {
    globalThis.fetch = (async (input) => new Response(JSON.stringify(
      String(input).includes('/tsfDealId') ? { rows: [fx] } : { error: { message: 'MC lookup unavailable' } },
    ), { status: String(input).includes('/tsfDealId') ? 200 : 503 })) as typeof fetch
    await rejects(validateAssignmentCommodity('7000000019', 'C106'), /MC lookup unavailable/)
  })
})
