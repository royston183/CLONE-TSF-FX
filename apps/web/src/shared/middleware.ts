import { apiFetch, apiRequest, service } from '@slc/api-client'
import { COLUMNS } from './middleware-columns.ts'
import type { MiddlewareResource } from './middleware-columns.ts'

const middlewareApi = service('middleware')

/** Nothing pages past this; the middleware's own default is far smaller. */
const PAGE_LIMIT = 1000

/**
 * A middleware answer. Reads carry `rows`; writes carry the key they acted on.
 * `ok: false` never reaches here — the gateway turns a non-2xx into a thrown ApiError.
 */
type ListBody = { rows?: Array<Record<string, unknown>> }
type WriteBody = { key?: Record<string, string>; affectedRows?: number; assignedNumber?: string }

/**
 * ZOTTK_NO -> ZottkNo. The middleware serves SAP's raw column names while every form, grid
 * and payload in the app speaks the OData service's camel-cased ones, so rows are translated
 * at this boundary. That keeps the migration off SAP OData to the api layer: no grid column,
 * form field or type had to change.
 */
export function fieldOf(column: string): string {
  return column
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

/** Built once per resource, because the reverse direction cannot be computed. */
const reverse = new Map<MiddlewareResource, Map<string, string>>()

function columnsFor(resource: MiddlewareResource): Map<string, string> {
  let map = reverse.get(resource)
  if (!map) {
    map = new Map(COLUMNS[resource].map((column) => [fieldOf(column), column]))
    reverse.set(resource, map)
  }
  return map
}

function toRow<T>(raw: Record<string, unknown>): T {
  const row: Record<string, unknown> = {}
  for (const [column, value] of Object.entries(raw)) row[fieldOf(column)] = value
  return row as T
}

/**
 * Turns a payload keyed by app field names into one keyed by SAP columns. A field with no
 * column is dropped rather than sent: the middleware rejects an unknown field outright with
 * FIELD_NOT_ALLOWED, which would fail the whole save over a derived display-only value.
 */
function toColumns(resource: MiddlewareResource, payload: Record<string, unknown>): Record<string, unknown> {
  const map = columnsFor(resource)
  const body: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(payload)) {
    const column = map.get(field)
    if (column) body[column] = value
  }
  return body
}

/** `filter` is keyed by app field names, matching the rest of this module. */
export async function mwList<T>(
  resource: MiddlewareResource,
  filter?: Record<string, string>,
  signal?: AbortSignal,
): Promise<T[]> {
  const params = new URLSearchParams()
  for (const [column, value] of Object.entries(toColumns(resource, filter ?? {}))) {
    params.set(column, String(value))
  }
  params.set('limit', String(PAGE_LIMIT))
  const body = await apiFetch<ListBody>(
    `${middlewareApi(`data/${resource}`)}?${params.toString()}`,
    signal ? { signal } : undefined,
  )
  return (body?.rows ?? []).map((raw) => toRow<T>(raw))
}

/**
 * Creates a row and returns both the key the middleware wrote and, when the resource has a
 * number range configured, the number it allocated.
 *
 * Leaving the key out of `payload` is the supported way to ask for one: the writer treats a
 * missing *or blank* key field as "allocate", draws the next value from the range that
 * mirrors SAP's SNRO object, and reports it as `assignedNumber`.
 */
export async function mwCreate(
  resource: MiddlewareResource,
  payload: Record<string, unknown>,
): Promise<{ key: Record<string, string>; assignedNumber: string | undefined }> {
  const response = await apiRequest<WriteBody>(middlewareApi(`data/${resource}`), {
    method: 'POST',
    body: toColumns(resource, payload),
  })
  return { key: response.data?.key ?? {}, assignedNumber: response.data?.assignedNumber }
}

/**
 * Updates a row.
 *
 * The key travels in the body as `key`, alongside `changes` — not as query parameters. The
 * writer reads those two properties and nothing else, so a flat body with the key in the
 * query string reaches it as an empty key and fails with MISSING_PRIMARY_KEY before it ever
 * looks at a row.
 */
export async function mwUpdate(
  resource: MiddlewareResource,
  key: Record<string, string>,
  payload: Record<string, unknown>,
  /** Key fields to send in `changes` anyway, to move a row to a new key value. */
  changeKeyFields: readonly string[] = [],
  /**
   * Optimistic concurrency (BUILD_PLAN.md L9): the row's ZCHANGED_DATE / ZCHANGED_TIME as read. If the
   * row was written since, the middleware answers STALE_WRITE (409) instead of overwriting it.
   */
  ifMatch?: { changedDate: unknown; changedTime: unknown },
): Promise<void> {
  const columns = toColumns(resource, payload)
  const keyColumns = toColumns(resource, key)
  const moved = toColumns(resource, Object.fromEntries(changeKeyFields.map((field) => [field, payload[field]])))
  await apiFetch(middlewareApi(`data/${resource}`), {
    method: 'PATCH',
    body: {
      key: keyColumns,
      // A key column cannot be changed, and the consoles post the whole form back, so the
      // key is removed from the changes rather than rejected as KEY_FIELD_IMMUTABLE —
      // except the fields the caller deliberately changes.
      changes: { ...withoutKeys(columns, keyColumns), ...moved },
      // The middleware refuses any key column in changes (KEY_FIELD_IMMUTABLE) unless it is
      // named here; it then moves the row to the new key in the same UPDATE.
      ...(Object.keys(moved).length ? { rekey: Object.keys(moved) } : {}),
      ...(ifMatch ? { ifMatch: { ZCHANGED_DATE: ifMatch.changedDate ?? '', ZCHANGED_TIME: ifMatch.changedTime ?? '' } } : {}),
    },
  })
}

function withoutKeys(
  changes: Record<string, unknown>,
  key: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [column, value] of Object.entries(changes)) {
    if (!(column in key)) out[column] = value
  }
  return out
}

/**
 * Allocates the next key by reading the highest existing one and adding 1.
 *
 * TEMPORARY. SAP's number range used to assign this server-side and atomically; the
 * middleware's generic writer requires the caller to supply the key and exposes no allocator
 * (every /next, /number and /numberRange route answers RESOURCE_NOT_FOUND, and POSTing a
 * blank key inserts a blank-keyed row rather than generating one). Two people creating at the
 * same moment therefore get the same number. Point this at the real allocator as soon as its
 * route is known — every caller goes through here, so that is a one-function change.
 */
export async function nextNumber(resource: MiddlewareResource, keyField: string): Promise<string> {
  const rows = await mwList<Record<string, string>>(resource)
  return nextKey(rows.map((row) => String(row[keyField] ?? '')))
}

/** The allocation itself, kept separate from the read so it can be tested directly. */
export function nextKey(existing: readonly string[]): string {
  // Keys are not always bare digits — Deal IDs run DEAL0001, ticket numbers run 100001 — so a
  // leading non-digit prefix is carried through rather than assumed away, and the numeric tail
  // keeps the width it already had.
  let prefix = ''
  let highest = 0
  // Zero, not a default width: the padding has to come from the keys in use, or a four-digit
  // series like DEAL0001 gets padded out to DEAL009002.
  let width = 0
  for (const key of existing) {
    const match = /^(\D*)(\d+)$/.exec(key.trim())
    if (!match) continue
    const [, rowPrefix = '', digits = ''] = match
    const value = Number(digits)
    if (value > highest) {
      highest = value
      prefix = rowPrefix
    }
    width = Math.max(width, digits.length)
  }
  return prefix + String(highest + 1).padStart(width || 6, '0')
}
