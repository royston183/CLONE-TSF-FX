import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { build } from './index.ts'
import { loadServices } from './config.ts'
import { cloudTable } from './cloud/table.ts'
import { DAYLOCK_COLUMNS } from './sqlite/repositories/daylock-columns.ts'
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
const cloudRows = new Map<string, Record<string, unknown>[]>([
  ['trdPos', []], ['tsfTrdAcc', []], ['tsfDealdms', []], ['dmsType', []], ['daylock', []],
  ['limMan', []], ['curpair', []], ['fields', []],
])
const cloudKeys: Record<string, string[]> = {
  trdPos: ['zdeal_id', 'zseq'], tsfTrdAcc: ['zfi_type'], tsfDealdms: ['zdms_cat', 'zdms_type', 'zdeal_id'],
  dmsType: ['ZDMS_CAT', 'ZDMS_TYPE'], daylock: ['ZCO_AREA', 'ZMONTH', 'ZYEAR', 'ZTYPE', 'ZB_TYPE', 'ZPDATE', 'ZGRP'],
  limMan: ['zyear', 'zcurr_pair', 'zlimit_startdt', 'zlimit_matdt'], curpair: ['f_curr', 't_curr'], fields: ['zfield'],
}
const cloudCalls: { method: string; resource: string; body: Record<string, unknown> }[] = []
let cloudFailure = 0

before(async () => {
  backend = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      const url = new URL(req.url ?? '', 'http://localhost')
      if (url.pathname.startsWith('/middleware/data/')) {
        const resource = url.pathname.split('/').at(-1)!
        const rows = cloudRows.get(resource)
        const send = (status: number, data: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(data))
        }
        if (cloudFailure) return send(cloudFailure, { ok: false, error: { message: 'Cloud is unavailable.' } })
        if (!rows) return send(404, { ok: false, error: { message: 'Unknown resource.' } })
        const body = raw ? JSON.parse(raw) as Record<string, unknown> : {}
        const data = (body['data'] ?? body['key'] ?? {}) as Record<string, unknown>
        const changes = (body['changes'] ?? {}) as Record<string, unknown>
        const upper = resource === 'dmsType' || resource === 'daylock'
        const fields = [...url.searchParams.keys()].filter((k) => !['sort', 'limit', 'offset'].includes(k))
        fields.push(...Object.keys(data), ...Object.keys(changes))
        if (fields.some((k) => k.toLowerCase() === 'client' || (upper ? /[a-z]/.test(k) : /[A-Z]/.test(k)))) {
          return send(400, { ok: false, error: { message: 'Wrong column casing or supplied client.' } })
        }
        if (upper && Object.entries({ ...data, ...changes }).some(([k, v]) => k.endsWith('_TIME') && v === '')) {
          return send(400, { ok: false, error: { message: 'A NOT NULL cloud time cannot be blank.' } })
        }
        cloudCalls.push({ method: req.method!, resource, body })
        if (req.method === 'GET') {
          const found = rows.filter((r) => [...url.searchParams].every(([k, v]) => ['sort', 'limit', 'offset'].includes(k) || r[k] === v))
          found.sort((a, b) => {
            for (const name of (url.searchParams.get('sort') ?? '').split(',')) {
              const order = String(a[name] ?? '').localeCompare(String(b[name] ?? ''))
              if (order) return order
            }
            return 0
          })
          const start = Number(url.searchParams.get('offset') ?? 0)
          return send(200, { ok: true, rows: found.slice(start, start + Number(url.searchParams.get('limit') ?? 500)) })
        }
        const index = rows.findIndex((r) => cloudKeys[resource]!.every((k) => r[k] === data[k]))
        if (req.method === 'POST') {
          if (index >= 0) return send(409, { ok: false, error: { message: 'Duplicate key.' } })
          rows.push({ ...data, [upper ? 'ZCREATED_TIME' : 'zcreated_time']: '00:00:01', [upper ? 'CLIENT' : 'client']: '100' })
          return send(201, { ok: true, key: data, affectedRows: 1 })
        }
        if (req.method === 'PATCH' && index >= 0) Object.assign(rows[index]!, changes)
        if (req.method === 'DELETE' && index >= 0) rows.splice(index, 1)
        return send(200, { ok: true, affectedRows: index >= 0 ? 1 : 0 })
      }
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
    JSON.stringify({ services: {
      dealid: { kind: 'odata', base: `http://127.0.0.1:${port}/dealid`, client: '100' },
      middleware: { kind: 'rest', base: `http://127.0.0.1:${port}/middleware` },
    } }),
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

describe('/api/localdb/tsf-trade-position (cloud; SQLite is not initialised)', () => {

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
    strictEqual(first['ZCREATED_TIME'], '000001') // Return the cloud's stored audit time, not a synthetic write result.
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

describe('/api/localdb/tsf-posting-type (cloud)', () => {

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

describe('/api/localdb/tsf-deal-document (cloud)', () => {

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

describe('cloud persistence compatibility', () => {
  it('uses the TSF resources, lowercase keys and partial PATCH changes, with no client field', () => {
    deepStrictEqual([...new Set(cloudCalls.filter((c) => c.method === 'POST').map((c) => c.resource))].sort(), ['trdPos', 'tsfDealdms', 'tsfTrdAcc'])
    const create = cloudCalls.find((c) => c.resource === 'trdPos' && c.method === 'POST')!.body['data'] as Record<string, unknown>
    deepStrictEqual([create['zdeal_id'], create['zseq'], create['zpay_amt'], create['zbelnr']], ['7000000034', '01', 0, ''])
    const patch = cloudCalls.find((c) => c.resource === 'trdPos' && c.method === 'PATCH')!.body
    deepStrictEqual(patch['key'], { zdeal_id: '7000000034', zseq: '01' })
    deepStrictEqual(Object.keys(patch['changes'] as object).sort(), ['zchanged_by', 'zchanged_date', 'zchanged_time', 'zset_check'])
  })

  it('reads imported SAP dates and ISO dates, decimal strings and all pages from cloud', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      zdeal_id: `PAGE${i}`, zseq: '1', zamt: '123.4500000000', zdue_date: i ? '2026-11-16' : '20261116',
      zcreated_time: i ? '17:29:48' : '172948',
    }))
    cloudRows.get('trdPos')!.push(...rows)
    try {
      const result = await call('tsf-trade-position')
      strictEqual(result.status, 200)
      const body = await result.json() as { value: Record<string, unknown>[] }
      const page = body.value.filter((r) => String(r['ZDEAL_ID']).startsWith('PAGE'))
      strictEqual(page.length, 501)
      for (const r of page) deepStrictEqual([r['ZDUE_DATE'], r['ZCREATED_TIME'], r['ZAMT']], ['20261116', '172948', 123.45])
    } finally {
      cloudRows.set('trdPos', cloudRows.get('trdPos')!.filter((r) => !String(r['zdeal_id']).startsWith('PAGE')))
    }
  })

  it('returns cloud failures and never falls back to a local row', async () => {
    cloudFailure = 503
    try {
      for (const path of ['tsf-trade-position', 'tsf-posting-type', 'tsf-deal-document', 'tsf-dms-type', 'tsf-day-lock']) {
        const res = await call(path)
        strictEqual(res.status, 503)
        strictEqual(await errorOf(res), 'Cloud is unavailable.')
      }
    } finally { cloudFailure = 0 }
  })
})

describe('/api/localdb/tsf-dms-type (cloud)', () => {
  before(() => {
    cloudRows.get('dmsType')!.push(
      { ZDMS_CAT: '', ZDMS_TYPE: 'D01', ZDMS_DESC: 'Initial category', ZDMS_OBJ: 'CLOUD', ZCREATED_DATE: '2026-08-27' },
      { ZDMS_CAT: '10', ZDMS_TYPE: 'D01', ZDMS_DESC: 'Cloud document', ZDMS_OBJ: 'LIVE_RANGE', ZDMS_RANGE: '01', ZCREATED_DATE: '2026-08-27' },
      { ZDMS_CAT: '11', ZDMS_TYPE: 'D01', ZDMS_DESC: 'Other category' },
    )
  })

  it('requires a session and reads cloud document types, retaining initial categories and range configuration', async () => {
    strictEqual((await call('tsf-dms-type', {}, false)).status, 401)
    const all = (await (await call('tsf-dms-type')).json()) as { value: Record<string, unknown>[] }
    strictEqual(all.value.length, 3)
    strictEqual(all.value[0]!['ZDMS_CAT'], '')
    const filtered = (await (await call('tsf-dms-type?ZDMS_CAT=10')).json()) as { value: Record<string, unknown>[] }
    strictEqual(filtered.value.length, 1)
    deepStrictEqual([filtered.value[0]!['ZDMS_OBJ'], filtered.value[0]!['ZDMS_RANGE'], filtered.value[0]!['ZCREATED_DATE']], ['LIVE_RANGE', '01', '20260827'])
  })

  it('creates, updates, reads and deletes by category and type without changing the key or creation audit', async () => {
    const path = 'tsf-dms-type/10/D02'
    const first = await call(path, { method: 'PUT', body: json({ ZDMS_DESC: 'Invoice', ZDMS_OBJ: 'NUMBER', ZCREATED_BY: 'SPOOF' }) })
    strictEqual(first.status, 201)
    strictEqual((await first.json() as Record<string, unknown>)['ZCREATED_BY'], 'demo')
    const updated = await call(path, { method: 'PUT', body: json({ ZDMS_RANGE: '02', ZCREATED_BY: 'SPOOF' }) })
    strictEqual(updated.status, 200)
    const row = await updated.json() as Record<string, unknown>
    deepStrictEqual([row['ZDMS_DESC'], row['ZDMS_OBJ'], row['ZDMS_RANGE'], row['ZCREATED_BY']], ['Invoice', 'NUMBER', '02', 'demo'])
    strictEqual((await call(path)).status, 200)
    strictEqual((await call(path, { method: 'PUT', body: json({ ZDMS_CAT: '11' }) })).status, 400)
    strictEqual((await call(path, { method: 'DELETE' })).status, 204)
    strictEqual((await call(path)).status, 404)
  })
})

describe('/api/localdb/tsf-day-lock (cloud; SQLite is not initialised)', () => {

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

  it('uses single-digit SAP months and finds older padded months without creating duplicate locks', async () => {
    for (const [date, month] of [['20260106', '1'], ['20260206', '02']]) {
      cloudRows.get('daylock')!.push({ ZCO_AREA: 'OL10', ZMONTH: month, ZYEAR: '2026', ZTYPE: 'T001', ZB_TYPE: 'DE6', ZPDATE: date, ZGRP: 'G01', ZLOCKED: 'X' })
      const path = `tsf-day-lock/${date}/G01/T001`
      strictEqual((await call(path)).status, 200)
      strictEqual((await put(path)).status, 200)
      strictEqual(cloudRows.get('daylock')!.filter((r) => r['ZPDATE'] === date).length, 1)
      strictEqual((await call(path, { method: 'DELETE' })).status, 204)
    }
    const created = await put('tsf-day-lock/20260306/G01/T001')
    strictEqual(created.status, 201)
    strictEqual((await created.json() as Record<string, unknown>)['ZMONTH'], '3')
    const write = cloudCalls.findLast((c) => c.resource === 'daylock' && c.method === 'POST')!.body['data'] as Record<string, unknown>
    strictEqual(write['ZPDATE'], '20260306') // ZPDATE is text in the live cloud contract, including in the key.
  })

  it('copies initial local audit times as midnight for typed NOT NULL cloud columns', async () => {
    const services = loadServices(process.env['SLC_SERVICES_CONFIG'])
    try {
      const repo = cloudTable(services.get('middleware'), 'daylock', DAYLOCK_COLUMNS, 'upper')
      const key = { ZCO_AREA: 'OL10', ZMONTH: '4', ZYEAR: '2026', ZTYPE: 'T003', ZB_TYPE: 'DE6', ZPDATE: '20260406', ZGRP: 'G01' }
      const row = await repo.upsert(key, { ZLOCKED: 'X', ZCREATED_TIME: '', ZCHANGED_TIME: '' }, undefined)
      strictEqual(row['ZCHANGED_TIME'], '000000')
      const write = cloudCalls.findLast((c) => c.resource === 'daylock' && c.method === 'POST')!.body['data'] as Record<string, unknown>
      deepStrictEqual([write['ZCREATED_TIME'], write['ZCHANGED_TIME']], ['00:00:00', '00:00:00'])
    } finally {
      for (const service of services.values()) await service.agent.close()
    }
  })
})

describe('/api/localdb limit resources (cloud; SQLite is not initialised)', () => {
  const path = 'tsf-limit/2026/USD-INR/20261001/20261031'
  const put = (route: string, body: unknown) => call(route, { method: 'PUT', body: json(body) })

  it('requires a session for limits, pairs, fields and limit writes', async () => {
    for (const route of ['tsf-limit', 'tsf-currency-pair', 'tsf-field-name']) {
      strictEqual((await call(route, {}, false)).status, 401)
    }
    strictEqual((await call(path, { method: 'PUT', body: json({ ZUNAPROV_AMT: 50 }) }, false)).status, 401)
  })

  it('reads curpair and fields from cloud with SAP column names, without exposing client columns', async () => {
    cloudRows.get('curpair')!.push({ mandt: '100', f_curr: 'USD', t_curr: 'INR', pair: 'USD-INR', div_ratio: '100' })
    cloudRows.get('fields')!.push({ client: '100', zfield: 'ZDEAL_ID', zname: 'Treasury Deal', created_date: '2026-10-22' })
    const pairs = await call('tsf-currency-pair')
    strictEqual(pairs.status, 200)
    const pair = ((await pairs.json()) as { value: Record<string, unknown>[] }).value[0]!
    deepStrictEqual([pair['F_CURR'], pair['T_CURR'], pair['PAIR'], pair['DIV_RATIO']], ['USD', 'INR', 'USD-INR', 100])
    ok(!('MANDT' in pair))
    const fields = await call('tsf-field-name')
    strictEqual(fields.status, 200)
    const field = ((await fields.json()) as { value: Record<string, unknown>[] }).value[0]!
    deepStrictEqual([field['ZFIELD'], field['ZNAME'], field['CREATED_DATE']], ['ZDEAL_ID', 'Treasury Deal', '20261022'])
    ok(!('CLIENT' in field))
  })

  it('creates and updates limits by the full business key, preserving creation audit and partial fields', async () => {
    const create = await put(path, { ZCURR: 'USD', ZUNAPROV_AMT: '1500.25', ZLIM_SET: 'X', ZCREATED_BY: 'spoof', ZCHANGED_BY: 'spoof' })
    strictEqual(create.status, 201)
    const first = await create.json() as Record<string, unknown>
    deepStrictEqual([first['ZUNAPROV_AMT'], first['ZCREATED_BY'], first['ZCHANGED_BY']], [1500.25, 'demo', 'demo'])
    ok(/^\d{8}$/.test(String(first['ZCREATED_DATE'])))
    const write = cloudCalls.findLast((c) => c.resource === 'limMan' && c.method === 'POST')!.body['data'] as Record<string, unknown>
    deepStrictEqual([write['zyear'], write['zcurr_pair'], write['zlimit_startdt'], write['zlimit_matdt']], ['2026', 'USD-INR', '20261001', '20261031'])
    ok(/^\d{4}-\d{2}-\d{2}$/.test(String(write['zcreated_date'])))
    ok(/^\d{2}:\d{2}:\d{2}$/.test(String(write['zchanged_time'])))
    ok(!('client' in write))

    const update = await put(path, { ZUNAPROV_AMT: 2000.5, ZLIM_ADDLIM: 'X', ZLIM_APP: '', ZCREATED_BY: 'spoof' })
    strictEqual(update.status, 200)
    const saved = await update.json() as Record<string, unknown>
    deepStrictEqual([saved['ZUNAPROV_AMT'], saved['ZLIM_ADDLIM'], saved['ZLIM_SET'], saved['ZCURR']], [2000.5, 'X', 'X', 'USD'])
    for (const stamp of ['ZCREATED_BY', 'ZCREATED_DATE', 'ZCREATED_TIME']) strictEqual(saved[stamp], first[stamp])
    const patch = cloudCalls.findLast((c) => c.resource === 'limMan' && c.method === 'PATCH')!.body
    deepStrictEqual(patch['key'], { zyear: '2026', zcurr_pair: 'USD-INR', zlimit_startdt: '20261001', zlimit_matdt: '20261031' })
    ok(!('zcreated_by' in (patch['changes'] as Record<string, unknown>)))

    strictEqual((await put(path.replace('/2026/', '/2027/'), { ZCURR: 'USD', ZUNAPROV_AMT: 30 })).status, 201)
    strictEqual(cloudRows.get('limMan')!.length, 2)
    const byYear = await (await call('tsf-limit?ZYEAR=2027')).json() as { value: Record<string, unknown>[] }
    deepStrictEqual(byYear.value.map((r) => r['ZUNAPROV_AMT']), [30])
    const byPair = await (await call('tsf-limit?ZCURR_PAIR=EUR-USD')).json() as { value: unknown[] }
    strictEqual(byPair.value.length, 0)
  })

  it('rejects malformed keys, client overrides and invalid amounts without a cloud write', async () => {
    const writes = () => cloudCalls.filter((c) => c.resource === 'limMan' && c.method !== 'GET').length
    const before = writes()
    for (const route of [path.replace('/2026/', '/26/'), path.replace('20261001', '2026-10-01'), path.replace('20261031', '20260901')]) {
      strictEqual((await put(route, { ZUNAPROV_AMT: 10 })).status, 400)
    }
    for (const body of [{ CLIENT: '200' }, { ZYEAR: '2027' }, { ZUNAPROV_AMT: 'bad' }]) {
      strictEqual((await put(path, body)).status, 400)
    }
    strictEqual(writes(), before)
  })

  it('returns middleware failures for every resource and limit writes', async () => {
    cloudFailure = 503
    try {
      for (const route of ['tsf-limit', 'tsf-currency-pair', 'tsf-field-name']) strictEqual((await call(route)).status, 503)
      strictEqual((await put(path, { ZUNAPROV_AMT: 40 })).status, 503)
    } finally {
      cloudFailure = 0
    }
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

  it('has not written the migrated tables in SQLite', () => {
    for (const table of ['zsgtsftr_trd_pos', 'zsgtsftr_trd_acc', 'zsgtsftr_dealdms', 'zsgtsftr_dms_typ', 'zsgtsftr_daylock', 'zsgtsftr_lim_man', 'zsgtrmtr_curpair', 'zsgtrmtr_fields']) {
      strictEqual(getDb().prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(), 0)
    }
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
