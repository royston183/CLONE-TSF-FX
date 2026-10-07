import { ApiError } from '@slc/api-client'

/**
 * MySQL first, SAP OData as the fallback.
 *
 * The custom Z tables have moved to MySQL behind the middleware, but the OData services
 * still exist and still project the same rows. Keeping them wired as a fallback means a
 * middleware outage, a table that has not been loaded yet, or a resource that was never
 * migrated degrades to the old path instead of showing an empty console.
 *
 * Reads and writes get different policies on purpose — see each function.
 */

/**
 * An aborted request is the caller cancelling, never a backend problem.
 *
 * The abort has to be dug out of the wrapper: `apiRequest` catches everything `fetch`
 * throws — including an AbortError — and rethrows it as `ApiError(…, 0, cause)`. So the
 * name on the error itself is 'ApiError' and the status is 0, which is indistinguishable
 * from a genuinely unreachable gateway unless the cause is checked. Missing this meant
 * every unmount fired a pointless SAP call, and would have let an aborted *write* be
 * replayed against SAP — the exact thing the write policy exists to prevent.
 */
export function isAbort(error: unknown): boolean {
  if ((error as { name?: string } | null)?.name === 'AbortError') return true
  const cause = (error as { body?: unknown } | null)?.body
  return (cause as { name?: string } | null)?.name === 'AbortError'
}

/**
 * For a read that has a cheaper source and a more expensive one: swallow a real failure so
 * the caller can try the fallback, but let an abort through.
 *
 * An abort is not a verdict on the source. Treating it as one made every unmounted render
 * declare the display view unavailable and run the whole fallback cascade — the base table
 * plus the four description masters the view exists to replace — for a result already being
 * discarded. Rethrowing leaves that to the caller's own abort handling.
 */
export function undefinedUnlessAborted(error: unknown): undefined {
  if (isAbort(error)) throw error
  return undefined
}

/**
 * Whether the middleware failed *before* it could act, which is the only case where
 * retrying a write elsewhere is safe.
 *
 * The status contract the gateway keeps makes this decidable: 502 is the gateway failing to
 * reach the backend at all, and 0 is the browser failing to reach the gateway. 503 is a
 * backend that is configured-but-unusable. In all three the request never executed.
 *
 * Anything else — 400, 404, 409 — means the middleware answered and rejected the call. That
 * is a real answer about the data, so retrying it against SAP would write a row MySQL had
 * just refused and leave the two stores disagreeing.
 */
export function isBackendUnreachable(error: unknown): boolean {
  if (isAbort(error)) return false
  if (error instanceof ApiError) return error.status === 0 || error.status === 502 || error.status === 503
  // Not an ApiError at all: a TypeError from fetch, a DNS failure. Nothing was sent.
  return true
}

export type ReadFallbackOptions<T> = {
  /**
   * Treat a successful-but-empty answer as a miss and try SAP too.
   *
   * On for master data, where empty reads as broken: `bpext` is migrated but holds no rows,
   * and an empty Bank list shows up as a dropdown with no options rather than as an error.
   * Off for transactional lists, where no rows is a legitimate answer and a second round
   * trip on every empty grid is waste.
   */
  isEmpty?: (value: T) => boolean
  /** Named in the console warning, so a silent degrade is still traceable. */
  label?: string
}

function warn(label: string | undefined, reason: string, error?: unknown): void {
  // Degrading quietly is the failure mode this whole fallback could introduce: the app keeps
  // working while nobody notices MySQL stopped answering. It must always leave a trace.
  console.warn(`[fallback] ${label ?? 'read'}: ${reason} — falling back to SAP OData`, error ?? '')
}

/**
 * Reads from MySQL, falling back to SAP OData on any failure.
 *
 * If the fallback also fails the *original* error is thrown, not the fallback's: MySQL is
 * the intended source, so its failure is the one worth reporting.
 */
export async function readWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  options: ReadFallbackOptions<T> = {},
): Promise<T> {
  let value: T
  try {
    value = await primary()
  } catch (error) {
    if (isAbort(error)) throw error
    warn(options.label, 'middleware read failed', error)
    try {
      return await fallback()
    } catch {
      throw error
    }
  }

  if (options.isEmpty?.(value)) {
    warn(options.label, 'middleware returned nothing')
    try {
      const alternative = await fallback()
      // Only prefer SAP's answer if it actually has something; otherwise empty really is
      // the truth and returning MySQL's result keeps the source consistent.
      if (!options.isEmpty(alternative)) return alternative
    } catch {
      // Empty from MySQL is still a valid answer. Fall through and return it.
    }
  }

  return value
}

/**
 * Writes to MySQL, falling back to SAP OData **only** when the middleware could not be
 * reached at all.
 *
 * Deliberately narrower than the read policy. A write that MySQL answered and rejected must
 * not be replayed against SAP — see `isBackendUnreachable`.
 */
export async function writeWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  label?: string,
): Promise<T> {
  try {
    return await primary()
  } catch (error) {
    if (!isBackendUnreachable(error)) throw error
    warn(label, 'middleware unreachable for write', error)
    return await fallback()
  }
}

/** The common emptiness test: a list with no entries. */
export const emptyList = (rows: readonly unknown[]): boolean => rows.length === 0
