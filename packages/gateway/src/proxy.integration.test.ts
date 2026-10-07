import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { build } from './index.ts'

/**
 * Drives the real gateway against a stub backend over real HTTP.
 *
 * These exist because of a bug unit tests could not have caught: Fastify's built-in
 * application/json parser outranks a '*' catch-all, so request bodies were parsed into
 * objects, failed the Buffer check in the proxy route, and were silently dropped. Every
 * write reached the backend with no fields. Nothing failed loudly — the create "succeeded"
 * and produced an empty record.
 */

type Received = { method: string; url: string; body: string; headers: Record<string, unknown> }

let backend: Server
let received: Received[] = []
let app: Awaited<ReturnType<typeof build>>
let origin: string

before(async () => {
  backend = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      received.push({ method: req.method ?? '', url: req.url ?? '', body: raw, headers: req.headers })
      if (req.url?.includes('Boom')) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: { value: 'Field ZdealAmt is required' } } }))
        return
      }
      res.writeHead(201, {
        'content-type': 'application/json',
        'odata-entityid': "http://backend/DealId('900123')",
        'x-csrf-token': 'stub-token',
      })
      res.end(JSON.stringify({ ok: true }))
    })
  })
  await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve))
  const port = (backend.address() as { port: number }).port

  const dir = mkdtempSync(join(tmpdir(), 'slc-int-'))
  const configPath = join(dir, 'services.json')
  writeFileSync(
    configPath,
    JSON.stringify({
      services: { dealid: { kind: 'odata', base: `http://127.0.0.1:${port}/dealid`, client: '100' } },
    }),
  )

  process.env['SLC_SERVICES_CONFIG'] = configPath
  process.env['AUTH_SECRET'] = 'integration-test-secret'
  process.env['DEMO_USER'] = 'demo'
  process.env['DEMO_PASSWORD'] = 'demo'

  app = await build()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address() as { port: number }
  origin = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await app.close()
  await new Promise<void>((resolve) => backend.close(() => resolve()))
})

async function signIn(): Promise<string> {
  const res = await fetch(`${origin}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo', password: 'demo' }),
  })
  strictEqual(res.status, 200)
  const cookie = res.headers.getSetCookie()[0] ?? ''
  return cookie.split(';')[0] ?? ''
}

describe('gateway proxying', () => {
  it('forwards a JSON request body byte-for-byte', async () => {
    const cookie = await signIn()
    received = []
    const payload = { ZottkNo: '100041', ZdttkNo: '200041', ZdealAmt: 1500000, ZdealCurr: 'USD' }

    const res = await fetch(`${origin}/api/dealid/DealId`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(payload),
    })
    strictEqual(res.status, 201)

    // The write is preceded by a CSRF token fetch, so the POST is the last thing seen.
    const post = received.filter((r) => r.method === 'POST').at(-1)
    deepStrictEqual(JSON.parse(post?.body ?? '{}'), payload)
  })

  it('passes OData-EntityId back, which is how a generated key is recovered', async () => {
    const cookie = await signIn()
    const res = await fetch(`${origin}/api/dealid/DealId`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ a: 1 }),
    })
    strictEqual(res.headers.get('odata-entityid'), "http://backend/DealId('900123')")
  })

  it('injects the CSRF token on writes and never asks the browser for one', async () => {
    const cookie = await signIn()
    received = []
    await fetch(`${origin}/api/dealid/DealId`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ a: 1 }),
    })
    const post = received.filter((r) => r.method === 'POST').at(-1)
    strictEqual(post?.headers['x-csrf-token'], 'stub-token')
  })

  it('forwards If-Match on a write, which a RAP service needs to accept a PATCH', async () => {
    const cookie = await signIn()
    received = []
    await fetch(`${origin}/api/dealid/DealId(CompanyCode='SG03',FinancialTransaction='100024')`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie, 'if-match': '*' },
      body: JSON.stringify({ TxnStatus: '03' }),
    })
    const patch = received.filter((r) => r.method === 'PATCH').at(-1)
    strictEqual(patch?.headers['if-match'], '*')
    received = []
    await fetch(`${origin}/api/dealid/DealId`, { method: 'GET', headers: { cookie, 'if-match': '*' } })
    strictEqual(received.filter((r) => r.method === 'GET').at(-1)?.headers['if-match'], undefined)
  })

  it('forwards the query string without re-encoding it', async () => {
    const cookie = await signIn()
    received = []
    const query = "$filter=ZdttkNo%20eq%20'200041'&$select=ZdealAmt"
    await fetch(`${origin}/api/dealid/DealId?${query}`, { headers: { cookie } })
    const url = received.filter((r) => r.method === 'GET').at(-1)?.url ?? ''

    // What matters is that the encoding is neither decoded nor applied twice. A single
    // %20 must arrive as %20: decoded to a raw space, or doubled to %2520, both make SAP
    // reject the filter. (The URL parser normalises ' to %27 on the way through, which is
    // the same character and decodes identically, so the quote is not asserted literally.)
    strictEqual(url.includes('%20eq%20'), true, url)
    strictEqual(url.includes('%2520'), false, url)
    // $filter must stay a literal $, not become %24filter.
    strictEqual(url.includes('$filter='), true, url)
    strictEqual(url.includes('200041'), true, url)
    strictEqual(url.includes('sap-client=100'), true, url)
  })

  it('relays a backend error status and message rather than masking it as an outage', async () => {
    const cookie = await signIn()
    const res = await fetch(`${origin}/api/dealid/Boom`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({}),
    })
    // Not 502: the backend answered. 502 must stay reserved for "could not reach it at all".
    strictEqual(res.status, 400)
    const body = (await res.json()) as { error?: { message?: { value?: string } } }
    strictEqual(body.error?.message?.value, 'Field ZdealAmt is required')
  })

  it('answers 502 when the backend cannot be reached at all', async () => {
    const cookie = await signIn()
    await new Promise<void>((resolve) => backend.close(() => resolve()))
    const res = await fetch(`${origin}/api/dealid/DealId`, { headers: { cookie } })
    strictEqual(res.status, 502)
    // Restart for any later test, and for the after() hook.
    await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve))
  })

  it('refuses an unauthenticated call before it ever reaches the backend', async () => {
    received = []
    const res = await fetch(`${origin}/api/dealid/DealId`)
    strictEqual(res.status, 401)
    strictEqual(received.length, 0)
  })
})
