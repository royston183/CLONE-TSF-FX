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

describe('/api/localdb/tsf-trade-position', () => {
  before(() => {
    runMigrations(getDb())
  })

  const path = (dealId: string, seq: string) => `tsf-trade-position/${dealId}/${seq}`
  const put = (dealId: string, seq: string, body: unknown) => call(path(dealId, seq), { method: 'PUT', body: json(body) })

  it('requires a signed-in session', async () => {
    strictEqual((await call('tsf-trade-position', {}, false)).status, 401)
    strictEqual((await call(path('D1', '01'), { method: 'PUT', body: json({}) }, false)).status, 401)
  })

  it('creates a row (201), updates only the fields sent (200), lists by Deal ID and deletes it', async () => {
    const created = await put('7000000034', '01', { ZBUKRS: 'SG03', ZAMT: 100, ZSET_CHECK: '' })
    strictEqual(created.status, 201)
    const first = (await created.json()) as Record<string, unknown>
    strictEqual(first['ZCREATED_BY'], 'demo')
    ok(/^[0-9]{8}$/.test(String(first['ZCREATED_DATE'])))

    const updated = await put('7000000034', '01', { ZSET_CHECK: 'X' })
    strictEqual(updated.status, 200)
    const row = (await updated.json()) as Record<string, unknown>
    deepStrictEqual([row['ZBUKRS'], row['ZAMT'], row['ZSET_CHECK'], row['ZCREATED_BY']], ['SG03', 100, 'X', 'demo'])

    const list = (await (await call('tsf-trade-position?ZDEAL_ID=7000000034')).json()) as { value: unknown[] }
    strictEqual(list.value.length, 1)
    strictEqual(((await (await call('tsf-trade-position?ZDEAL_ID=other')).json()) as { value: unknown[] }).value.length, 0)

    strictEqual((await call(path('7000000034', '01'), { method: 'DELETE' })).status, 204)
    strictEqual((await call(path('7000000034', '01'))).status, 404)
  })

  it('rejects bad input with 400 and never touches the table', async () => {
    strictEqual((await put('D1', '01', { NOPE: 'x' })).status, 400)
    strictEqual((await put('D1', '01', { ZDEAL_ID: 'other' })).status, 400)
    strictEqual((await put('D1', '01', { ZAMT: 'abc' })).status, 400)
    strictEqual((await put('D1', '001', {})).status, 400) // sequence is 2 characters
    strictEqual(((await (await call('tsf-trade-position?ZDEAL_ID=D1')).json()) as { value: unknown[] }).value.length, 0)
  })
})

describe('/api/localdb/tsf-posting-type', () => {
  before(() => {
    runMigrations(getDb())
  })

  const put = (fiType: string, body: unknown) => call(`tsf-posting-type/${fiType}`, { method: 'PUT', body: json(body) })

  it('requires a signed-in session', async () => {
    strictEqual((await call('tsf-posting-type', {}, false)).status, 401)
  })

  it('stores a posting type by ZFI_TYPE, updates it in place, and rejects bad input', async () => {
    const created = await put('01', { ZPOST_DESC: 'Trade invoice', ZDOC_TYPE: 'RV', ZDR_TEXT: 'Dr Trade A/R' })
    strictEqual(created.status, 201)
    const updated = await put('01', { ZCR_TEXT: 'Cr Revenue' })
    strictEqual(updated.status, 200)
    const row = (await updated.json()) as Record<string, unknown>
    deepStrictEqual([row['ZPOST_DESC'], row['ZDR_TEXT'], row['ZCR_TEXT'], row['ZDOC_TYPE']], ['Trade invoice', 'Dr Trade A/R', 'Cr Revenue', 'RV'])
    strictEqual(((await (await call('tsf-posting-type')).json()) as { value: unknown[] }).value.length, 1)
    strictEqual((await put('01', { NOPE: 'x' })).status, 400)
    strictEqual((await put('01', { ZFI_TYPE: '02' })).status, 400)
    strictEqual((await put('001', {})).status, 400)
    strictEqual((await call('tsf-posting-type/01', { method: 'DELETE' })).status, 204)
    strictEqual((await call('tsf-posting-type/01')).status, 404)
  })
})

describe('/api/localdb/tsf-deal-document', () => {
  before(() => {
    runMigrations(getDb())
  })

  const slot = '7000000056/10/D02'
  const put = (path: string, body: unknown) => call(`tsf-deal-document/${path}`, { method: 'PUT', body: json(body) })

  it('requires a signed-in session', async () => {
    strictEqual((await call('tsf-deal-document', {}, false)).status, 401)
  })

  it('stores a slot by Deal ID + category + type, speaking dates as the middleware does', async () => {
    const created = await put(slot, { ZDDATE: '2026-10-13', ZDMS_CODE: '5070000001', ZSTND_DMS: '10000000123', ZCREATED_BY: 'SPOOF' })
    strictEqual(created.status, 201)
    const row = (await created.json()) as Record<string, unknown>
    deepStrictEqual([row['ZDDATE'], row['ZDMS_CODE'], row['ZCREATED_BY']], ['2026-10-13', '5070000001', 'demo'])
    ok(/^\d{2}:\d{2}:\d{2}$/.test(String(row['ZCREATED_TIME'])))
    strictEqual((await put(slot, { ZDDATE: '2026-10-14' })).status, 200)

    await put('7000000056/10/D03', { ZDDATE: '2026-10-13' })
    await put('7000000057/10/D02', { ZDDATE: '2026-10-13' })
    const list = async (q: string) => ((await (await call(`tsf-deal-document?${q}`)).json()) as { value: Record<string, unknown>[] }).value
    strictEqual((await list('ZDEAL_ID=7000000056&ZDMS_CAT=10')).length, 2)
    const one = await list('ZDEAL_ID=7000000056&ZDMS_CAT=10&ZDMS_TYPE=D02')
    deepStrictEqual(one.map((r) => [r['ZDDATE'], r['ZSTND_DMS']]), [['2026-10-14', '10000000123']])
  })

  it('rejects bad input with 400 and answers 404 for a missing slot', async () => {
    strictEqual((await put(slot, { ZDDATE: '13.10.2026' })).status, 400)
    strictEqual((await put(slot, { NOPE: 'x' })).status, 400)
    strictEqual((await put('7000000056/100/D02', {})).status, 400)
    strictEqual((await call(`tsf-deal-document/${slot}`, { method: 'DELETE' })).status, 204)
    strictEqual((await call(`tsf-deal-document/${slot}`)).status, 404)
  })
})

describe('/api/localdb/tsf-day-lock', () => {
  before(() => {
    runMigrations(getDb())
  })

  const day = 'tsf-day-lock/20261015/G01/T001'
  const put = (path = day) => call(path, { method: 'PUT', body: json({}) })
  const list = async (q: string) => ((await (await call(`tsf-day-lock?${q}`)).json()) as { value: Record<string, unknown>[] }).value

  it('requires a signed-in session', async () => {
    strictEqual((await call('tsf-day-lock', {}, false)).status, 401)
    strictEqual((await call(day, { method: 'PUT', body: json({}) }, false)).status, 401)
  })

  it('an unlocked day is a 404, locking it answers 201 and stamps who locked it, locking again is a 200', async () => {
    strictEqual((await call(day)).status, 404)
    const created = await put()
    strictEqual(created.status, 201)
    const row = (await created.json()) as Record<string, unknown>
    deepStrictEqual([row['ZLOCKED'], row['ZB_TYPE'], row['ZCO_AREA'], row['ZPDATE'], row['ZGRP'], row['ZTYPE'], row['ZYEAR'], row['ZMONTH'], row['ZCREATED_BY']], ['X', 'DE6', 'OL10', '20261015', 'G01', 'T001', '2026', '10', 'demo'])
    strictEqual((await call(day)).status, 200)
    strictEqual((await put()).status, 200)
    strictEqual((await list('ZTYPE=T001')).filter((r) => r['ZPDATE'] === '20261015').length, 1)
  })

  it('lists the locked days of one trader, and those of another trader are not in it', async () => {
    await put('tsf-day-lock/20261014/G01/T001')
    await put('tsf-day-lock/20261015/G01/T002')
    deepStrictEqual((await list('ZTYPE=T001')).map((r) => r['ZPDATE']), ['20261014', '20261015'])
    deepStrictEqual((await list('ZTYPE=T002')).map((r) => r['ZPDATE']), ['20261015'])
  })

  it('rejects a bad date, group or trader with 400, ignores any field in the body, and unlocks with a 204 then a 404', async () => {
    strictEqual((await put('tsf-day-lock/2026-10-15/G01/T001')).status, 400)
    strictEqual((await put('tsf-day-lock/20261340/G01/T001')).status, 400)
    strictEqual((await put('tsf-day-lock/20261015/G012/T001')).status, 400)
    strictEqual((await put('tsf-day-lock/20261015/G01/T0000000001')).status, 400)
    const forged = await call('tsf-day-lock/20261016/G01/T001', { method: 'PUT', body: json({ ZLOCKED: '', ZCREATED_BY: 'SPOOF' }) })
    strictEqual(((await forged.json()) as Record<string, unknown>)['ZLOCKED'], 'X')
    strictEqual((await call(day, { method: 'DELETE' })).status, 204)
    strictEqual((await call(day, { method: 'DELETE' })).status, 404)
    strictEqual((await call(day)).status, 404)
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
