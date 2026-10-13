import { existsSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { loadServices, REPO_ROOT } from './config.ts'
import { apiRoutes } from './routes/api.ts'
import { authRoutes, requireSession } from './routes/auth.ts'
import { localdbRoutes } from './routes/localdb.ts'

const PORT = Number(process.env['PORT'] ?? 8080)
const HOST = process.env['HOST'] ?? '127.0.0.1'
const DIST = resolve(REPO_ROOT, 'apps/web/dist')

export async function build() {
  // Loaded before the server binds: a bad registry must fail at startup, not on a user's
  // first click. SLC_SERVICES_CONFIG points the registry elsewhere, which is how tests and
  // local mocks run the real gateway against substitute backends without editing config/.
  const configPath = process.env['SLC_SERVICES_CONFIG']
  const services = configPath ? loadServices(configPath) : loadServices()

  // Built conditionally rather than with `transport: undefined`: under
  // exactOptionalPropertyTypes an explicit undefined is not the same as an absent key,
  // and Fastify's logger option rejects it.
  // bodyLimit: a DMS upload travels as base64 JSON, up to 20 MB of file (shared/fx/dms.ts MAX_BYTES) = ~27 MB; Fastify's 1 MiB default would refuse it.
  const app = Fastify({
    bodyLimit: 32 * 1024 * 1024,
    logger: process.stdout.isTTY ? { transport: { target: 'pino-pretty' } } : true,
  })

  await app.register(cookie, {
    // No fallback constant: an unset AUTH_SECRET yields a fresh random one, which invalidates
    // sessions across restarts. That is the correct dev behaviour, and it means a shipped
    // default secret can never be the thing protecting a deployment.
    secret: process.env['AUTH_SECRET'] ?? randomBytes(32).toString('hex'),
  })

  // The proxy must forward request bodies byte-for-byte, so nothing is parsed into an object.
  //
  // removeAllContentTypeParsers() first is essential: Fastify ships built-in parsers for
  // application/json and text/plain, and a '*' catch-all does NOT override them — it only
  // covers types nothing else claims. Without this line every JSON write arrived as a parsed
  // object, Buffer.isBuffer() was false in the proxy route, and the body was dropped, so SAP
  // received a POST with no fields at all.
  app.removeAllContentTypeParsers()
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

  // Close SQLite files on shutdown so the WAL is checkpointed and, on Windows, the file
  // lock is released for the next run or a test's temp-directory cleanup.
  app.addHook('onClose', async () => {
    for (const service of services.values()) service.store?.close()
  })

  await authRoutes(app)
  await localdbRoutes(app)
  await apiRoutes(app, services)

  // Startup must say plainly which backends are usable. A service silently doing nothing
  // is the failure mode this whole registry exists to avoid.
  for (const service of services.values()) {
    if (service.unavailable) {
      app.log.warn(`service "${service.key}" is UNAVAILABLE — ${service.unavailable}`)
    }
  }

  app.get('/health', async () => ({
    status: 'ok',
    services: [...services.values()].map((service) => ({
      key: service.key,
      kind: service.kind,
      available: service.unavailable === undefined,
    })),
    uptime: Math.round(process.uptime()),
  }))

  // Menu and app registries, served rather than bundled so a tile can be added or an app's
  // status flipped without rebuilding the frontend.
  for (const name of ['menu', 'fx-menu', 'reporting-menu', 'apps'] as const) {
    app.get(`/config/${name}.json`, async (req, reply) => {
      if (!requireSession(req, reply)) return
      return JSON.parse(readFileSync(resolve(REPO_ROOT, `config/${name}.json`), 'utf8'))
    })
  }

  if (existsSync(DIST)) {
    await app.register(fastifyStatic, { root: DIST })
    // SPA fallback: any non-API path renders the shell and React routes it.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/auth/') || req.url.startsWith('/config/')) {
        return reply.code(404).send({ error: { message: { value: `No route for ${req.url}` } } })
      }
      return reply.sendFile('index.html')
    })
  } else {
    app.log.warn(`No build at ${DIST} — run "npm run build". In development, use Vite on :5173.`)
  }

  return app
}

// True only when this file is the process entrypoint, so importing build() in a test does
// not start a listening server. pathToFileURL normalises the Windows path separators and
// drive letter that a raw string compare against argv[1] gets wrong.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const app = await build()
  try {
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`SLC gateway on http://${HOST}:${PORT} — replaces the 8765-8775 proxy.py fleet`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
