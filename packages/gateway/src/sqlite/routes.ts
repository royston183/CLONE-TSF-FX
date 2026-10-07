import type { FastifyReply, FastifyRequest } from 'fastify'
import { ConflictError, parseListQuery, StoreInputError } from './store.ts'
import type { Fields, SqliteStore } from './store.ts'

/**
 * Answers /api/<key>/* for a `sqlite` service, in the same shapes an OData backend uses so
 * an app's client code does not change when its backend does:
 *
 *   GET    /api/<key>                       collections and their record counts
 *   GET    /api/<key>/<collection>          { value: [...] } — $filter, $orderby, $top, $skip
 *   POST   /api/<key>/<collection>          create; 201 with Location; id from body or a UUID
 *   GET    /api/<key>/<collection>/<id>     one record
 *   PUT    /api/<key>/<collection>/<id>     replace its fields
 *   PATCH  /api/<key>/<collection>/<id>     merge top-level fields
 *   DELETE /api/<key>/<collection>/<id>     204
 *
 * Errors use the {error:{message:{value}}} shape the client already extracts. 502 is never
 * returned: the database is in-process, so there is no "could not reach it".
 */
export function handleSqlite(
  store: SqliteStore,
  serviceKey: string,
  req: FastifyRequest,
  reply: FastifyReply,
  path: string,
  user: string,
): void {
  const fail = (status: number, message: string) => {
    reply.code(status).send({ error: { message: { value: message } } })
  }

  try {
    const segments = path.split('/').filter(Boolean).map(decodeURIComponent)
    if (segments.length > 2) return fail(404, `No route for /api/${serviceKey}/${path}.`)
    const [collection, id] = segments

    if (!collection) {
      if (req.method !== 'GET') return fail(405, `${req.method} is not allowed on /api/${serviceKey}.`)
      reply.send({ value: store.collections() })
      return
    }

    if (id === undefined) {
      if (req.method === 'GET') {
        const url = req.raw.url ?? ''
        const query = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '')
        reply.send({ value: store.list(collection, parseListQuery(query)) })
        return
      }
      if (req.method === 'POST') {
        const record = store.create(collection, readBody(req.body), user)
        reply
          .code(201)
          .header('location', `/api/${serviceKey}/${encodeURIComponent(collection)}/${encodeURIComponent(record.id)}`)
          .send(record)
        return
      }
      return fail(405, `${req.method} is not allowed on a collection. Use GET or POST.`)
    }

    const missing = () => fail(404, `No record "${id}" in "${collection}".`)
    switch (req.method) {
      case 'GET': {
        const record = store.get(collection, id)
        return record ? void reply.send(record) : missing()
      }
      case 'PUT':
      case 'PATCH': {
        const record = store.update(collection, id, readBody(req.body), user, req.method === 'PATCH')
        return record ? void reply.send(record) : missing()
      }
      case 'DELETE':
        return store.remove(collection, id) ? void reply.code(204).send() : missing()
      default:
        return fail(405, `${req.method} is not allowed on a record.`)
    }
  } catch (err) {
    if (err instanceof StoreInputError) return fail(400, err.message)
    if (err instanceof ConflictError) return fail(409, err.message)
    if (err instanceof URIError) return fail(400, 'The path is not valid percent-encoding.')
    throw err
  }
}

/** The gateway leaves bodies as raw Buffers for the proxy, so they are decoded here. */
function readBody(body: unknown): Fields {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : '')
  } catch {
    throw new StoreInputError('The request body must be a JSON object.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StoreInputError('The request body must be a JSON object.')
  }
  return parsed as Fields
}
