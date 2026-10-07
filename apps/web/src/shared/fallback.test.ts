import { deepStrictEqual, rejects, strictEqual } from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { ApiError } from '@slc/api-client'
import { emptyList, isBackendUnreachable, readWithFallback, writeWithFallback } from './fallback.ts'

// Every degrade warns, which would otherwise flood the test output.
const realWarn = console.warn
beforeEach(() => {
  console.warn = () => {}
})
afterEach(() => {
  console.warn = realWarn
})

const abort = (): Error => Object.assign(new Error('aborted'), { name: 'AbortError' })

describe('isBackendUnreachable', () => {
  it('is true only when the request cannot have executed', () => {
    strictEqual(isBackendUnreachable(new ApiError('gateway down', 0, null)), true)
    strictEqual(isBackendUnreachable(new ApiError('cannot reach backend', 502, null)), true)
    strictEqual(isBackendUnreachable(new ApiError('not configured', 503, null)), true)
    strictEqual(isBackendUnreachable(new TypeError('Failed to fetch')), true)
  })

  it('is false when the middleware answered and rejected, so a write is never replayed on SAP', () => {
    // Replaying these against OData would write a row MySQL had just refused and leave the
    // two stores disagreeing.
    strictEqual(isBackendUnreachable(new ApiError('bad field', 400, null)), false)
    strictEqual(isBackendUnreachable(new ApiError('no such row', 404, null)), false)
    strictEqual(isBackendUnreachable(new ApiError('duplicate key', 409, null)), false)
  })

  it('is false for an abort, which is the caller cancelling', () => {
    strictEqual(isBackendUnreachable(abort()), false)
  })

  it('sees an abort wrapped by apiRequest as ApiError(status 0), not as an outage', () => {
    // apiRequest catches everything fetch throws — including AbortError — and rethrows it
    // as ApiError(…, 0, cause). Without unwrapping, an unmount looks exactly like a dead
    // gateway and a cancelled write would be replayed against SAP.
    strictEqual(isBackendUnreachable(new ApiError('Cannot reach the SLC gateway.', 0, abort())), false)
  })
})

describe('readWithFallback', () => {
  it('returns the middleware answer and never calls SAP when MySQL works', async () => {
    let odataCalls = 0
    const rows = await readWithFallback(
      async () => ['mysql'],
      async () => {
        odataCalls++
        return ['odata']
      },
    )
    deepStrictEqual(rows, ['mysql'])
    strictEqual(odataCalls, 0)
  })

  it('falls back to SAP when the middleware read fails', async () => {
    const rows = await readWithFallback(
      async () => {
        throw new ApiError('middleware down', 502, null)
      },
      async () => ['odata'],
    )
    deepStrictEqual(rows, ['odata'])
  })

  it('falls back on ANY read error, including one the middleware answered', async () => {
    // Unlike a write, re-reading elsewhere cannot corrupt anything.
    const rows = await readWithFallback(
      async () => {
        throw new ApiError('bad request', 400, null)
      },
      async () => ['odata'],
    )
    deepStrictEqual(rows, ['odata'])
  })

  it('reports the middleware error, not the fallback error, when both fail', async () => {
    // MySQL is the intended source, so its failure is the one worth surfacing.
    await rejects(
      readWithFallback(
        async () => {
          throw new ApiError('middleware exploded', 502, null)
        },
        async () => {
          throw new ApiError('sap also down', 500, null)
        },
      ),
      /middleware exploded/,
    )
  })

  it('rethrows an abort immediately without touching SAP', async () => {
    let odataCalls = 0
    await rejects(
      readWithFallback(
        async () => {
          throw abort()
        },
        async () => {
          odataCalls++
          return []
        },
      ),
      /aborted/,
    )
    strictEqual(odataCalls, 0)
  })

  it('leaves an empty result alone unless isEmpty is given', async () => {
    let odataCalls = 0
    const rows = await readWithFallback(
      async () => [] as string[],
      async () => {
        odataCalls++
        return ['odata']
      },
    )
    deepStrictEqual(rows, [])
    // No tickets is a legitimate answer; a second round trip on every empty grid is waste.
    strictEqual(odataCalls, 0)
  })

  it('treats empty master data as a miss when isEmpty is given', async () => {
    // bpext is migrated but holds no rows, so an empty Bank list reads as broken.
    const rows = await readWithFallback(
      async () => [] as string[],
      async () => ['odata'],
      { isEmpty: emptyList },
    )
    deepStrictEqual(rows, ['odata'])
  })

  it('keeps the empty middleware answer when SAP is empty too', async () => {
    const rows = await readWithFallback(async () => [] as string[], async () => [] as string[], {
      isEmpty: emptyList,
    })
    deepStrictEqual(rows, [])
  })

  it('keeps the empty middleware answer when the SAP fallback throws', async () => {
    const rows = await readWithFallback(
      async () => [] as string[],
      async () => {
        throw new ApiError('sap down', 502, null)
      },
      { isEmpty: emptyList },
    )
    deepStrictEqual(rows, [])
  })
})

describe('writeWithFallback', () => {
  it('writes to MySQL and never touches SAP on success', async () => {
    let odataCalls = 0
    const key = await writeWithFallback(
      async () => '100029',
      async () => {
        odataCalls++
        return 'sap'
      },
    )
    strictEqual(key, '100029')
    strictEqual(odataCalls, 0)
  })

  it('falls back only when the middleware was unreachable', async () => {
    const key = await writeWithFallback(
      async () => {
        throw new ApiError('cannot reach backend', 502, null)
      },
      async () => 'sap',
    )
    strictEqual(key, 'sap')
  })

  it('rethrows a rejection the middleware issued rather than writing it to SAP', async () => {
    // The critical case: a 409 means MySQL has the row. Writing it to SAP as well would
    // diverge the two stores.
    let odataCalls = 0
    await rejects(
      writeWithFallback(
        async () => {
          throw new ApiError('duplicate key', 409, null)
        },
        async () => {
          odataCalls++
          return 'sap'
        },
      ),
      /duplicate key/,
    )
    strictEqual(odataCalls, 0)
  })

  it('does not replay an aborted write', async () => {
    let odataCalls = 0
    await rejects(
      writeWithFallback(
        async () => {
          throw abort()
        },
        async () => {
          odataCalls++
          return 'sap'
        },
      ),
      /aborted/,
    )
    strictEqual(odataCalls, 0)
  })
})
