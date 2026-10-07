import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { build } from './index.ts'
import { closeDb, getDb } from './sqlite/db.ts'
import { runMigrations } from './sqlite/migrate.ts'

/**
 * The real gateway over real HTTP, with SQLite pointed at a temp file. The last test is the
 * one that matters for the rest of the app: registering /api/localdb must not disturb the
 * raw-buffer proxy that SAP writes depend on.
 */

let backend: Server
let lastBackendBody = ''
let app: Awaited<ReturnType<typeof build>>
let origin: string
let cookie = ''

before(async () => {
  backend = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      if (req.method === 'POST') lastBackendBody = raw
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve))
  const port = (backend.address() as { port: number }).port

  const dir = mkdtempSync(join(tmpdir(), 'slc-localdb-'))
  const configPath = join(dir, 'services.json')
  writeFileSync(
    configPath,
    JSON.stringify({ services: { dealid: { kind: 'odata', base: `http://127.0.0.1:${port}/dealid`, client: '100' } } }),
  )
  process.env['SLC_SERVICES_CONFIG'] = configPath
  process.env['SQLITE_PATH'] = join(dir, 'test.db')
  process.env['AUTH_SECRET'] = 'integration-test-secret'
  process.env['DEMO_USER'] = 'demo'
  process.env['DEMO_PASSWORD'] = 'demo'

  app = await build()
  await app.listen({ port: 0, host: '127.0.0.1' })
  origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`

  const login = await fetch(`${origin}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo', password: 'demo' }),
  })
  cookie = (login.headers.getSetCookie()[0] ?? '').split(';')[0] ?? ''
})

after(async () => {
  await app.close()
  closeDb()
  await new Promise<void>((resolve) => backend.close(() => resolve()))
})

const call = (path: string, init: RequestInit = {}, signedIn = true) =>
  fetch(`${origin}/api/localdb/${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(signedIn ? { cookie } : {}), ...(init.headers ?? {}) },
  })
const json = (body: unknown) => JSON.stringify(body)
const errorOf = async (res: Response) => ((await res.json()) as { error: { message: { value: string } } }).error.message.value

describe('/api/localdb before the database is set up', () => {
  it('says so plainly (503) and does not leak SQLite internals', async () => {
    const res = await call('deal-metadata')
    strictEqual(res.status, 503)
    const message = await errorOf(res)
    ok(message.includes('db:setup'))
    ok(!/no such table|sqlite|\.db/i.test(message))
  })
})

describe('/api/localdb/deal-metadata', () => {
  before(() => {
    runMigrations(getDb())
  })

  it('requires a signed-in session', async () => {
    strictEqual((await call('deal-metadata', {}, false)).status, 401)
    strictEqual((await call('deal-metadata', { method: 'POST', body: json({}) }, false)).status, 401)
  })

  it('creates, reads, patches, lists and deletes through the gateway', async () => {
    const created = await call('deal-metadata', {
      method: 'POST',
      body: json({ companyCode: '9990', transactionId: '100245', strategy: 'HEDGE_01', internalReference: 'ABC' }),
    })
    strictEqual(created.status, 201)
    strictEqual(created.headers.get('location'), '/api/localdb/deal-metadata/9990/100245')
    strictEqual(((await created.json()) as { strategy: string }).strategy, 'HEDGE_01')

    const one = await call('deal-metadata/9990/100245')
    strictEqual(one.status, 200)
    strictEqual(((await one.json()) as { internalReference: string }).internalReference, 'ABC')

    const patched = await call('deal-metadata/9990/100245', { method: 'PATCH', body: json({ remark: 'hello', strategy: null }) })
    strictEqual(patched.status, 200)
    const row = (await patched.json()) as { remark: string; strategy: string | null; internalReference: string }
    deepStrictEqual([row.remark, row.strategy, row.internalReference], ['hello', null, 'ABC'])

    // Same { value: [...] } shape as an OData collection, so the client's list() works on it.
    const all = (await (await call('deal-metadata')).json()) as { value: unknown[] }
    strictEqual(all.value.length, 1)

    strictEqual((await call('deal-metadata/9990/100245', { method: 'DELETE' })).status, 204)
    strictEqual((await call('deal-metadata/9990/100245')).status, 404)
  })

  it('answers 409 for a duplicate key and 404 for a missing one', async () => {
    const body = json({ companyCode: '9990', transactionId: '777' })
    strictEqual((await call('deal-metadata', { method: 'POST', body })).status, 201)
    const dup = await call('deal-metadata', { method: 'POST', body })
    strictEqual(dup.status, 409)
    ok(!/sqlite|constraint|deal_metadata/i.test(await errorOf(dup)))
    strictEqual((await call('deal-metadata/9990/none', { method: 'PATCH', body: json({ remark: 'x' }) })).status, 404)
    strictEqual((await call('deal-metadata/9990/none', { method: 'DELETE' })).status, 404)
  })

  it('answers 400 for bad input and writes nothing', async () => {
    const bad = (body: string) => call('deal-metadata', { method: 'POST', body })
    strictEqual((await bad('{not json')).status, 400)
    strictEqual((await bad('[]')).status, 400)
    strictEqual((await bad(json({ transactionId: '1' }))).status, 400) // no companyCode
    strictEqual((await bad(json({ companyCode: '9990', transactionId: '1', remark: 5 }))).status, 400)
    strictEqual((await bad(json({ companyCode: '9990', transactionId: '1', remark: 'x'.repeat(1001) }))).status, 400)
    strictEqual((await bad(json({ companyCode: '9990', transactionId: '1', id: 99 }))).status, 400) // unknown field
    strictEqual((await call('deal-metadata/9990/1', { method: 'PATCH', body: json({ companyCode: 'X' }) })).status, 400)
    strictEqual((await call('deal-metadata/9990/1')).status, 404)
  })

  it('has no generic SQL or table route', async () => {
    strictEqual((await call('sql?q=SELECT 1')).status, 404)
    strictEqual((await call('sqlite_master')).status, 404)
    strictEqual((await call('deal-metadata/9990/1/extra')).status, 404)
  })

  it('leaves the raw-buffer SAP proxy forwarding bodies byte-for-byte', async () => {
    const payload = { ZottkNo: '100041', ZdealAmt: 1500000 }
    const res = await fetch(`${origin}/api/dealid/DealId`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: json(payload),
    })
    strictEqual(res.status, 201)
    deepStrictEqual(JSON.parse(lastBackendBody), payload)
  })
})
