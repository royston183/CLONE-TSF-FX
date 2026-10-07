import { request } from 'undici'
import type { Service } from '../config.ts'
import { cookieHeader, fetchCsrfToken, firstHeader, serviceUrl, sessionFor, storeCookies } from './session.ts'

export type ProxyResult = {
  status: number
  headers: Record<string, string>
  body: Buffer
}

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/**
 * Headers worth returning to the browser. OData-EntityId and Location carry the key of a
 * just-created entity — OTTK and DTTK read them to recover the generated ticket number
 * after a POST, so dropping them would silently break creation.
 */
const PASSTHROUGH = ['content-type', 'odata-entityid', 'location', 'odata-version', 'etag']

/**
 * Forwards one call to a backend, injecting credentials and the SAP CSRF token so the
 * browser never holds either. Same-origin by construction, so no CORS config is needed
 * on the SAP Gateway.
 *
 * Status contract, unchanged from proxy.py because the frontend depends on it:
 * 502 means the gateway could not reach the backend at all (network/TLS/timeout) and is
 * the ONLY status that means "disconnected". Every other status, success or failure,
 * means the backend answered — a 400 on a bad save must not paint the UI as offline.
 */
export async function proxyRequest(
  service: Service,
  method: string,
  path: string,
  query: string,
  body: Buffer | undefined,
  contentType: string | undefined,
  /** A managed RAP entity with an ETag refuses an update without If-Match (428), so it is forwarded. */
  ifMatch?: string | undefined,
  /** What the caller accepts. JSON unless it asks for XML: $metadata is only served as XML (406 otherwise). */
  accept?: string | undefined,
): Promise<ProxyResult> {
  const session = sessionFor(service.key)
  const url = serviceUrl(service, path, query)
  const needsToken = service.kind !== 'rest' && WRITE_METHODS.has(method)

  if (needsToken && !session.token) await fetchCsrfToken(service)

  const attempt = async (): Promise<ProxyResult> => {
    const headers: Record<string, string> = { accept: accept && /xml/i.test(accept) ? accept : 'application/json' }
    if (service.authHeader) headers['authorization'] = service.authHeader
    if (contentType) headers['content-type'] = contentType
    if (ifMatch && WRITE_METHODS.has(method)) headers['if-match'] = ifMatch
    if (needsToken && session.token) headers['x-csrf-token'] = session.token
    const cookie = await cookieHeader(session, url)
    if (cookie) headers['cookie'] = cookie

    const res = await request(url, {
      method: method as 'GET',
      headers,
      ...(body ? { body } : {}),
      dispatcher: service.agent,
      headersTimeout: 30_000,
      bodyTimeout: 30_000,
    })
    await storeCookies(session, url, res.headers['set-cookie'])

    const out: Record<string, string> = {}
    for (const name of PASSTHROUGH) {
      const value = firstHeader(res.headers[name] as string | string[] | undefined)
      if (value) out[name] = value
    }
    return { status: res.statusCode, headers: out, body: Buffer.from(await res.body.arrayBuffer()) }
  }

  try {
    const first = await attempt()
    // A 403 on a write is SAP's way of saying the CSRF token expired. Fetch a fresh one and
    // retry exactly once; a second 403 is a real authorisation failure and is returned as-is.
    if (needsToken && first.status === 403) {
      await fetchCsrfToken(service)
      return await attempt()
    }
    return first
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Shaped like an OData error so the client's existing error extraction finds the message.
    const payload = Buffer.from(JSON.stringify({ error: { message: { value: message } } }))
    return { status: 502, headers: { 'content-type': 'application/json' }, body: payload }
  }
}
