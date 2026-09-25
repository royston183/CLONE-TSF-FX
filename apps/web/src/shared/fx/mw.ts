import { apiFetch, apiRequest, service } from '@slc/api-client'

/**
 * The FX screens' client for the SLC middleware.
 *
 * Unlike `shared/middleware.ts`, which translates SAP columns to the OData services' camel
 * case so the SLC consoles did not have to change, this speaks the raw column names
 * (ZMC_REF_NO, ZMC_STAT, …). The FX screens never had an OData contract to preserve — they
 * ran on seed data — so there is nothing to translate to, and the column names stay legible
 * against SE11 and the ABAP programs they mirror.
 */
const middlewareApi = service('middleware')

/** The middleware clamps every read to its MAX_PAGE_SIZE (500), so longer lists are paged. */
const PAGE = 500

/** A middleware row: DECIMAL arrives as a string, DATS as YYYY-MM-DD (or null), TIMS as HH:MM:SS. */
export type FxRow = Record<string, string | null>

/**
 * Column -> value. A key may carry an operator, `ZMC_STAT[in]` = '02,11', exactly as the
 * middleware reads it: eq ne gt gte lt lte like in between isNull isNotNull.
 */
export type FxFilter = Record<string, string>

type ListBody = { rows?: FxRow[] }
type WriteBody = { key?: Record<string, string>; assignedNumber?: string }

export async function fxList(
  resource: string,
  filter: FxFilter = {},
  options: { sort?: string | undefined; signal?: AbortSignal | undefined } = {},
): Promise<FxRow[]> {
  const rows: FxRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams(filter)
    if (options.sort) params.set('sort', options.sort)
    params.set('limit', String(PAGE))
    params.set('offset', String(offset))
    const body = await apiFetch<ListBody>(
      `${middlewareApi(`data/${resource}`)}?${params.toString()}`,
      options.signal ? { signal: options.signal } : undefined,
    )
    const page = body?.rows ?? []
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

/**
 * Inserts a row. Leaving a number-ranged key out (or blank) asks the middleware to draw it
 * from the SNRO-mirroring range; the number comes back as `assignedNumber`.
 */
export async function fxCreate(
  resource: string,
  data: Record<string, unknown>,
): Promise<{ key: Record<string, string>; assignedNumber: string | undefined }> {
  const response = await apiRequest<WriteBody>(middlewareApi(`data/${resource}`), { method: 'POST', body: { data } })
  return { key: response.data?.key ?? {}, assignedNumber: response.data?.assignedNumber }
}

/**
 * Updates one row. The key travels in the body next to `changes`: a key in the query string
 * reaches the writer as an empty key and fails MISSING_PRIMARY_KEY. Key columns are removed
 * from `changes`, since they are immutable.
 */
export async function fxUpdate(
  resource: string,
  key: Record<string, string>,
  changes: Record<string, unknown>,
): Promise<void> {
  const body: Record<string, unknown> = {}
  for (const [column, value] of Object.entries(changes)) if (!(column in key)) body[column] = value
  await apiFetch(middlewareApi(`data/${resource}`), { method: 'PATCH', body: { key, changes: body } })
}

/**
 * An aborted request is the caller cancelling, never a backend verdict. `apiRequest` rethrows
 * fetch's AbortError as `ApiError(…, 0, cause)`, so the cause has to be checked too —
 * otherwise an unmount reads as an outage and the screen swaps in its dummy rows.
 */
export function isAbort(error: unknown): boolean {
  if ((error as { name?: string } | null)?.name === 'AbortError') return true
  return ((error as { body?: { name?: string } } | null)?.body as { name?: string } | null)?.name === 'AbortError'
}

/** Whether a resource has a number range bound, so a blank key is safe to send. */
export async function fxHasNumberRange(resource: string, signal?: AbortSignal): Promise<boolean> {
  const meta = await apiFetch<{ numberRange?: { initialised?: boolean } | null }>(
    middlewareApi(`meta/resources/${resource}`),
    signal ? { signal } : undefined,
  )
  return !!meta?.numberRange?.initialised
}
