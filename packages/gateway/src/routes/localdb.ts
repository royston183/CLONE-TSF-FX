import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Service } from '../config.ts'
import { cloudTable, CloudTableError } from '../cloud/table.ts'
import { getDb } from '../sqlite/db.ts'
import { dealMetadataRepository } from '../sqlite/repositories/deal-metadata.ts'
import { DdicInputError, ddicRepository } from '../sqlite/repositories/ddic-table.ts'
import { DAYLOCK_BLOTTER, DAYLOCK_COLUMNS, DAYLOCK_CO_AREA } from '../sqlite/repositories/daylock-columns.ts'
import { DMS_TYP_COLUMNS } from '../sqlite/repositories/dms-typ-columns.ts'
import { DEALDMS_COLUMNS, DEALDMS_DATES, DEALDMS_TIMES } from '../sqlite/repositories/dealdms-columns.ts'
import { FX_POST_DOC_CLIENT, FX_POST_DOC_COLUMNS } from '../sqlite/repositories/fx-post-doc-columns.ts'
import { TRD_ACC_COLUMNS } from '../sqlite/repositories/trd-acc-columns.ts'
import { TRD_POS_COLUMNS } from '../sqlite/repositories/trd-pos-columns.ts'
import type { DealMetadataFields } from '../sqlite/schema.ts'
import { requireSession } from './auth.ts'

/**
 * Business-specific persistence routes. TRD_POS, TRD_ACC, DEALDMS, DMS_TYP and DAYLOCK use cloud middleware;
 * their /api/localdb paths remain compatible with existing clients. Other resources use SQLite.
 * No route accepts a table name or SQL. Resource names and allowed fields are fixed here;
 * SQLite repositories use prepared statements.
 *
 * These routes sit beside the generic /api/:service/* proxy and win over it because Fastify
 * prefers the more specific path. The global raw-buffer content-type parser is untouched;
 * bodies are decoded here, for these routes only.
 */

const LIMITS = { companyCode: 10, transactionId: 20, fxCompanyCode: 4, fxTransaction: 13, dealId: 15, seq: 2, fiType: 2, dmsCategory: 2, dmsType: 3, productType: 10, strategy: 50, internalReference: 100, remark: 1000 }
const EDITABLE = ['productType', 'strategy', 'internalReference', 'remark'] as const

class BadRequest extends Error {}

type Params = { companyCode: string; transactionId: string }

function fail(reply: FastifyReply, status: number, message: string): FastifyReply {
  return reply.code(status).send({ error: { message: { value: message } } })
}

/** The body as a JSON object. Unlike auth's readJson, bad input is an error, never "empty". */
function jsonObject(body: unknown): Record<string, unknown> {
  let value: unknown = body
  if (Buffer.isBuffer(body)) {
    try {
      value = JSON.parse(body.toString('utf8'))
    } catch {
      throw new BadRequest('The request body is not valid JSON.')
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequest('The request body must be a JSON object.')
  }
  return value as Record<string, unknown>
}

function requiredText(value: unknown, name: keyof typeof LIMITS): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequest(`${name} is required.`)
  const text = value.trim()
  if (text.length > LIMITS[name]) throw new BadRequest(`${name} must be at most ${LIMITS[name]} characters.`)
  return text
}

/** null (or blank) clears the field; anything else must be a string within its limit. */
function optionalText(value: unknown, name: keyof typeof LIMITS): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw new BadRequest(`${name} must be a string or null.`)
  const text = value.trim()
  if (text.length > LIMITS[name]) throw new BadRequest(`${name} must be at most ${LIMITS[name]} characters.`)
  return text || null
}

function editableFields(body: Record<string, unknown>, allowed: readonly string[]): DealMetadataFields {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key))
  if (unknown.length) throw new BadRequest(`Unknown field(s): ${unknown.join(', ')}.`)
  const fields: DealMetadataFields = {}
  for (const name of EDITABLE) {
    if (body[name] !== undefined) fields[name] = optionalText(body[name], name)
  }
  return fields
}

function keyOf(req: FastifyRequest): Params {
  const params = req.params as Params
  return {
    companyCode: requiredText(params.companyCode, 'companyCode'),
    transactionId: requiredText(params.transactionId, 'transactionId'),
  }
}

/**
 * Maps a failure to a status the caller can act on. Anything unexpected is a generic 500:
 * the SQLite message, SQL text and file paths go to the server log, never to the browser.
 */
function dbFailure(req: FastifyRequest, reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof CloudTableError) return fail(reply, err.status, err.message)
  if (err instanceof BadRequest || err instanceof DdicInputError) return fail(reply, 400, err.message)

  const code = (err as { code?: string } | null)?.code ?? ''
  if (code.startsWith('SQLITE_CONSTRAINT')) {
    return fail(reply, 409, 'A record with this company code and transaction already exists.')
  }
  req.log.error(err, 'localdb request failed')
  if (err instanceof Error && /no such table/i.test(err.message)) {
    return fail(reply, 503, 'The local database is not initialised. Run "npm run db:setup".')
  }
  return fail(reply, 500, 'The local database request failed.')
}

export async function localdbRoutes(app: FastifyInstance, services: Map<string, Service>): Promise<void> {
  /** Session check + error mapping around a handler, so each route stays a few lines. */
  const guarded =
    (handler: (req: FastifyRequest, reply: FastifyReply) => unknown) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!requireSession(req, reply)) return reply
      try {
        return await handler(req, reply)
      } catch (err) {
        return dbFailure(req, reply, err)
      }
    }

  const repo = () => dealMetadataRepository(getDb())
  const notFound = (reply: FastifyReply) => fail(reply, 404, 'No metadata for this company code and transaction.')

  // `value` wrapper matches the OData collection shape, so the client's list() works on it.
  app.get('/api/localdb/deal-metadata', guarded(() => ({ value: repo().listDealMetadata() })))

  app.get(
    '/api/localdb/deal-metadata/:companyCode/:transactionId',
    guarded((req, reply) => {
      const { companyCode, transactionId } = keyOf(req)
      return repo().getDealMetadata(companyCode, transactionId) ?? notFound(reply)
    }),
  )

  app.post(
    '/api/localdb/deal-metadata',
    guarded((req, reply) => {
      const body = jsonObject(req.body)
      const fields = editableFields(body, ['companyCode', 'transactionId', ...EDITABLE])
      const input = {
        ...fields,
        companyCode: requiredText(body['companyCode'], 'companyCode'),
        transactionId: requiredText(body['transactionId'], 'transactionId'),
      }
      const created = repo().createDealMetadata(input)
      return reply
        .code(201)
        .header('location', `/api/localdb/deal-metadata/${encodeURIComponent(created.companyCode)}/${encodeURIComponent(created.transactionId)}`)
        .send(created)
    }),
  )

  app.patch(
    '/api/localdb/deal-metadata/:companyCode/:transactionId',
    guarded((req, reply) => {
      const { companyCode, transactionId } = keyOf(req)
      const fields = editableFields(jsonObject(req.body), EDITABLE)
      return repo().updateDealMetadata(companyCode, transactionId, fields) ?? notFound(reply)
    }),
  )

  app.delete(
    '/api/localdb/deal-metadata/:companyCode/:transactionId',
    guarded((req, reply) => {
      const { companyCode, transactionId } = keyOf(req)
      return repo().deleteDealMetadata(companyCode, transactionId) ? reply.code(204).send() : notFound(reply)
    }),
  )

  // ZSGTSFTR_TRD_POS — Trade Invoice Posting Details, the source of the Execute Settlement for Deal ID
  // screen's settled / posted flags and invoice legs. Rows use SAP's field names (ZDEAL_ID, ZSEQ, ...).
  const positions = cloudTable(services.get('middleware'), 'trdPos', TRD_POS_COLUMNS)
  const positionKey = (dealId: string, seq: string) => ({ ZDEAL_ID: dealId, ZSEQ: seq })
  const trdPos = () => ({
    list: (dealId?: string) => positions.list(dealId ? { column: 'ZDEAL_ID', value: dealId } : undefined),
    get: (dealId: string, seq: string) => positions.get(positionKey(dealId, seq)),
    remove: (dealId: string, seq: string) => positions.remove(positionKey(dealId, seq)),
  })
  const trdKey = (req: FastifyRequest) => {
    const p = req.params as { dealId: string; seq: string }
    return { dealId: requiredText(p.dealId, 'dealId'), seq: requiredText(p.seq, 'seq') }
  }
  const trdNotFound = (reply: FastifyReply) => fail(reply, 404, 'No trade position for this Deal ID and sequence.')
  const sapStamp = () => {
    const now = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return {
      date: `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`,
      time: `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`,
    }
  }

  app.get(
    '/api/localdb/tsf-trade-position',
    guarded(async (req) => {
      const dealId = (req.query as { ZDEAL_ID?: unknown }).ZDEAL_ID
      if (dealId !== undefined && typeof dealId !== 'string') throw new BadRequest('ZDEAL_ID must be a single value.')
      return { value: await trdPos().list(dealId || undefined) }
    }),
  )

  app.get(
    '/api/localdb/tsf-trade-position/:dealId/:seq',
    guarded(async (req, reply) => {
      const { dealId, seq } = trdKey(req)
      return (await trdPos().get(dealId, seq)) ?? trdNotFound(reply)
    }),
  )

  // Create the row, or update just the fields sent. The created / changed stamps are the gateway's.
  app.put(
    '/api/localdb/tsf-trade-position/:dealId/:seq',
    guarded(async (req, reply) => {
      const user = requireSession(req, reply)?.username ?? ''
      const { dealId, seq } = trdKey(req)
      const body = jsonObject(req.body)
      for (const stamp of ['ZCREATED_BY', 'ZCREATED_DATE', 'ZCREATED_TIME', 'ZCHANGED_BY', 'ZCHANGED_DATE', 'ZCHANGED_TIME']) delete body[stamp]
      const { date, time } = sapStamp()
      const existing = await trdPos().get(dealId, seq)
      const stamps = {
        ...(existing ? {} : { ZCREATED_BY: user.slice(0, 12), ZCREATED_DATE: date, ZCREATED_TIME: time }),
        ZCHANGED_BY: user.slice(0, 12),
        ZCHANGED_DATE: date,
        ZCHANGED_TIME: time,
      }
      const row = await positions.upsert(positionKey(dealId, seq), { ...body, ...stamps }, existing)
      return reply.code(existing ? 200 : 201).send(row)
    }),
  )

  app.delete(
    '/api/localdb/tsf-trade-position/:dealId/:seq',
    guarded(async (req, reply) => {
      const { dealId, seq } = trdKey(req)
      return (await trdPos().remove(dealId, seq)) ? reply.code(204).send() : trdNotFound(reply)
    }),
  )

  // ZSGTSFTR_TRD_ACC — Trade Invoice posting configuration, keyed by posting type (ZFI_TYPE). Read by the
  // Execute Settlement for Deal ID screen for each SET_TYP row's document type, reference and Dr / Cr line texts.
  const trdAcc = () => cloudTable(services.get('middleware'), 'tsfTrdAcc', TRD_ACC_COLUMNS)
  const accKey = (req: FastifyRequest) => ({ ZFI_TYPE: requiredText((req.params as { fiType: string }).fiType, 'fiType') })

  app.get('/api/localdb/tsf-posting-type', guarded(async () => ({ value: await trdAcc().list() })))

  app.get(
    '/api/localdb/tsf-posting-type/:fiType',
    guarded(async (req, reply) => (await trdAcc().get(accKey(req))) ?? fail(reply, 404, 'No posting type with this code.')),
  )

  app.put(
    '/api/localdb/tsf-posting-type/:fiType',
    guarded(async (req, reply) => {
      const user = requireSession(req, reply)?.username ?? ''
      const key = accKey(req)
      const body = jsonObject(req.body)
      for (const stamp of ['ZCREATED_BY', 'ZCREATED_DATE', 'ZCREATED_TIME', 'ZCHANGED_BY', 'ZCHANGED_DATE', 'ZCHANGED_TIME']) delete body[stamp]
      const { date, time } = sapStamp()
      const existing = await trdAcc().get(key)
      const stamps = {
        ...(existing ? {} : { ZCREATED_BY: user.slice(0, 12), ZCREATED_DATE: date, ZCREATED_TIME: time }),
        ZCHANGED_BY: user.slice(0, 12),
        ZCHANGED_DATE: date,
        ZCHANGED_TIME: time,
      }
      const row = await trdAcc().upsert(key, { ...body, ...stamps }, existing)
      return reply.code(existing ? 200 : 201).send(row)
    }),
  )

  app.delete(
    '/api/localdb/tsf-posting-type/:fiType',
    guarded(async (req, reply) => ((await trdAcc().remove(accKey(req))) ? reply.code(204).send() : fail(reply, 404, 'No posting type with this code.'))),
  )

  // ZSGTSFTR_DEALDMS — cloud resource tsfDealdms, one slot per Deal ID + DMS category + type.
  // The adapter preserves this endpoint's ISO dates and times while handling lowercase cloud columns.
  const dealDms = () => cloudTable(services.get('middleware'), 'tsfDealdms', DEALDMS_COLUMNS)
  const dmsKey = (req: FastifyRequest) => {
    const p = req.params as { dealId: string; category: string; type: string }
    return { ZDEAL_ID: requiredText(p.dealId, 'dealId'), ZDMS_CAT: requiredText(p.category, 'dmsCategory'), ZDMS_TYPE: requiredText(p.type, 'dmsType') }
  }
  const dmsNotFound = (reply: FastifyReply) => fail(reply, 404, 'No document for this Deal ID, category and type.')
  const toSapDate = (v: unknown, name: string): unknown => {
    if (typeof v !== 'string' || !v) return v
    if (/^\d{8}$/.test(v)) return v
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequest(`${name} must be a date as YYYY-MM-DD.`)
    return v.replace(/-/g, '')
  }
  const toSapTime = (v: unknown, name: string): unknown => {
    if (typeof v !== 'string' || !v) return v
    if (/^\d{6}$/.test(v)) return v
    if (!/^\d{2}:\d{2}:\d{2}$/.test(v)) throw new BadRequest(`${name} must be a time as HH:MM:SS.`)
    return v.replace(/:/g, '')
  }
  const dmsIn = (body: Record<string, unknown>): Record<string, unknown> => {
    const out = { ...body }
    for (const c of DEALDMS_DATES) if (c in out) out[c] = toSapDate(out[c], c)
    for (const c of DEALDMS_TIMES) if (c in out) out[c] = toSapTime(out[c], c)
    return out
  }
  const dmsOut = (row: Record<string, string | number>): Record<string, string | number | null> => {
    const out: Record<string, string | number | null> = { ...row }
    for (const c of DEALDMS_DATES) {
      const v = String(row[c] ?? '')
      out[c] = /^\d{8}$/.test(v) && v !== '00000000' ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null
    }
    for (const c of DEALDMS_TIMES) {
      const v = String(row[c] ?? '')
      out[c] = /^\d{6}$/.test(v) ? `${v.slice(0, 2)}:${v.slice(2, 4)}:${v.slice(4, 6)}` : null
    }
    return out
  }

  app.get(
    '/api/localdb/tsf-deal-document',
    guarded(async (req) => {
      const q = req.query as Record<string, unknown>
      const filter: Record<string, string> = {}
      for (const name of ['ZDEAL_ID', 'ZDMS_CAT', 'ZDMS_TYPE'] as const) {
        const v = q[name]
        if (v === undefined || v === '') continue
        if (typeof v !== 'string') throw new BadRequest(`${name} must be a single value.`)
        filter[name] = v
      }
      const rows = await dealDms().list(filter['ZDEAL_ID'] ? { column: 'ZDEAL_ID', value: filter['ZDEAL_ID'] } : undefined)
      return { value: rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)).map(dmsOut) }
    }),
  )

  app.get(
    '/api/localdb/tsf-deal-document/:dealId/:category/:type',
    guarded(async (req, reply) => {
      const row = await dealDms().get(dmsKey(req))
      return row ? dmsOut(row) : dmsNotFound(reply)
    }),
  )

  // Create the slot, or update just the fields sent. The created / changed stamps are the gateway's.
  app.put(
    '/api/localdb/tsf-deal-document/:dealId/:category/:type',
    guarded(async (req, reply) => {
      const user = requireSession(req, reply)?.username ?? ''
      const key = dmsKey(req)
      const body = dmsIn(jsonObject(req.body))
      for (const stamp of ['ZCREATED_BY', 'ZCREATED_DATE', 'ZCREATED_TIME', 'ZCHANGED_BY', 'ZCHANGED_DATE', 'ZCHANGED_TIME']) delete body[stamp]
      const { date, time } = sapStamp()
      const existing = await dealDms().get(key)
      const stamps = {
        ...(existing ? {} : { ZCREATED_BY: user.slice(0, 12), ZCREATED_DATE: date, ZCREATED_TIME: time }),
        ZCHANGED_BY: user.slice(0, 12),
        ZCHANGED_DATE: date,
        ZCHANGED_TIME: time,
      }
      const row = await dealDms().upsert(key, { ...body, ...stamps }, existing)
      return reply.code(existing ? 200 : 201).send(dmsOut(row))
    }),
  )

  app.delete(
    '/api/localdb/tsf-deal-document/:dealId/:category/:type',
    guarded(async (req, reply) => ((await dealDms().remove(dmsKey(req))) ? reply.code(204).send() : dmsNotFound(reply))),
  )

  // TSF_FX_POST_DOC — the FI documents PostFlows returned for an FX deal leg (BKPF has no middleware resource), so BO's
  // FI Doc 1 / 2 survive a reload. Written once per posting; the created / changed stamps are the gateway's.
  const fxPostDoc = () => ddicRepository(getDb(), { table: 'tsf_fx_post_doc', client: FX_POST_DOC_CLIENT, columns: FX_POST_DOC_COLUMNS })
  const fxDocKey = (req: FastifyRequest) => {
    const p = req.params as { companyCode: string; transaction: string }
    return { ZBUKRS: requiredText(p.companyCode, 'fxCompanyCode'), ZRFHA: requiredText(p.transaction, 'fxTransaction') }
  }
  const fxDocNotFound = (reply: FastifyReply) => fail(reply, 404, 'No FI documents are stored for this company code and transaction.')

  app.get(
    '/api/localdb/tsf-fx-post-doc/:companyCode/:transaction',
    guarded((req, reply) => fxPostDoc().get(fxDocKey(req)) ?? fxDocNotFound(reply)),
  )

  app.put(
    '/api/localdb/tsf-fx-post-doc/:companyCode/:transaction',
    guarded((req, reply) => {
      const user = requireSession(req, reply)?.username ?? ''
      const key = fxDocKey(req)
      const body = jsonObject(req.body)
      for (const stamp of ['ZCREATED_BY', 'ZCREATED_DATE', 'ZCREATED_TIME', 'ZCHANGED_BY', 'ZCHANGED_DATE', 'ZCHANGED_TIME']) delete body[stamp]
      const { date, time } = sapStamp()
      const existing = fxPostDoc().get(key)
      const stamps = {
        ...(existing ? {} : { ZCREATED_BY: user.slice(0, 12), ZCREATED_DATE: date, ZCREATED_TIME: time }),
        ZCHANGED_BY: user.slice(0, 12),
        ZCHANGED_DATE: date,
        ZCHANGED_TIME: time,
      }
      const row = fxPostDoc().upsert(key, { ...body, ...stamps })
      return reply.code(existing ? 200 : 201).send(row)
    }),
  )

  // ZSGTSFTR_DMS_TYP — DMS document types per category, keyed by ZDMS_CAT + ZDMS_TYPE. Read by the Deal ID
  // documents panel (category 10) for its slots, their descriptions and number range object / interval.
  const dmsTyp = () => cloudTable(services.get('middleware'), 'dmsType', DMS_TYP_COLUMNS, 'upper')
  const dmsTypKey = (req: FastifyRequest) => {
    const p = req.params as { dmsCat: string; dmsType: string }
    return { ZDMS_CAT: requiredText(p.dmsCat, 'dmsCategory'), ZDMS_TYPE: requiredText(p.dmsType, 'dmsType') }
  }
  const dmsTypNotFound = (reply: FastifyReply) => fail(reply, 404, 'No DMS document type with this category and type.')

  app.get(
    '/api/localdb/tsf-dms-type',
    guarded(async (req) => {
      const category = (req.query as { ZDMS_CAT?: unknown }).ZDMS_CAT
      if (category !== undefined && typeof category !== 'string') throw new BadRequest('ZDMS_CAT must be a single value.')
      return { value: await dmsTyp().list(category ? { column: 'ZDMS_CAT', value: category } : undefined) }
    }),
  )

  app.get(
    '/api/localdb/tsf-dms-type/:dmsCat/:dmsType',
    guarded(async (req, reply) => (await dmsTyp().get(dmsTypKey(req))) ?? dmsTypNotFound(reply)),
  )

  app.put(
    '/api/localdb/tsf-dms-type/:dmsCat/:dmsType',
    guarded(async (req, reply) => {
      const user = requireSession(req, reply)?.username ?? ''
      const key = dmsTypKey(req)
      const body = jsonObject(req.body)
      for (const stamp of ['ZCREATED_BY', 'ZCREATED_DATE', 'ZCREATED_TIME', 'ZCHANGED_BY', 'ZCHANGED_DATE', 'ZCHANGED_TIME']) delete body[stamp]
      const { date, time } = sapStamp()
      const existing = await dmsTyp().get(key)
      const stamps = {
        ...(existing ? {} : { ZCREATED_BY: user.slice(0, 12), ZCREATED_DATE: date, ZCREATED_TIME: time }),
        ZCHANGED_BY: user.slice(0, 12),
        ZCHANGED_DATE: date,
        ZCHANGED_TIME: time,
      }
      const row = await dmsTyp().upsert(key, { ...body, ...stamps }, existing)
      return reply.code(existing ? 200 : 201).send(row)
    }),
  )

  app.delete(
    '/api/localdb/tsf-dms-type/:dmsCat/:dmsType',
    guarded(async (req, reply) => ((await dmsTyp().remove(dmsTypKey(req))) ? reply.code(204).send() : dmsTypNotFound(reply))),
  )

  // ZSGTSFTR_DAYLOCK — TRM Day Wise Locking: one row per blotter date + group + trader code once that day's FX Deal Blotter
  // (ZB_TYPE DE6) is locked. The date is YYYYMMDD in the path; ZB_TYPE, ZCO_AREA (OL10), ZYEAR and ZMONTH are the program's own
  // constants / derived from the date, so a caller names only the day, the group and the trader.
  const dayLock = () => cloudTable(services.get('middleware'), 'daylock', DAYLOCK_COLUMNS, 'upper')
  const dayLockKey = (req: FastifyRequest) => {
    const p = req.params as { date: string; group: string; trader: string }
    const date = String(p.date ?? '')
    const y = Number(date.slice(0, 4))
    const m = Number(date.slice(4, 6))
    const d = Number(date.slice(6, 8))
    const real = /^[0-9]{8}$/.test(date) && new Date(y, m - 1, d).getMonth() === m - 1 && new Date(y, m - 1, d).getDate() === d
    if (!real) throw new BadRequest('date must be a real date as YYYYMMDD.')
    const group = String(p.group ?? '').trim()
    const trader = String(p.trader ?? '').trim()
    if (!group || group.length > 3) throw new BadRequest('group is required, at most 3 characters.')
    if (!trader || trader.length > 10) throw new BadRequest('trader is required, at most 10 characters.')
    return {
      ZB_TYPE: DAYLOCK_BLOTTER,
      ZCO_AREA: DAYLOCK_CO_AREA,
      ZGRP: group,
      ZMONTH: String(m),
      ZPDATE: date,
      ZTYPE: trader,
      ZYEAR: date.slice(0, 4),
    }
  }
  const dayLockNotFound = (reply: FastifyReply) => fail(reply, 404, 'This blotter day is not locked.')
  const findDayLock = async (key: ReturnType<typeof dayLockKey>) => {
    const row = await dayLock().get(key)
    if (row || key.ZMONTH.length === 2) return row
    // Cloud SAP rows use months 1..9; retain access to older local copies stored as 01..09.
    return dayLock().get({ ...key, ZMONTH: key.ZMONTH.padStart(2, '0') })
  }

  app.get(
    '/api/localdb/tsf-day-lock',
    guarded(async (req) => {
      const trader = (req.query as { ZTYPE?: unknown }).ZTYPE
      if (trader !== undefined && typeof trader !== 'string') throw new BadRequest('ZTYPE must be a single value.')
      return { value: await dayLock().list(trader ? { column: 'ZTYPE', value: trader } : undefined) }
    }),
  )

  app.get(
    '/api/localdb/tsf-day-lock/:date/:group/:trader',
    guarded(async (req, reply) => (await findDayLock(dayLockKey(req))) ?? dayLockNotFound(reply)),
  )

  // Locking is the only write: ZLOCKED = 'X', as the program's MODIFY does. Locking an already locked day is a no-op update.
  app.put(
    '/api/localdb/tsf-day-lock/:date/:group/:trader',
    guarded(async (req, reply) => {
      const user = requireSession(req, reply)?.username ?? ''
      const key = dayLockKey(req)
      const { date, time } = sapStamp()
      const existing = await findDayLock(key)
      if (existing) key.ZMONTH = String(existing['ZMONTH'])
      const stamps = {
        ...(existing ? {} : { ZCREATED_BY: user.slice(0, 12), ZCREATED_DATE: date, ZCREATED_TIME: time }),
        ZCHANGED_BY: user.slice(0, 12),
        ZCHANGED_DATE: date,
        ZCHANGED_TIME: time,
      }
      const row = await dayLock().upsert(key, { ZLOCKED: 'X', ...stamps }, existing)
      return reply.code(existing ? 200 : 201).send(row)
    }),
  )

  app.delete(
    '/api/localdb/tsf-day-lock/:date/:group/:trader',
    guarded(async (req, reply) => {
      const key = dayLockKey(req)
      const existing = await findDayLock(key)
      if (!existing) return dayLockNotFound(reply)
      key.ZMONTH = String(existing['ZMONTH'])
      return (await dayLock().remove(key)) ? reply.code(204).send() : dayLockNotFound(reply)
    }),
  )

  // Anything else under /api/localdb is a 404 in this group's own words, rather than falling
  // through to the generic proxy's misleading 'Unknown service "localdb"'.
  for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const) {
    for (const url of ['/api/localdb', '/api/localdb/*']) {
      app.route({
        method,
        url,
        handler: guarded((req, reply) => fail(reply, 404, `No local database route for ${req.url.split('?')[0]}.`)),
      })
    }
  }
}
