import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Agent } from 'undici'
import { SqliteStore } from './sqlite/store.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '../../..')

export type ServiceKind = 'odata' | 'dyngw' | 'rest' | 'sqlite'

type RawAuth = {
  kind: 'basic' | 'bearer'
  systemId?: string
  user?: string
  passwordEnv?: string
  tokenEnv?: string
}

type RawService = {
  kind: ServiceKind
  base?: string
  /** sqlite only: the database file, relative to the repo root, or ":memory:". */
  file?: string
  auth?: string
  client?: string
  tlsVerify?: boolean
  description?: string
}

/**
 * A backend resolved for use: credentials read from the environment, and its own
 * dispatcher so a service that must skip TLS verification cannot leak that
 * setting to any other service (proxy.py applied one global SSL context).
 */
export type Service = {
  key: string
  kind: ServiceKind
  base: string
  client: string | undefined
  authHeader: string | undefined
  agent: Agent
  description: string | undefined
  /** The open database of a `sqlite` service; undefined for every HTTP backend. */
  store: SqliteStore | undefined
  /** Set when the service cannot be called; the reason is returned to the caller verbatim. */
  unavailable: string | undefined
}

const KINDS = new Set<ServiceKind>(['odata', 'dyngw', 'rest', 'sqlite'])

class MissingSecretError extends Error {}

/**
 * A malformed auth block throws a plain Error: that is a mistake in the repo and must be
 * fixed. A missing *secret* throws MissingSecretError, which the caller downgrades to
 * "this one service is unavailable" — so a developer without the SAP password can still
 * run sign-in, the launcher, and any app that does not need that backend.
 */
function buildAuthHeader(name: string, auth: RawAuth): string {
  if (auth.kind === 'basic') {
    if (!auth.user || !auth.passwordEnv) {
      throw new Error(`auth "${name}": kind "basic" needs both "user" and "passwordEnv".`)
    }
    const password = process.env[auth.passwordEnv]
    if (!password) {
      throw new MissingSecretError(
        `Environment variable ${auth.passwordEnv} is not set. Copy .env.example to .env and ` +
          `fill it in; the password is never stored in config/.`,
      )
    }
    return 'Basic ' + Buffer.from(`${auth.user}:${password}`).toString('base64')
  }
  if (!auth.tokenEnv) throw new Error(`auth "${name}": kind "bearer" needs "tokenEnv".`)
  const token = process.env[auth.tokenEnv]
  if (!token) throw new MissingSecretError(`Environment variable ${auth.tokenEnv} is not set.`)
  return `Bearer ${token}`
}

/**
 * Reads config/services.json. Anything malformed throws here, at startup: a typo in the
 * registry must not surface later as a confusing 404 on a user's first click. A service
 * whose secret is absent is kept but marked unavailable, so one missing password disables
 * one backend rather than the whole gateway.
 */
export function loadServices(configPath = resolve(REPO_ROOT, 'config/services.json')): Map<string, Service> {
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as {
    auth?: Record<string, RawAuth>
    services?: Record<string, RawService>
  }
  const authDefs = raw.auth ?? {}
  const serviceDefs = raw.services ?? {}

  if (Object.keys(serviceDefs).length === 0) {
    throw new Error(`${configPath} defines no services.`)
  }

  const authHeaders = new Map<string, string>()
  const services = new Map<string, Service>()

  for (const [key, def] of Object.entries(serviceDefs)) {
    if (!KINDS.has(def.kind)) {
      throw new Error(`service "${key}": kind must be one of ${[...KINDS].join(', ')} (got "${def.kind}").`)
    }
    if (def.kind === 'sqlite') {
      // A local file, not a URL: no auth, no TLS, no dispatcher. A path the process cannot
      // open throws here, at startup, like any other registry mistake.
      if (!def.file) throw new Error(`service "${key}": a sqlite service needs "file" (a path or ":memory:").`)
      const file = def.file === ':memory:' ? def.file : resolve(REPO_ROOT, def.file)
      services.set(key, {
        key,
        kind: def.kind,
        base: file,
        client: undefined,
        authHeader: undefined,
        agent: new Agent(),
        description: def.description,
        store: new SqliteStore(file),
        unavailable: undefined,
      })
      continue
    }

    if (!def.base || !/^https?:\/\//.test(def.base)) {
      throw new Error(`service "${key}": "base" must be an absolute http(s) URL.`)
    }
    if ((def.kind === 'odata' || def.kind === 'dyngw') && !def.client) {
      throw new Error(`service "${key}": an SAP service needs "client" (the sap-client value).`)
    }

    let authHeader: string | undefined
    let unavailable: string | undefined
    if (def.auth) {
      const authDef = authDefs[def.auth]
      if (!authDef) throw new Error(`service "${key}": auth "${def.auth}" is not defined in the "auth" block.`)
      try {
        if (!authHeaders.has(def.auth)) authHeaders.set(def.auth, buildAuthHeader(def.auth, authDef))
        authHeader = authHeaders.get(def.auth)
      } catch (err) {
        if (!(err instanceof MissingSecretError)) throw err
        unavailable = err.message
      }
    }

    // tlsVerify defaults to true. DS4 sets it false explicitly; nothing inherits that silently.
    const verify = def.tlsVerify !== false
    services.set(key, {
      key,
      kind: def.kind,
      base: def.base.replace(/\/+$/, ''),
      client: def.client,
      authHeader,
      agent: new Agent({ connect: { rejectUnauthorized: verify }, keepAliveTimeout: 30_000 }),
      description: def.description,
      store: undefined,
      unavailable,
    })
  }

  return services
}
