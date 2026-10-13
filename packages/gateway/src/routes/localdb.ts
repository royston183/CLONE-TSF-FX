import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getDb } from '../sqlite/db.ts'
import { dealMetadataRepository } from '../sqlite/repositories/deal-metadata.ts'
import { DdicInputError, ddicRepository } from '../sqlite/repositories/ddic-table.ts'
import { DMS_TYP_CLIENT, DMS_TYP_COLUMNS } from '../sqlite/repositories/dms-typ-columns.ts'
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

const LIMITS = { companyCode: 10, transactionId: 20, dealId: 15, seq: 2, fiType: 2, dmsCat: 2, dmsType: 3, productType: 10, strategy: 50, internalReference: 100, remark: 1000 }
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

  // ZSGTSFTR_DMS_TYP — DMS document types per category, keyed by ZDMS_CAT + ZDMS_TYPE. Read by the Deal ID
  // documents panel (category 10) for its slots, their descriptions and number range object / interval.
  const dmsTyp = () => ddicRepository(getDb(), { table: 'zsgtsftr_dms_typ', client: DMS_TYP_CLIENT, columns: DMS_TYP_COLUMNS })
  const dmsKey = (req: FastifyRequest) => {
    const p = req.params as { dmsCat: string; dmsType: string }
    return { ZDMS_CAT: requiredText(p.dmsCat, 'dmsCat'), ZDMS_TYPE: requiredText(p.dmsType, 'dmsType') }
  }
  const dmsNotFound = (reply: FastifyReply) => fail(reply, 404, 'No DMS document type with this category and type.')

  app.get(
    '/api/localdb/tsf-dms-type',
    guarded((req) => {
      const category = (req.query as { ZDMS_CAT?: unknown }).ZDMS_CAT
      if (category !== undefined && typeof category !== 'string') throw new BadRequest('ZDMS_CAT must be a single value.')
      return { value: dmsTyp().list(category ? { column: 'ZDMS_CAT', value: category } : undefined) }
    }),
  )

  app.get(
    '/api/localdb/tsf-dms-type/:dmsCat/:dmsType',
    guarded((req, reply) => dmsTyp().get(dmsKey(req)) ?? dmsNotFound(reply)),
  )

  app.put(
    '/api/localdb/tsf-dms-type/:dmsCat/:dmsType',
    guarded((req, reply) => {
      const user = requireSession(req, reply)?.username ?? ''
      const key = dmsKey(req)
      const { date, time } = sapStamp()
      const existing = dmsTyp().get(key)
      const stamps = {
        ...(existing ? {} : { ZCREATED_BY: user.slice(0, 12), ZCREATED_DATE: date, ZCREATED_TIME: time }),
        ZCHANGED_BY: user.slice(0, 12),
        ZCHANGED_DATE: date,
        ZCHANGED_TIME: time,
      }
      const row = dmsTyp().upsert(key, { ...jsonObject(req.body), ...stamps })
      return reply.code(existing ? 200 : 201).send(row)
    }),
  )

  app.delete(
    '/api/localdb/tsf-dms-type/:dmsCat/:dmsType',
    guarded((req, reply) => (dmsTyp().remove(dmsKey(req)) ? reply.code(204).send() : dmsNotFound(reply))),
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
