import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Service } from '../config.ts'
import { proxyRequest } from '../sap/proxy.ts'
import { handleSqlite } from '../sqlite/routes.ts'
import { requireSession } from './auth.ts'

const firstValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const

/**
 * The query string must be forwarded EXACTLY as the browser sent it. OData filters carry
 * percent-encoded quotes and spaces ($filter=ZdttkNo%20eq%20'123'), and a parse/re-serialise
 * round-trip through a query parser changes that encoding and makes SAP reject the call.
 * So it is sliced off the raw URL rather than rebuilt from req.query.
 */
function rawQuery(url: string): string {
  const index = url.indexOf('?')
  return index === -1 ? '' : url.slice(index + 1)
}

export async function apiRoutes(app: FastifyInstance, services: Map<string, Service>): Promise<void> {
  const known = [...services.keys()]

  // Non-secret view of the registry: what is reachable, of what kind. No URLs, no credentials.
  app.get('/api/_registry', async (req, reply) => {
    if (!requireSession(req, reply)) return
    return {
      services: known.map((key) => {
        const service = services.get(key)!
        return {
          key,
          kind: service.kind,
          description: service.description,
          available: service.unavailable === undefined,
          unavailable: service.unavailable,
        }
      }),
    }
  })

  for (const method of METHODS) {
    app.route({
      method,
      url: '/api/:service',
      handler: async (req, reply) => handle(req, reply, ''),
    })
    app.route({
      method,
      url: '/api/:service/*',
      handler: async (req, reply) => handle(req, reply, (req.params as Record<string, string>)['*'] ?? ''),
    })
  }

  async function handle(req: FastifyRequest, reply: FastifyReply, path: string): Promise<void> {
    const session = requireSession(req, reply)
    if (!session) return

    const key = (req.params as Record<string, string>)['service'] ?? ''
    if (key.startsWith('_')) return // reserved: handled by its own route above

    const service = services.get(key)
    if (!service) {
      reply.code(404).send({
        error: { message: { value: `Unknown service "${key}". Configured: ${known.join(', ')}.` } },
      })
      return
    }

    // 503, not 500: the gateway is working, this one backend is not configured. The message
    // names the environment variable so the fix is obvious without reading the source.
    if (service.unavailable) {
      reply.code(503).send({
        error: { message: { value: `Service "${key}" is not configured. ${service.unavailable}` } },
      })
      return
    }

    // Answered in-process: there is no backend to proxy to. Writes are stamped with the
    // signed-in user, which an SAP call cannot do (it runs as the technical user).
    if (service.store) {
      handleSqlite(service.store, key, req, reply, path, session.username)
      return
    }

    const body = Buffer.isBuffer(req.body) ? req.body : undefined
    const result = await proxyRequest(
      service,
      req.method,
      path,
      rawQuery(req.raw.url ?? ''),
      body,
      req.headers['content-type'],
      firstValue(req.headers['if-match']),
      firstValue(req.headers['accept']),
      firstValue(req.headers['prefer']),
    )

    reply.code(result.status)
    for (const [name, value] of Object.entries(result.headers)) reply.header(name, value)
    if (!result.headers['content-type']) reply.header('content-type', 'application/json')
    reply.send(result.body)
  }
}
