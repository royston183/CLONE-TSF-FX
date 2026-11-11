import { HttpError } from '@tsfx/lib/errors';
import { base64, sha256Hex } from '../crypto';
import { platform } from '../platform';
import { nextQuery, rowsOf, sapErrorMessage, serviceUrl } from './odata';

// SAP OData V4 client over this application's gateway (/api/<service>): the gateway adds the SAP account, the CSRF token
// and the session cookies, so none is handled here. Same exported surface as the relay-based client it replaces.

export interface SapService { key: string; base: string }
export interface SapSettings { client: string; timeoutMs: number }
interface ServiceState { token: string | null }
export interface SapConnection { username: string; authorization: string | null; services: Map<string, ServiceState> }
export interface SapRequest {
  path?: string;
  query?: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: string;
  etag?: string;
  contentType?: string;
  accept?: string;
  /** Prefer header, e.g. `odata.maxpagesize=5000` for server-driven paging. */
  prefer?: string;
  timeoutMs?: number;
  maxBytes?: number;
}
export interface SapResponse { status: number; headers: Headers; text: string }

export const REJECTED_MESSAGE = 'SAP rejected the SAP user or password. Further SAP calls are paused so the account is not locked. Enter the password in Settings → SAP Connection and choose Test & save to try again.';
const MAX_BYTES = 10 * 1024 * 1024;
const g = globalThis as { __sapRejected?: Set<string> };
const rejected = (g.__sapRejected ??= new Set<string>());
const fingerprint = (authorization: string) => sha256Hex(authorization);

export function newSapConnection(username: string, password: string): SapConnection {
  return { username, authorization: username && password ? `Basic ${base64(`${username}:${password}`)}` : null, services: new Map() };
}
export const isRejected = (conn: SapConnection): boolean => Boolean(conn.authorization && rejected.has(fingerprint(conn.authorization)));
export const clearRejected = (conn: SapConnection): void => { if (conn.authorization) rejected.delete(fingerprint(conn.authorization)); };

async function readBounded(response: Response, limit: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(502, `SAP response exceeds ${Math.max(1, Math.round(limit / 1048576))} MB. Narrow your query.`);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

export async function sapRequest(settings: SapSettings, conn: SapConnection, service: SapService, req: SapRequest = {}): Promise<SapResponse> {
  const method = req.method ?? 'GET';
  const write = method !== 'GET';
  let state = conn.services.get(service.key);
  if (!state) { state = { token: null }; conn.services.set(service.key, state); }
  const st = state;

  const send = async (tokenFetch: boolean): Promise<SapResponse> => {
    const path = tokenFetch ? '' : req.path ?? '';
    const url = serviceUrl(service.base, path, tokenFetch ? '' : req.query, settings.client);
    url.searchParams.delete('sap-client');
    const headers: Record<string, string> = { accept: path === '$metadata' ? 'application/xml' : (!tokenFetch && req.accept) || 'application/json' };
    if (!tokenFetch && req.body !== undefined) headers['content-type'] = req.contentType ?? 'application/json';
    if (!tokenFetch && req.etag) headers['if-match'] = req.etag;
    if (!tokenFetch && req.prefer) headers.prefer = req.prefer;
    let response: Response;
    try {
      response = await fetch(url, {
        ...platform().sapFetchInit,
        method: tokenFetch ? 'GET' : method,
        headers,
        body: tokenFetch ? undefined : req.body,
        redirect: 'manual',
        signal: AbortSignal.timeout((!tokenFetch && req.timeoutMs) || settings.timeoutMs)
      });
    } catch (error) {
      throw new HttpError(502, (error as Error)?.name === 'TimeoutError'
        ? 'SAP did not answer in time. Try again, or narrow your query.'
        : `Cannot reach the gateway at ${url.origin}. Is it running?`);
    }
    // A browser answers `redirect: 'manual'` with an opaque redirect (type 'opaqueredirect', status 0, no body), Node
    // with the 3xx itself: both mean SAP did nothing, so neither may pass as a successful answer.
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new HttpError(502, 'SAP redirected the request. Configure the final OData service URL; interactive SSO redirects are not supported.');
    }
    const text = await readBounded(response, req.maxBytes ?? MAX_BYTES);
    if (response.status === 401) throw new HttpError(401, 'SAP or the gateway answered 401. Sign in to the application again; if you are signed in, the SAP account of the gateway (SAP_DS4_100_NIIF_PASSWORD in .env) is not accepted by SAP.');
    return { status: response.status, headers: response.headers, text };
  };

  const fetchToken = async () => {
    const r = await send(true);
    if (r.status === 401) throw new HttpError(502, REJECTED_MESSAGE);
    if (r.status >= 400) throw new HttpError(502, `SAP rejected the CSRF handshake (HTTP ${r.status}). Check the service authorization.`);
    const token = r.headers.get('x-csrf-token');
    if (!token || token.toLowerCase() === 'required') throw new HttpError(502, 'SAP did not provide a CSRF token.');
    st.token = token;
  };

  void fetchToken; void write;
  return send(false);
}

function parseJson(text: string, what: string): unknown {
  try { return JSON.parse(text); } catch { throw new HttpError(502, `SAP did not return JSON for ${what}. Check the service URL and authentication.`); }
}

/**
 * Every row of an entity set. Paging is server-driven (`Prefer: odata.maxpagesize` + `@odata.nextLink`); `$top`
 * is never sent, because in OData V4 it caps the result. `$count=true` lets a short result fail loudly instead of
 * being shown as if it were complete.
 */
export async function readAll(settings: SapSettings, conn: SapConnection, service: SapService, entitySet: string, opts: { filter?: string; pageSize?: number; maxPages?: number } = {}): Promise<Record<string, unknown>[]> {
  const first = new URLSearchParams({ $count: 'true' });
  if (opts.filter) first.set('$filter', opts.filter);
  const prefer = `odata.maxpagesize=${opts.pageSize ?? 5000}`;
  const rows: Record<string, unknown>[] = [];
  let query = first.toString();
  let total: number | null = null;
  const maxPages = opts.maxPages ?? 50;
  for (let page = 0; page < maxPages && query; page++) {
    const r = await sapRequest(settings, conn, service, { path: entitySet, query, prefer });
    if (r.status === 401) throw new HttpError(502, REJECTED_MESSAGE);
    if (r.status >= 400) throw new HttpError(502, `${entitySet}: ${sapErrorMessage(r.status, r.text)}`);
    const data = parseJson(r.text, entitySet);
    const count = (data as { '@odata.count'?: unknown })['@odata.count'];
    if (total === null && typeof count === 'number') total = count;
    rows.push(...rowsOf(data));
    query = nextQuery(data);
  }
  if (query) throw new HttpError(502, `${entitySet} has more than ${maxPages} pages; narrow the query.`);
  if (total !== null && rows.length < total) throw new HttpError(502, `SAP returned ${rows.length} of ${total} ${entitySet} rows. Refresh, or narrow the query.`);
  return rows;
}

/** Reads `$metadata` to prove the account, authorization and service binding. `retry` clears a paused account. */
export async function checkService(settings: SapSettings, conn: SapConnection, service: SapService, { retry = false }: { retry?: boolean } = {}) {
  if (retry) clearRejected(conn);
  const r = await sapRequest(settings, conn, service, { path: '$metadata' });
  if (r.status === 401) throw new HttpError(401, 'SAP rejected the user name or password.');
  if (r.status === 403) throw new HttpError(403, 'Your SAP user is not authorized for this service.');
  // 404: this binding is not published on this system (it says nothing about the account).
  if (r.status === 404) throw new HttpError(404, `SAP returned HTTP 404 for the service metadata of ${service.key}: the service binding is not published on this system.`);
  if (r.status >= 400) throw new HttpError(502, `SAP returned HTTP ${r.status} for the service metadata. Check that the service binding is published.`);
  if (!/<(?:\w+:)?Edmx[\s>]/i.test(r.text)) throw new HttpError(502, 'SAP did not return OData metadata. Check the service URL.');
  return { service: service.key, connected: true as const, checkedAt: new Date().toISOString() };
}
