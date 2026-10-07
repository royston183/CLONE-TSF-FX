import { strictEqual } from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { build } from './index.ts'

/** Drives the real gateway, over real HTTP, against a `sqlite` service on a temp file. */

let app: Awaited<ReturnType<typeof build>>
let origin: string
let cookie: string

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slc-sqlite-int-'))
  const configPath = join(dir, 'services.json')
  writeFileSync(
    configPath,
    JSON.stringify({ services: { local: { kind: 'sqlite', file: join(dir, 'test.db') } } }),
  )

  process.env['SLC_SERVICES_CONFIG'] = configPath
  process.env['AUTH_SECRET'] = 'integration-test-secret'
  process.env['DEMO_USER'] = 'demo'
  process.env['DEMO_PASSWORD'] = 'demo'

  app = await build()
  await app.listen({ port: 0, host: '127.0.0.1' })
  origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`

  const res = await fetch(`${origin}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo', password: 'demo' }),
  })
  cookie = (res.headers.getSetCookie()[0] ?? '').split(';')[0] ?? ''
})

after(async () => {
  await app.close()
})

const call = (path: string, method = 'GET', body?: unknown) =>
  fetch(`${origin}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

describe('sqlite service', () => {
  it('round-trips a record and stamps it with the signed-in user', async () => {
    const created = await call('/api/local/deals', 'POST', { id: 'D-1', amount: 1500000, ccy: 'USD' })
    strictEqual(created.status, 201)
    strictEqual(created.headers.get('location'), '/api/local/deals/D-1')

    const patched = await call('/api/local/deals/D-1', 'PATCH', { amount: 2000000 })
    const record = (await patched.json()) as { amount: number; ccy: string; _meta: { updatedBy: string } }
    strictEqual(record.amount, 2000000)
    strictEqual(record.ccy, 'USD')
    strictEqual(record._meta.updatedBy, 'demo')
  })

  it('answers a collection in the OData { value } shape with $filter applied', async () => {
    await call('/api/local/deals', 'POST', { id: 'D-2', amount: 5, ccy: 'EUR' })
    const res = await call("/api/local/deals?$filter=ccy%20eq%20'EUR'")
    const body = (await res.json()) as { value: { id: string }[] }
    strictEqual(body.value.length, 1)
    strictEqual(body.value[0]?.id, 'D-2')
  })

  it('answers 400, 404 and 409 in the error shape the client reads, never 502', async () => {
    const bad = await call('/api/local/deals?$filter=amount%20gt%205')
    strictEqual(bad.status, 400)
    const message = ((await bad.json()) as { error: { message: { value: string } } }).error.message.value
    strictEqual(message.includes('eq'), true)

    strictEqual((await call('/api/local/deals/nope')).status, 404)
    strictEqual((await call('/api/local/deals', 'POST', { id: 'D-1' })).status, 409)
    strictEqual((await call('/api/local/deals', 'POST', [1, 2])).status, 400)
  })

  it('deletes a record', async () => {
    strictEqual((await call('/api/local/deals/D-2', 'DELETE')).status, 204)
    strictEqual((await call('/api/local/deals/D-2')).status, 404)
  })

  it('refuses an unauthenticated call', async () => {
    strictEqual((await fetch(`${origin}/api/local/deals`)).status, 401)
  })
})
