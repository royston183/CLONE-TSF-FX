import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getDb } from '../sqlite/db.ts'
import { dealMetadataRepository } from '../sqlite/repositories/deal-metadata.ts'
import { DdicInputError, ddicRepository } from '../sqlite/repositories/ddic-table.ts'
import { DEALDMS_CLIENT, DEALDMS_COLUMNS, DEALDMS_DATES, DEALDMS_TIMES } from '../sqlite/repositories/dealdms-columns.ts'
import { FX_POST_DOC_CLIENT, FX_POST_DOC_COLUMNS } from '../sqlite/repositories/fx-post-doc-columns.ts'
import { TRD_ACC_CLIENT, TRD_ACC_COLUMNS } from '../sqlite/repositories/trd-acc-columns.ts'
import { trdPosRepository } from '../sqlite/repositories/trd-pos.ts'
import type { DealMetadataFields } from '../sqlite/schema.ts'
import { requireSession } from './auth.ts'

/**
 * The local SQLite database, exposed as business-specific resources only. There is no route
 * that takes a table name or SQL: each resource is a repository with fixed, prepared
 * statements, so the browser can never reach the database itself.
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

export async function localdbRoutes(app: FastifyInstance): Promise<void> {
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
  const trdPos = () => trdPosRepository(getDb())
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
    guarded((req) => {
      const dealId = (req.query as { ZDEAL_ID?: unknown }).ZDEAL_ID
      if (dealId !== undefined && typeof dealId !== 'string') throw new BadRequest('ZDEAL_ID must be a single value.')
      return { value: trdPos().list(dealId || undefined) }
    }),
  )

  app.get(
    '/api/localdb/tsf-trade-position/:dealId/:seq',
    guarded((req, reply) => {
      const { dealId, seq } = trdKey(req)
      return trdPos().get(dealId, seq) ?? trdNotFound(reply)
    }),
  )

  // Create the row, or update just the fields sent. The created / changed stamps are the gateway's.
  app.put(
    '/api/localdb/tsf-trade-position/:dealId/:seq',
    guarded((req, reply) => {
      const user = requireSession(req, reply)?.username ?? ''
      const { dealId, seq } = trdKey(req)
      const body = jsonObject(req.body)
      const { date, time } = sapStamp()
      const existing = trdPos().get(dealId, seq)
      const stamps = {
        ...(existing ? {} : { ZCREATED_BY: user.slice(0, 12), ZCREATED_DATE: date, ZCREATED_TIME: time }),
        ZCHANGED_BY: user.slice(0, 12),
        ZCHANGED_DATE: date,
        ZCHANGED_TIME: time,
      }
      const row = trdPos().upsert(dealId, seq, { ...body, ...stamps })
      return reply.code(existing ? 200 : 201).send(row)
    }),
  )

  app.delete(
    '/api/localdb/tsf-trade-position/:dealId/:seq',
    guarded((req, reply) => {
      const { dealId, seq } = trdKey(req)
      return trdPos().remove(dealId, seq) ? reply.code(204).send() : trdNotFound(reply)
    }),
  )

  // ZSGTSFTR_TRD_ACC — Trade Invoice posting configuration, keyed by posting type (ZFI_TYPE). Read by the
  // Execute Settlement for Deal ID screen for each SET_TYP row's document type, reference and Dr / Cr line texts.
  const trdAcc = () => ddicRepository(getDb(), { table: 'zsgtsftr_trd_acc', client: TRD_ACC_CLIENT, columns: TRD_ACC_COLUMNS })
  const accKey = (req: FastifyRequest) => ({ ZFI_TYPE: requiredText((req.params as { fiType: string }).fiType, 'fiType') })

  app.get('/api/localdb/tsf-posting-type', guarded(() => ({ value: trdAcc().list() })))

  app.get(
    '/api/localdb/tsf-posting-type/:fiType',
    guarded((req, reply) => trdAcc().get(accKey(req)) ?? fail(reply, 404, 'No posting type with this code.')),
  )

  app.put(
    '/api/localdb/tsf-posting-type/:fiType',
    guarded((req, reply) => {
      const user = requireSession(req, reply)?.username ?? ''
      const key = accKey(req)
      const { date, time } = sapStamp()
      const existing = trdAcc().get(key)
      const stamps = {
        ...(existing ? {} : { ZCREATED_BY: user.slice(0, 12), ZCREATED_DATE: date, ZCREATED_TIME: time }),
        ZCHANGED_BY: user.slice(0, 12),
        ZCHANGED_DATE: date,
        ZCHANGED_TIME: time,
      }
      const row = trdAcc().upsert(key, { ...jsonObject(req.body), ...stamps })
      return reply.code(existing ? 200 : 201).send(row)
    }),
  )

  app.delete(
    '/api/localdb/tsf-posting-type/:fiType',
    guarded((req, reply) => (trdAcc().remove(accKey(req)) ? reply.code(204).send() : fail(reply, 404, 'No posting type with this code.'))),
  )

  // ZSGTSFTR_DEALDMS — the documents attached to a Deal ID, one slot per DMS category + type. The SLC middleware has
  // no resource for it, so the Deal ID Documents dialog uses this one. Dates and times travel as the middleware speaks
  // them (YYYY-MM-DD, HH:MM:SS) and are stored as SAP's DATS / TIMS (YYYYMMDD, HHMMSS).
  const dealDms = () => ddicRepository(getDb(), { table: 'zsgtsftr_dealdms', client: DEALDMS_CLIENT, columns: DEALDMS_COLUMNS })
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
    guarded((req) => {
      const q = req.query as Record<string, unknown>
      const filter: Record<string, string> = {}
      for (const name of ['ZDEAL_ID', 'ZDMS_CAT', 'ZDMS_TYPE'] as const) {
        const v = q[name]
        if (v === undefined || v === '') continue
        if (typeof v !== 'string') throw new BadRequest(`${name} must be a single value.`)
        filter[name] = v
      }
      const rows = dealDms().list(filter['ZDEAL_ID'] ? { column: 'ZDEAL_ID', value: filter['ZDEAL_ID'] } : undefined)
      return { value: rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)).map(dmsOut) }
    }),
  )

  app.get(
    '/api/localdb/tsf-deal-document/:dealId/:category/:type',
    guarded((req, reply) => {
      const row = dealDms().get(dmsKey(req))
      return row ? dmsOut(row) : dmsNotFound(reply)
    }),
  )

  // Create the slot, or update just the fields sent. The created / changed stamps are the gateway's.
  app.put(
    '/api/localdb/tsf-deal-document/:dealId/:category/:type',
    guarded((req, reply) => {
      const user = requireSession(req, reply)?.username ?? ''
      const key = dmsKey(req)
      const body = dmsIn(jsonObject(req.body))
      for (const stamp of ['ZCREATED_BY', 'ZCREATED_DATE', 'ZCREATED_TIME', 'ZCHANGED_BY', 'ZCHANGED_DATE', 'ZCHANGED_TIME']) delete body[stamp]
      const { date, time } = sapStamp()
      const existing = dealDms().get(key)
      const stamps = {
        ...(existing ? {} : { ZCREATED_BY: user.slice(0, 12), ZCREATED_DATE: date, ZCREATED_TIME: time }),
        ZCHANGED_BY: user.slice(0, 12),
        ZCHANGED_DATE: date,
        ZCHANGED_TIME: time,
      }
      const row = dealDms().upsert(key, { ...body, ...stamps })
      return reply.code(existing ? 200 : 201).send(dmsOut(row))
    }),
  )

  app.delete(
    '/api/localdb/tsf-deal-document/:dealId/:category/:type',
    guarded((req, reply) => (dealDms().remove(dmsKey(req)) ? reply.code(204).send() : dmsNotFound(reply))),
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
