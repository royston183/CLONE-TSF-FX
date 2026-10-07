import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getDb } from '../sqlite/db.ts'
import { dealMetadataRepository } from '../sqlite/repositories/deal-metadata.ts'
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

const LIMITS = { companyCode: 10, transactionId: 20, productType: 10, strategy: 50, internalReference: 100, remark: 1000 }
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
  if (err instanceof BadRequest) return fail(reply, 400, err.message)

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
